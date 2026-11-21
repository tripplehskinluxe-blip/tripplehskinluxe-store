// Festive images placed inside each step of the buying journey. Hidden unless a season is switched on.
// Photos and cut-outs load only when shown (lazy).
export default function FestiveStep({ kind }) {
  return (
    <div className={`fest-step fs-${kind}`} aria-hidden="true">
      <img className="fs-christmas" src={kind === 'contact' ? '/festive/christmas-baubles.png' : kind === 'delivery' ? '/festive/christmas-gifts.webp' : kind === 'payment' ? '/festive/christmas-tree.webp' : '/festive/christmas-ornaments.webp'} alt="" width="320" height="200" loading="lazy" />
      <img className="fs-halloween" src={kind === 'contact' ? '/festive/halloween-pumpkin.png' : kind === 'delivery' ? '/festive/halloween-pumpkin-moon.webp' : kind === 'payment' ? '/festive/halloween-tree-night.webp' : '/festive/halloween-pumpkin-hands.webp'} alt="" width="320" height="200" loading="lazy" />
    </div>
  );
}
