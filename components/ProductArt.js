import { art } from '@/lib/art.js';

// Shows the product photo if there is one, otherwise the built-in illustration.
export default function ProductArt({ product, variant = 0 }) {
  const imgs = product.images || [];
  if (imgs.length) return <img src={imgs[variant % imgs.length]} alt={product.name} loading="lazy" />;
  return <div className="art" dangerouslySetInnerHTML={{ __html: art(product, variant) }} />;
}
