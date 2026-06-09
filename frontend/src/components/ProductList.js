'use client';

import ProductCard from './ProductCard';

export default function ProductList({ products, onRefresh, refreshing, lastUpdated }) {
  const timeStr = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  if (!products || products.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🔍</div>
        <h3 className="empty-title">No products tracked yet</h3>
        <p>Add a product URL above to start monitoring prices.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="section-title">
        <span>📦 Tracked Products ({products.length})</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {timeStr && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Updated {timeStr}
            </span>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={onRefresh}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {refreshing ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '🔄'}
            Refresh
          </button>
        </div>
      </div>
      <div className="product-list">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} onRefresh={onRefresh} />
        ))}
      </div>
    </div>
  );
}
