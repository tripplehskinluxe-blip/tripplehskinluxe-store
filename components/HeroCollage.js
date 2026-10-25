'use client';
import { useEffect, useState } from 'react';

const PERIOD = 3800; // ms between image changes in each frame

function Frame({ slides, start, delay, cls }) {
  const n = slides.length;
  const [st, setSt] = useState({ cur: start % n, prev: null });

  useEffect(() => {
    if (n < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let iv;
    const go = () => setSt((s) => ({ cur: (s.cur + 1) % n, prev: s.cur }));
    const t = setTimeout(() => { go(); iv = setInterval(go, PERIOD); }, delay + PERIOD * 0.6);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, [n, delay]);

  const cur = slides[st.cur];
  const prev = st.prev === null ? null : slides[st.prev];
  return (
    <div className={`cc ${cls}`}>
      {prev && <img key={`p${st.prev}-${st.cur}`} className="hs out" src={prev.src} alt="" />}
      <img key={`c${st.cur}`} className={`hs${prev ? ' in' : ''}`} src={cur.src} alt={cur.alt} />
    </div>
  );
}

export default function HeroCollage({ slides }) {
  useEffect(() => { slides.forEach((s) => { const im = new Image(); im.src = s.src; }); }, [slides]);
  if (!slides.length) return null;
  const step = Math.max(1, Math.floor(slides.length / 3));
  return (
    <div className="collage">
      <Frame slides={slides} start={0} delay={0} cls="a" />
      <Frame slides={slides} start={step} delay={1200} cls="b" />
      <Frame slides={slides} start={step * 2} delay={2400} cls="c" />
    </div>
  );
}
