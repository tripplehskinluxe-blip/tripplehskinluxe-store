export default function Stars({ value }) {
  return <span className="stars" style={{ '--v': `${((value || 0) / 5 * 100).toFixed(0)}%` }} aria-label={`${value} out of 5`}>★★★★★</span>;
}
