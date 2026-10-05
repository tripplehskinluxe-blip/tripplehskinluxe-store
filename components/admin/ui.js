'use client';
import { useEffect } from 'react';
import { useAdmin } from './AdminProvider';

export const STATUS = [['pending', 'Pending'], ['processing', 'Processing'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['out_for_delivery', 'Out for delivery'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']];
export const statusLabel = (k) => (STATUS.find(([v]) => v === k) || [k, k])[1];
export const safeSearch = (s) => String(s || '').replace(/[^\p{L}\p{N}\s.&'-]/gu, '').trim().slice(0, 60);

export const Pill = ({ text }) => <span className={`pill ${String(text).toLowerCase().replace(/[^a-z]/g, '')}`}>{text}</span>;
export const ChannelPill = ({ c }) => <span className={`pill ${c === 'store' ? 'in-store' : 'online'}`}>{c === 'store' ? 'In-store' : 'Online'}</span>;

export const PageHead = ({ title, sub, children }) => (
  <div className="bk"><div><h1>{title}</h1>{sub && <p className="mut">{sub}</p>}</div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div></div>
);

export function Modal({ children, onClose }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}><div className="modal">{children}</div></div>;
}

const short = (v) => (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : Math.round(v));
export function Bars({ values, labels, h = 180 }) {
  const mx = Math.max(...values, 1) * 1.15, w = 400 / values.length;
  return (
    <svg viewBox={`0 0 400 ${h + 28}`} className="chart" role="img" aria-label="Sales chart">
      <defs><linearGradient id="bg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7a3fb5" /><stop offset="1" stopColor="#cdb1ec" /></linearGradient></defs>
      {values.map((v, i) => {
        const bh = (v / mx) * h, x = i * w + w * 0.15, bw = w * 0.7;
        return (
          <g key={i}>
            <rect x={x} y={h - bh} width={bw} height={Math.max(bh, 1)} rx="6" fill="url(#bg1)" />
            <text x={x + bw / 2} y={h + 17} textAnchor="middle" fontSize="11" fill="#6f6581">{labels[i]}</text>
            {v > 0 && values.length <= 14 && <text x={x + bw / 2} y={h - bh - 6} textAnchor="middle" fontSize="10" fill="#3a1560">{short(v)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// Wrap admin-only pages. (The database refuses these actions for staff anyway; this just shows a clear message.)
export function AdminOnly({ children }) {
  const { role } = useAdmin();
  if (role !== 'admin') return <div className="box"><h3 style={{ marginBottom: 8 }}>Admin access needed</h3><p className="mut">This page is for the owner account. Staff can use Orders, In-store sales, Inventory and Customers.</p></div>;
  return children;
}
