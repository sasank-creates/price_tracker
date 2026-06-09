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
    console.log(`[COMPONENT: Home] loadProducts triggered (silent=${silent})`);
    if (!silent) setRefreshing(true);
    try {
      const data = await fetchProducts();
      setProducts(data);
      const updatedTime = new Date();
      setLastUpdated(updatedTime);
      console.log(`[COMPONENT: Home] loadProducts successful: updated ${data.length} products state at ${updatedTime.toISOString()}`);
    } catch (err) {
      console.error('[COMPONENT: Home] loadProducts failed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    console.log('[COMPONENT: Home] Mounted. Fetching initial product list.');
    loadProducts();
    return () => console.log('[COMPONENT: Home] Unmounted.');
  }, [loadProducts]);

  // Auto-poll every 30 seconds to keep prices fresh
  useEffect(() => {
    console.log('[COMPONENT: Home] Initializing 30s auto-polling interval.');
    const interval = setInterval(() => {
      console.log('[COMPONENT: Home] Auto-polling interval tick triggered.');
      loadProducts(true); // silent = don't show spinner
    }, 30000);
    return () => {
      console.log('[COMPONENT: Home] Cleaning up auto-polling interval.');
      clearInterval(interval);
    };
  }, [loadProducts]);

  const handleProductAdded = (product) => {
    console.log('[COMPONENT: Home] handleProductAdded callback received:', product);
    // Add the new product optimistically, then refresh to get real data
    setProducts((prev) => [product, ...prev]);
    console.log('[COMPONENT: Home] Optimistically added new product to local state. Scheduling reload in 5 seconds...');
    // Re-fetch after 5s so the newly-added product name+price shows once scraper runs
    setTimeout(() => {
      console.log('[COMPONENT: Home] Delayed reload running...');
      loadProducts(true);
    }, 5000);
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
          onRefresh={() => {
            console.log('[COMPONENT: Home] User triggered manual refresh via ProductList header');
            loadProducts(false);
          }}
          refreshing={refreshing}
          lastUpdated={lastUpdated}
        />
      )}
    </>
  );
}
