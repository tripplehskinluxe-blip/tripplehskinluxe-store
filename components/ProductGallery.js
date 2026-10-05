'use client';
import { useEffect, useState } from 'react';
import ProductArt from './ProductArt';

export default function ProductGallery({ product }) {
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [big, setBig] = useState(false);
  const n = product.images?.length || 4;

  useEffect(() => {
    if (!zoom) return;
    document.body.classList.add('lock');
    const esc = (e) => e.key === 'Escape' && setZoom(false);
    window.addEventListener('keydown', esc);
    return () => { document.body.classList.remove('lock'); window.removeEventListener('keydown', esc); };
  }, [zoom]);

  return (
    <div>
      <div className="gal-main" onClick={() => { setBig(false); setZoom(true); }} role="button" tabIndex={0} aria-label="Zoom image" onKeyDown={(e) => e.key === 'Enter' && setZoom(true)}>
        <ProductArt product={product} variant={i} />
      </div>
      <div className="thumbs">
        {Array.from({ length: n }, (_, k) => (
          <button key={k} className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={`Image ${k + 1}`}><ProductArt product={product} variant={k} /></button>
        ))}
      </div>
      {zoom && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setZoom(false)}>
          <div className={`modal z ${big ? 'in' : ''}`}>
            <div className="zoomv" onClick={() => setBig(!big)}><ProductArt product={product} variant={i} /></div>
            <p className="center" style={{ color: '#fff', marginTop: 12, fontSize: 13 }}>Tap image to zoom · tap outside to close</p>
          </div>
        </div>
      )}
    </div>
  );
}
