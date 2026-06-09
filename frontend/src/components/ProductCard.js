'use client';

import { useState, useEffect, useRef } from 'react';
import { checkNow, deleteProduct, updateProduct, fetchProduct } from '@/lib/api';
import PriceChart from './PriceChart';

const STATUS_MAP = {
  PENDING: { label: 'Pending', class: 'status-pending' },
  ABOVE_TARGET: { label: 'Above Target', class: 'status-above' },
  TARGET_REACHED: { label: 'Target Reached!', class: 'status-reached' },
  SCRAPE_FAILED: { label: 'Scrape Failed', class: 'status-failed' },
};

function Toast({ message, type, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className={`toast toast-${type}`} style={{ zIndex: 9999 }}>
      {message}
    </div>
  );
}

export default function ProductCard({ product: initialProduct, onRefresh }) {
  const [product, setProduct] = useState(initialProduct);
  const [checking, setChecking] = useState(false);
  const [checkProgress, setCheckProgress] = useState(0); // 0-100
  const [editing, setEditing] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [toast, setToast] = useState(null);
  const [editForm, setEditForm] = useState({
    expectedPrice: initialProduct.expectedPrice,
    checkInterval: initialProduct.checkInterval,
  });
  const pollRef = useRef(null);
  const progressRef = useRef(null);

  // Keep local product in sync with parent updates (e.g. auto-refresh from page.js)
  useEffect(() => {
    console.log(`[COMPONENT: ProductCard (${product.id})] Props updated. Syncing local state.`);
    setProduct(initialProduct);
  }, [initialProduct]);

  useEffect(() => {
    console.log(`[COMPONENT: ProductCard (${product.id})] Mounted.`);
    return () => {
      console.log(`[COMPONENT: ProductCard (${product.id})] Unmounted.`);
      clearInterval(pollRef.current);
      clearInterval(progressRef.current);
    };
  }, [product.id]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  /**
   * Trigger a manual price check.
   * The scraper takes 30-45 seconds, so we:
   * 1. Call the /check endpoint (fire-and-forget on the backend)
   * 2. Show a progress bar counting up to ~45s
   * 3. Poll /products/:id every 5s for up to 60s until currentPrice appears or changes
   */
  const handleCheck = async () => {
    if (checking) return;
    console.log(`[COMPONENT: ProductCard (${product.id})] Manual check initiated.`);
    setChecking(true);
    setCheckProgress(0);

    try {
      console.log(`[COMPONENT: ProductCard (${product.id})] Dispatching checkNow API client request...`);
      await checkNow(product.id);
      console.log(`[COMPONENT: ProductCard (${product.id})] checkNow API request resolved. Starting progress animation & poll loop...`);
    } catch (err) {
      console.error(`[COMPONENT: ProductCard (${product.id})] checkNow API request failed:`, err.message);
      setChecking(false);
      showToast('Failed to trigger check', 'error');
      return;
    }

    // Animate progress bar over ~45 seconds
    const startTime = Date.now();
    const TOTAL_MS = 45000;
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(95, (elapsed / TOTAL_MS) * 100);
      setCheckProgress(pct);
    }, 500);

    const prevPrice = product.currentPrice;

    // Poll every 5s for up to 60s to detect the updated price
    let attempts = 0;
    const MAX_ATTEMPTS = 12; // 12 × 5s = 60s
    pollRef.current = setInterval(async () => {
      attempts++;
      console.log(`[COMPONENT: ProductCard (${product.id})] Poll attempt ${attempts}/${MAX_ATTEMPTS}...`);
      try {
        const updated = await fetchProduct(product.id);
        // Price changed or status changed from PENDING
        const priceChanged = updated.currentPrice !== prevPrice && updated.currentPrice !== null;
        const statusChanged = updated.status !== 'PENDING' && product.status === 'PENDING';
        
        console.debug(`[COMPONENT: ProductCard (${product.id})] Poll response: status=${updated.status}, currentPrice=${updated.currentPrice} (previousPrice=${prevPrice})`);
        
        if (priceChanged || statusChanged || updated.status === 'SCRAPE_FAILED') {
          console.log(`[COMPONENT: ProductCard (${product.id})] Price/status change detected. Stopping poll loop.`);
          clearInterval(pollRef.current);
          clearInterval(progressRef.current);
          setCheckProgress(100);
          setProduct(updated);
          setTimeout(() => {
            setChecking(false);
            setCheckProgress(0);
            if (onRefresh) onRefresh();
          }, 600);

          if (updated.currentPrice !== null) {
            showToast(`💰 Price: ₹${updated.currentPrice.toLocaleString('en-IN')}`, 'success');
          } else if (updated.status === 'SCRAPE_FAILED') {
            showToast('⚠️ Could not extract price', 'error');
          }
          return;
        }
      } catch (pollErr) {
        console.warn(`[COMPONENT: ProductCard (${product.id})] Poll check request error:`, pollErr.message);
      }

      if (attempts >= MAX_ATTEMPTS) {
        console.warn(`[COMPONENT: ProductCard (${product.id})] Max check poll attempts reached without finding change.`);
        clearInterval(pollRef.current);
        clearInterval(progressRef.current);
        setChecking(false);
        setCheckProgress(0);
        showToast('Check is taking longer than expected — it will update soon', 'success');
        if (onRefresh) onRefresh();
      }
    }, 5000);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this product?')) return;
    console.log(`[COMPONENT: ProductCard (${product.id})] Deletion requested.`);
    try {
      await deleteProduct(product.id);
      console.log(`[COMPONENT: ProductCard (${product.id})] Deleted successfully.`);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(`[COMPONENT: ProductCard (${product.id})] Deletion failed:`, err.message);
      showToast('Failed to delete', 'error');
    }
  };

  const handleEdit = async () => {
    console.log(`[COMPONENT: ProductCard (${product.id})] Submitting updates:`, editForm);
    try {
      const updated = await updateProduct(product.id, {
        expectedPrice: parseFloat(editForm.expectedPrice),
        checkInterval: parseInt(editForm.checkInterval),
      });
      console.log(`[COMPONENT: ProductCard (${product.id})] Update succeeded:`, updated);
      setProduct(updated);
      setEditing(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(`[COMPONENT: ProductCard (${product.id})] Update failed:`, err.message);
      showToast('Failed to update', 'error');
    }
  };

  const status = STATUS_MAP[product.status] || STATUS_MAP.PENDING;

  const lastChecked = product.lastCheckedAt
    ? new Date(product.lastCheckedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    : 'Never';

  const priceDiff =
    product.currentPrice != null
      ? product.currentPrice - product.expectedPrice
      : null;

  return (
    <>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDone={() => setToast(null)}
        />
      )}

      <div className="product-card">
        {/* Progress bar when checking */}
        {checking && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0,
            height: '3px',
            background: 'var(--border)',
            borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${checkProgress}%`,
              background: 'var(--accent-gradient)',
              transition: 'width 0.5s linear',
            }} />
          </div>
        )}

        <div className="product-card-header">
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span className="product-name">{product.name || 'Untitled Product'}</span>
              <span className={`status-badge ${status.class}`}>{status.label}</span>
            </div>
            <p className="product-url">
              <a
                href={product.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
                onMouseEnter={e => e.target.style.color = 'var(--accent-primary-hover)'}
                onMouseLeave={e => e.target.style.color = 'var(--text-muted)'}
              >
                {product.url.length > 70 ? product.url.slice(0, 70) + '…' : product.url}
              </a>
            </p>
          </div>
          <div className="product-actions">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                console.log(`[COMPONENT: ProductCard (${product.id})] Toggled price chart visibility: ${!showChart}`);
                setShowChart(!showChart);
              }}
              title="Price history"
            >
              📈
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleCheck}
              disabled={checking}
              title={checking ? 'Checking price…' : 'Check now'}
              style={{ minWidth: 60 }}
            >
              {checking ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="spinner" style={{ width: 12, height: 12 }} />
                  <span style={{ fontSize: 10 }}>{Math.round(checkProgress)}%</span>
                </span>
              ) : '🔄'}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                console.log(`[COMPONENT: ProductCard (${product.id})] Toggled edit mode: ${!editing}`);
                setEditing(!editing);
              }}
              title="Edit"
            >
              ✏️
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={handleDelete}
              title="Delete"
            >
              🗑️
            </button>
          </div>
        </div>

        <div className="product-meta">
          <div className="product-meta-item">
            <span className="meta-label">Current Price</span>
            <span className="meta-value price-current">
              {checking && product.currentPrice == null ? (
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Fetching…</span>
              ) : product.currentPrice != null ? (
                `₹${product.currentPrice.toLocaleString('en-IN')}`
              ) : (
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>—</span>
              )}
            </span>
          </div>
          <div className="product-meta-item">
            <span className="meta-label">Target Price</span>
            <span className="meta-value price-target">₹{product.expectedPrice.toLocaleString('en-IN')}</span>
          </div>
          {priceDiff !== null && (
            <div className="product-meta-item">
              <span className="meta-label">Difference</span>
              <span className="meta-value" style={{
                fontSize: 16,
                color: priceDiff <= 0 ? 'var(--success)' : 'var(--warning)',
              }}>
                {priceDiff <= 0
                  ? `₹${Math.abs(priceDiff).toLocaleString('en-IN')} below`
                  : `₹${priceDiff.toLocaleString('en-IN')} above`}
              </span>
            </div>
          )}
          <div className="product-meta-item">
            <span className="meta-label">Interval</span>
            <span className="meta-value" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              Every {product.checkInterval} min
            </span>
          </div>
          <div className="product-meta-item">
            <span className="meta-label">Last Checked</span>
            <span className="meta-value" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {lastChecked}
            </span>
          </div>
        </div>

        {/* Edit form */}
        {editing && (
          <div style={{
            marginTop: '16px',
            padding: '16px',
            background: 'var(--bg-input)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
          }}>
            <div className="form-group">
              <label className="form-label">Target Price</label>
              <input
                className="form-input"
                type="number"
                value={editForm.expectedPrice}
                onChange={(e) => setEditForm({ ...editForm, expectedPrice: e.target.value })}
                style={{ width: '140px' }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Interval (min)</label>
              <input
                className="form-input"
                type="number"
                value={editForm.checkInterval}
                onChange={(e) => setEditForm({ ...editForm, checkInterval: e.target.value })}
                style={{ width: '120px' }}
              />
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleEdit}>Save</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        )}

        {/* Price chart */}
        {showChart && <PriceChart productId={product.id} expectedPrice={product.expectedPrice} />}
      </div>
    </>
  );
}
