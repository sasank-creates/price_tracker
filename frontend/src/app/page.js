'use client';

import { useState, useEffect, useCallback } from 'react';
import ProductForm from '@/components/ProductForm';
import ProductList from '@/components/ProductList';
import { fetchProducts } from '@/lib/api';

export default function Home() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadProducts = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const data = await fetchProducts();
      setProducts(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Auto-poll every 30 seconds to keep prices fresh
  useEffect(() => {
    const interval = setInterval(() => {
      loadProducts(true); // silent = don't show spinner
    }, 30000);
    return () => clearInterval(interval);
  }, [loadProducts]);

  const handleProductAdded = (product) => {
    // Add the new product optimistically, then refresh to get real data
    setProducts((prev) => [product, ...prev]);
    // Re-fetch after 5s so the newly-added product name+price shows once scraper runs
    setTimeout(() => loadProducts(true), 5000);
  };

  return (
    <>
      <ProductForm onProductAdded={handleProductAdded} />

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <span className="spinner" />
        </div>
      ) : (
        <ProductList
          products={products}
          onRefresh={() => loadProducts(false)}
          refreshing={refreshing}
          lastUpdated={lastUpdated}
        />
      )}
    </>
  );
}
