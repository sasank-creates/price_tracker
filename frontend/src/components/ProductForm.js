'use client';

import { useState, useEffect } from 'react';
import { addProduct } from '@/lib/api';

export default function ProductForm({ onProductAdded }) {
  const [form, setForm] = useState({
    url: '',
    expectedPrice: '',
    email: '',
    checkInterval: '60',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Lifecycle log
  useEffect(() => {
    console.log('[COMPONENT: ProductForm] Mounted.');
    return () => console.log('[COMPONENT: ProductForm] Unmounted.');
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('[COMPONENT: ProductForm] Submitting new track request:', form);
    setError('');
    setLoading(true);

    try {
      const product = await addProduct({
        url: form.url,
        expectedPrice: parseFloat(form.expectedPrice),
        email: form.email,
        checkInterval: parseInt(form.checkInterval),
      });
      console.log('[COMPONENT: ProductForm] Product track registration succeeded:', product);
      setForm({ url: '', expectedPrice: '', email: '', checkInterval: '60' });
      if (onProductAdded) onProductAdded(product);
    } catch (err) {
      console.error('[COMPONENT: ProductForm] Product track registration failed:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-card">
      <h2 className="form-title">
        <span>➕</span> Track a New Product
      </h2>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group full-width">
            <label className="form-label" htmlFor="product-url">Product URL</label>
            <input
              id="product-url"
              className="form-input"
              type="url"
              placeholder="https://www.amazon.in/dp/..."
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="expected-price">Target Price (₹)</label>
            <input
              id="expected-price"
              className="form-input"
              type="number"
              placeholder="999"
              min="1"
              step="0.01"
              value={form.expectedPrice}
              onChange={(e) => setForm({ ...form, expectedPrice: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="check-interval">Check Every (minutes)</label>
            <input
              id="check-interval"
              className="form-input"
              type="number"
              placeholder="60"
              min="5"
              value={form.checkInterval}
              onChange={(e) => setForm({ ...form, checkInterval: e.target.value })}
              required
            />
          </div>
          <div className="form-group full-width">
            <label className="form-label" htmlFor="user-email">Email for Alerts</label>
            <input
              id="user-email"
              className="form-input"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
        </div>

        {error && (
          <p style={{ color: 'var(--danger)', fontSize: '13px', marginTop: '12px' }}>{error}</p>
        )}

        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <span className="spinner" /> : null}
            {loading ? 'Adding...' : 'Start Tracking'}
          </button>
        </div>
      </form>
    </div>
  );
}
