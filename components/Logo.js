import Link from 'next/link';

// The shop's logo (the monogram) with its name under it. The picture comes from Settings, or /logo.png until one is uploaded.
export default function Logo({ store, href = '/', size = 46, label }) {
  return (
    <Link className="logo" href={href} aria-label={store.name}>
      <span className="logo-mark">
      <img src={store.logo || '/logo.png'} alt="" width={size} height={size} />
      </span>
      <span>{label || store.name}</span>
    </Link>
  );
}
