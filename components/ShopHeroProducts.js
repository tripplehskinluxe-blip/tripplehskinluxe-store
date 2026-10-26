const ITEMS = [
  { src: '/shop/cerave-moisturizing-cream.webp', w: 436, h: 512, d: 150, m: 92 },
  { src: '/shop/cerave-intensive-cream.webp', w: 151, h: 383, d: 215, m: 128 },
  { src: '/shop/skin-aqua-serum-uv.webp', w: 199, h: 411, d: 195, m: 118 },
  { src: '/shop/nine-less-azelaic.webp', w: 113, h: 296, d: 170, m: 98 },
];

export default function ShopHeroProducts() {
  return (
    <div className="shp" aria-hidden="true">
      {ITEMS.map((p, i) => (
        <span key={p.src} className="shp-i" style={{ '--i': i, '--h': `${p.d}px`, '--hm': `${p.m}px` }}>
          <img src={p.src} alt="" width={p.w} height={p.h} decoding="async" />
        </span>
      ))}
    </div>
  );
}
