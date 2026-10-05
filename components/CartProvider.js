'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const Ctx = createContext(null);
export const useCart = () => useContext(Ctx);
const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };

// Cart and wishlist live in the browser (guest checkout). Prices are NEVER taken from here: the server re-prices at checkout.
export default function CartProvider({ children }) {
  const [cart, setCart] = useState([]);   // [{ id, qty }]
  const [wish, setWish] = useState([]);   // [id]
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { setCart(read('ths_cart', [])); setWish(read('ths_wish', [])); setReady(true); }, []);
  useEffect(() => { if (ready) localStorage.setItem('ths_cart', JSON.stringify(cart)); }, [cart, ready]);
  useEffect(() => { if (ready) localStorage.setItem('ths_wish', JSON.stringify(wish)); }, [wish, ready]);

  const toast = useCallback((m) => {
    setMsg(m); clearTimeout(window.__thsToast);
    window.__thsToast = setTimeout(() => setMsg(''), 2300);
  }, []);

  const add = (p, qty = 1) => {
    if (p.stock <= 0) { toast('Sorry, this product is out of stock'); return false; }
    const cur = cart.find((c) => c.id === p.id);
    const n = (cur?.qty || 0) + qty;
    if (n > p.stock) { toast(`Only ${p.stock} left in stock`); return false; }
    setCart(cur ? cart.map((c) => (c.id === p.id ? { ...c, qty: n } : c)) : [...cart, { id: p.id, qty }]);
    toast('Added to bag');
    return true;
  };
  const setQty = (id, qty, max) => {
    if (qty < 1) return setCart(cart.filter((c) => c.id !== id));
    if (max && qty > max) { toast(`Only ${max} in stock`); return; }
    setCart(cart.map((c) => (c.id === id ? { ...c, qty } : c)));
  };
  const remove = (id) => setCart(cart.filter((c) => c.id !== id));
  const clear = () => setCart([]);
  // Drop bag/wishlist ids the shop no longer has (old demo items, archived products). Functional updates so nothing is lost.
  // Only ids that were ASKED about and NOT found are dropped.
  const prune = (asked, found) => {
    const gone = new Set(asked.filter((id) => !found.has(id)));
    if (!gone.size) return;
    setCart((c) => { const n = c.filter((x) => !gone.has(x.id)); return n.length === c.length ? c : n; });
    setWish((w) => { const n = w.filter((x) => !gone.has(x)); return n.length === w.length ? w : n; });
  };
  const toggleWish = (id) => {
    const has = wish.includes(id);
    setWish(has ? wish.filter((x) => x !== id) : [...wish, id]);
    toast(has ? 'Removed from wishlist' : 'Saved to wishlist');
  };
  const count = cart.reduce((a, c) => a + c.qty, 0);

  return (
    <Ctx.Provider value={{ cart, wish, ready, count, add, setQty, remove, clear, prune, toggleWish, toast }}>
      {children}
      <div id="toast" className={msg ? 'show' : ''} role="status" aria-live="polite">{msg}</div>
    </Ctx.Provider>
  );
}
