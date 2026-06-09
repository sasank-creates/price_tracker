'use client';

import { useState, useEffect, useRef } from 'react';
import { fetchHistory } from '@/lib/api';

export default function PriceChart({ productId, expectedPrice }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef(null);

  useEffect(() => {
    loadHistory();
  }, [productId]);

  useEffect(() => {
    if (history.length > 0 && canvasRef.current) {
      drawChart();
    }
  }, [history]);

  const loadHistory = async () => {
    try {
      const data = await fetchHistory(productId);
      setHistory(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const drawChart = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Clear
    ctx.clearRect(0, 0, width, height);

    if (history.length < 2) {
      ctx.fillStyle = '#6b6b85';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Not enough data points for a chart', width / 2, height / 2);
      return;
    }

    const prices = history.map((h) => h.price);
    const allValues = [...prices, expectedPrice];
    const minPrice = Math.min(...allValues) * 0.95;
    const maxPrice = Math.max(...allValues) * 1.05;
    const priceRange = maxPrice - minPrice || 1;

    const xStep = chartW / (history.length - 1);

    // Helper functions
    const getX = (i) => padding.left + i * xStep;
    const getY = (price) => padding.top + chartH - ((price - minPrice) / priceRange) * chartH;

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartH / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // Y-axis labels
      const price = maxPrice - (priceRange / gridLines) * i;
      ctx.fillStyle = '#6b6b85';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`₹${Math.round(price).toLocaleString()}`, padding.left - 8, y + 4);
    }

    // Target price line
    const targetY = getY(expectedPrice);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padding.left, targetY);
    ctx.lineTo(width - padding.right, targetY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#22c55e';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Target: ₹${expectedPrice.toLocaleString()}`, padding.left + 4, targetY - 6);

    // Area fill gradient
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.2)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

    ctx.beginPath();
    ctx.moveTo(getX(0), getY(prices[0]));
    for (let i = 1; i < prices.length; i++) {
      ctx.lineTo(getX(i), getY(prices[i]));
    }
    ctx.lineTo(getX(prices.length - 1), padding.top + chartH);
    ctx.lineTo(getX(0), padding.top + chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Price line
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(prices[0]));
    for (let i = 1; i < prices.length; i++) {
      ctx.lineTo(getX(i), getY(prices[i]));
    }
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Data points
    for (let i = 0; i < prices.length; i++) {
      ctx.beginPath();
      ctx.arc(getX(i), getY(prices[i]), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#6366f1';
      ctx.fill();
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // X-axis labels (show max 6)
    const labelStep = Math.max(1, Math.floor(history.length / 6));
    ctx.fillStyle = '#6b6b85';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < history.length; i += labelStep) {
      const date = new Date(history[i].checkedAt);
      const label = `${date.getDate()}/${date.getMonth() + 1}`;
      ctx.fillText(label, getX(i), height - padding.bottom + 20);
    }
  };

  if (loading) {
    return (
      <div className="chart-container" style={{ textAlign: 'center', padding: '40px' }}>
        <span className="spinner" />
      </div>
    );
  }

  return (
    <div className="chart-container">
      <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>
        📈 Price History
      </h4>
      <canvas ref={canvasRef} className="chart-canvas" />
    </div>
  );
}
