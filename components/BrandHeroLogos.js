const LOGOS = [
  { src: '/brand-logos/cosrx.webp', w: 427, h: 93, d: 150, m: 112 },
  { src: '/brand-logos/naturium.webp', w: 287, h: 35, d: 190, m: 140 },
  { src: '/brand-logos/medicube.webp', w: 410, h: 85, d: 160, m: 120 },
  { src: '/brand-logos/zaron.webp', w: 376, h: 78, d: 140, m: 104 },
  { src: '/brand-logos/cerave.webp', w: 308, h: 114, d: 130, m: 96 },
];

export default function BrandHeroLogos() {
  return (
    <div className="lgs" aria-hidden="true">
      {LOGOS.map((p, i) => (
        <span key={p.src} className="lg-i" style={{ '--i': i, '--w': `${p.d}px`, '--wm': `${p.m}px` }}>
          <img src={p.src} alt="" width={p.w} height={p.h} decoding="async" />
        </span>
      ))}
    </div>
  );
}
