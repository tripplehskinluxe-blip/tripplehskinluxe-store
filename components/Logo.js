import Link from 'next/link';

// The shop's logo (the monogram) with its name under it. The picture comes from Settings, or /logo.png until one is uploaded.
export default function Logo({ store, href = '/', size = 46, label }) {
  return (
    <Link className="logo" href={href} aria-label={store.name}>
      <img src={store.logo || '/logo.png'} alt="" width={size} height={size} />
      <span>{label || store.name}</span>
    </Link>
  );
}
