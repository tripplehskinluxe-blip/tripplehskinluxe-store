// A band of seasonal images for the cart, checkout and order confirmation. It is hidden unless a season is switched on.
// The images load only when they are shown (lazy), so the store stays fast.
export default function FestiveBand() {
  return (
    <div className="fest-band" aria-hidden="true">
      <img className="fb-c" src="/festive/christmas-tree.webp" alt="" width="300" height="300" loading="lazy" />
      <img className="fb-c" src="/festive/christmas-gifts.webp" alt="" width="400" height="220" loading="lazy" />
      <img className="fb-c" src="/festive/christmas-baubles.webp" alt="" width="300" height="200" loading="lazy" />
      <img className="fb-h" src="/festive/halloween-pumpkin-moon.webp" alt="" width="300" height="300" loading="lazy" />
      <img className="fb-h" src="/festive/halloween-tree-night.webp" alt="" width="300" height="300" loading="lazy" />
    </div>
  );
}
