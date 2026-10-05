import ProductCard from './ProductCard';

export default function ProductGrid({ items, cols = '' }) {
  return <div className={`grid ${cols}`}>{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>;
}
