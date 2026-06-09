'use client';

import { useState, useEffect } from 'react';
import { fetchAdminStats, fetchFailures } from '@/lib/api';

export default function AdminPage() {
  const [stats, setStats] = useState(null);
  const [failures, setFailures] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[COMPONENT: AdminPage] Mounted. Loading stats and failure logs...');
    loadData();
    return () => console.log('[COMPONENT: AdminPage] Unmounted.');
  }, []);

  const loadData = async () => {
    console.log('[COMPONENT: AdminPage] loadData started...');
    try {
      const [statsData, failuresData] = await Promise.all([
        fetchAdminStats(),
        fetchFailures(),
      ]);
      console.log('[COMPONENT: AdminPage] Stats and failure logs successfully loaded:', { stats: statsData, failuresCount: failuresData.failures ? failuresData.failures.length : 0 });
      setStats(statsData);
      setFailures(failuresData.failures || []);
    } catch (err) {
      console.error('[COMPONENT: AdminPage] Failed to load stats or failures:', err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px' }}>
        <span className="spinner" />
      </div>
    );
  }

  return (
    <>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px', marginTop: '16px' }}>
        ⚙️ Admin Panel
      </h1>

      {/* Stats */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.totalProducts}</div>
            <div className="stat-label">Total Products</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.activeProducts}</div>
            <div className="stat-label">Active</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.totalUsers}</div>
            <div className="stat-label">Users</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.totalChecks}</div>
            <div className="stat-label">Total Checks</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: stats.unresolvedFailures > 0 ? 'var(--danger)' : undefined }}>
              {stats.unresolvedFailures}
            </div>
            <div className="stat-label">Unresolved Failures</div>
          </div>
        </div>
      )}

      {/* Failure Logs */}
      <div className="form-card">
        <h2 className="form-title">🚨 Failed Scrapes</h2>
        {failures.length === 0 ? (
          <div className="empty-state" style={{ padding: '30px' }}>
            <p>No failures recorded. All systems healthy! ✅</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="failure-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Error</th>
                  <th>Type</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {failures.map((f) => (
                  <tr key={f.id}>
                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.product?.name || f.url}
                    </td>
                    <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--danger)' }}>
                      {f.error}
                    </td>
                    <td>
                      <span className={`status-badge ${f.errorType === 'network' ? 'status-above' : 'status-failed'}`}>
                        {f.errorType || 'unknown'}
                      </span>
                    </td>
                    <td>{new Date(f.createdAt).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
