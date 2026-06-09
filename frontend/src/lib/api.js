const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

/**
 * Fetch all products, optionally filtered by email
 */
export async function fetchProducts(email = '') {
  const params = email ? `?email=${encodeURIComponent(email)}` : '';
  const res = await fetch(`${API_BASE}/products${params}`);
  if (!res.ok) throw new Error('Failed to fetch products');
  return res.json();
}

/**
 * Fetch a single product with details
 */
export async function fetchProduct(id) {
  const res = await fetch(`${API_BASE}/products/${id}`);
  if (!res.ok) throw new Error('Failed to fetch product');
  return res.json();
}

/**
 * Add a new product to monitor
 */
export async function addProduct(data) {
  const res = await fetch(`${API_BASE}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to add product');
  }
  return res.json();
}

/**
 * Update a product
 */
export async function updateProduct(id, data) {
  const res = await fetch(`${API_BASE}/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update product');
  return res.json();
}

/**
 * Delete a product
 */
export async function deleteProduct(id) {
  const res = await fetch(`${API_BASE}/products/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete product');
  return res.json();
}

/**
 * Trigger manual price check
 */
export async function checkNow(id) {
  const res = await fetch(`${API_BASE}/products/${id}/check`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to trigger check');
  return res.json();
}

/**
 * Fetch price history for a product
 */
export async function fetchHistory(id) {
  const res = await fetch(`${API_BASE}/products/${id}/history`);
  if (!res.ok) throw new Error('Failed to fetch history');
  return res.json();
}

/**
 * Fetch admin stats
 */
export async function fetchAdminStats() {
  const res = await fetch(`${API_BASE}/admin/stats`);
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

/**
 * Fetch failure logs
 */
export async function fetchFailures(page = 1) {
  const res = await fetch(`${API_BASE}/admin/failures?page=${page}`);
  if (!res.ok) throw new Error('Failed to fetch failures');
  return res.json();
}
