'use client';
import { useEffect, useState } from 'react';

// Counts down to the next 1 January. Shown in the New Year banner only.
export default function FestiveCountdown() {
  const [left, setLeft] = useState(null);
  useEffect(() => {
    const tick = () => { const now = new Date(); setLeft(Math.max(0, new Date(now.getFullYear() + 1, 0, 1) - now)); };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  if (left === null) return null;
  const d = Math.floor(left / 86400000), h = Math.floor((left % 86400000) / 3600000), m = Math.floor((left % 3600000) / 60000), s = Math.floor((left % 60000) / 1000);
  return <span className="fx-count">{d}d {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')} to midnight</span>;
}
