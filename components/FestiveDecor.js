import { festiveBanner } from '@/lib/festive.js';

// Decorations are plain HTML and CSS, with no JavaScript. They are hidden for anyone who prefers reduced motion (see the CSS).
const PIECES = Array.from({ length: 16 }, (_, i) => ({
  left: (i * 37) % 100, delay: ((i * 13) % 90) / 10, dur: 7 + (i % 5) * 1.6, size: 4 + (i % 4) * 2,
}));

export default function FestiveDecor({ theme, name }) {
  if (!theme) return null;
  return (
    <>
      <div className="fx-banner" role="note">{festiveBanner(theme, name)}</div>
      <div className="fx" aria-hidden="true">
        {PIECES.map((p, i) => (
          <i key={i} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, width: p.size, height: p.size }} />
        ))}
      </div>
    </>
  );
}
