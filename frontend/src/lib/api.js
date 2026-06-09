const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

/**
 * Fetch all products, optionally filtered by email
 */
export async function fetchProducts(email = '') {
  const params = email ? `?email=${encodeURIComponent(email)}` : '';
  const url = `${API_BASE}/products${params}`;
  console.log(`[API CLIENT] fetchProducts called: email="${email}"`, { url });
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[API CLIENT] fetchProducts response not OK: status=${res.status}`);
      throw new Error('Failed to fetch products');
    }
    const data = await res.json();
    console.log(`[API CLIENT] fetchProducts success: fetched ${data.length} products`);
    return data;
  } catch (error) {
    console.error(`[API CLIENT] fetchProducts error: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch a single product with details
 */
export async function fetchProduct(id) {
  const url = `${API_BASE}/products/${id}`;
  console.log(`[API CLIENT] fetchProduct called: id="${id}"`, { url });
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[API CLIENT] fetchProduct response not OK: status=${res.status}`);
      throw new Error('Failed to fetch product');
    }
    const data = await res.json();
    console.log(`[API CLIENT] fetchProduct success:`, data);
    return data;
  } catch (error) {
    console.error(`[API CLIENT] fetchProduct error: ${error.message}`);
    throw error;
  }
}

/**
 * Add a new product to monitor
 */
export async function addProduct(data) {
  const url = `${API_BASE}/products`;
  console.log(`[API CLIENT] addProduct called:`, { url, payload: data });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      console.error(`[API CLIENT] addProduct response not OK: status=${res.status}, error=`, err);
      throw new Error(err.error || 'Failed to add product');
    }
    const responseData = await res.json();
    console.log(`[API CLIENT] addProduct success:`, responseData);
    return responseData;
  } catch (error) {
    console.error(`[API CLIENT] addProduct error: ${error.message}`);
    throw error;
  }
}

/**
 * Update a product
 */
export async function updateProduct(id, data) {
  const url = `${API_BASE}/products/${id}`;
  console.log(`[API CLIENT] updateProduct called: id="${id}"`, { url, payload: data });
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      console.error(`[API CLIENT] updateProduct response not OK: status=${res.status}`);
      throw new Error('Failed to update product');
    }
    const responseData = await res.json();
    console.log(`[API CLIENT] updateProduct success:`, responseData);
    return responseData;
  } catch (error) {
    console.error(`[API CLIENT] updateProduct error: ${error.message}`);
    throw error;
  }
}

/**
 * Delete a product
 */
export async function deleteProduct(id) {
  const url = `${API_BASE}/products/${id}`;
  console.log(`[API CLIENT] deleteProduct called: id="${id}"`, { url });
  try {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) {
      console.error(`[API CLIENT] deleteProduct response not OK: status=${res.status}`);
      throw new Error('Failed to delete product');
    }
    const responseData = await res.json();
    console.log(`[API CLIENT] deleteProduct success:`, responseData);
    return responseData;
  } catch (error) {
    console.error(`[API CLIENT] deleteProduct error: ${error.message}`);
    throw error;
  }
}

/**
 * Trigger manual price check
 */
export async function checkNow(id) {
  const url = `${API_BASE}/products/${id}/check`;
  console.log(`[API CLIENT] checkNow called: id="${id}"`, { url });
  try {
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) {
      console.error(`[API CLIENT] checkNow response not OK: status=${res.status}`);
      throw new Error('Failed to trigger check');
    }
    const responseData = await res.json();
    console.log(`[API CLIENT] checkNow success:`, responseData);
    return responseData;
  } catch (error) {
    console.error(`[API CLIENT] checkNow error: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch price history for a product
 */
export async function fetchHistory(id) {
  const url = `${API_BASE}/products/${id}/history`;
  console.log(`[API CLIENT] fetchHistory called: id="${id}"`, { url });
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[API CLIENT] fetchHistory response not OK: status=${res.status}`);
      throw new Error('Failed to fetch history');
    }
    const data = await res.json();
    console.log(`[API CLIENT] fetchHistory success: fetched ${data.length} records`);
    return data;
  } catch (error) {
    console.error(`[API CLIENT] fetchHistory error: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch admin stats
 */
export async function fetchAdminStats() {
  const url = `${API_BASE}/admin/stats`;
  console.log(`[API CLIENT] fetchAdminStats called`, { url });
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[API CLIENT] fetchAdminStats response not OK: status=${res.status}`);
      throw new Error('Failed to fetch stats');
    }
    const data = await res.json();
    console.log(`[API CLIENT] fetchAdminStats success:`, data);
    return data;
  } catch (error) {
    console.error(`[API CLIENT] fetchAdminStats error: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch failure logs
 */
export async function fetchFailures(page = 1) {
  const url = `${API_BASE}/admin/failures?page=${page}`;
  console.log(`[API CLIENT] fetchFailures called: page=${page}`, { url });
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[API CLIENT] fetchFailures response not OK: status=${res.status}`);
      throw new Error('Failed to fetch failures');
    }
    const data = await res.json();
    console.log(`[API CLIENT] fetchFailures success: fetched ${data.failures ? data.failures.length : 0} logs`);
    return data;
  } catch (error) {
    console.error(`[API CLIENT] fetchFailures error: ${error.message}`);
    throw error;
  }
}
