import Link from 'next/link';
import { festiveBanner } from '@/lib/festive.js';
import FestiveCountdown from '@/components/FestiveCountdown.js';

// Decorations are plain HTML and CSS (no JavaScript), except the New Year countdown. All are hidden for reduced motion (see the CSS).
const seeded = (n, s) => Array.from({ length: n }, (_, i) => { const k = (i * 9301 + s * 49297) % 233280; return k / 233280; });
const flakes = (n, layer, s) => seeded(n, s).map((r, i) => {
  const r2 = seeded(n, s + 7)[i], r3 = seeded(n, s + 13)[i];
  return { layer, left: Math.round(r * 1000) / 10, delay: -Math.round(r2 * 1000) / 100 * 10, dur: 11 + layer * 5 + r3 * 6, sway: Math.round((r3 - 0.5) * 120) };
});
const SNOW = [...flakes(26, 0, 3), ...flakes(18, 1, 17), ...flakes(10, 2, 29)];
const LANTERNS = [5, 19, 33, 61, 77, 91];
const BATS = [{ top: 12, dur: 22, delay: 0, size: 34 }, { top: 26, dur: 30, delay: -9, size: 22 }, { top: 8, dur: 26, delay: -17, size: 28 }, { top: 40, dur: 34, delay: -4, size: 18 }];
const BURSTS = [{ l: 16, t: 10, d: 0 }, { l: 38, t: 16, d: 1.7 }, { l: 62, t: 8, d: 3.1 }, { l: 84, t: 14, d: 2.2 }];

export default function FestiveDecor({ theme, name }) {
  if (!theme) return null;
  return (
    <>
      <div className="fx-banner" role="note">
        {theme === 'christmas' && <span className="fx-lights" aria-hidden="true" />}
        <span className="fx-msg">{festiveBanner(theme, name)}</span>
        {theme === 'newYear' && <FestiveCountdown />}
        <Link className="fx-cta" href="/shop">Shop the season</Link>
      </div>
      {theme === 'christmas' && (
        <div className="fx" aria-hidden="true">
          {SNOW.map((f, i) => <i key={i} className={`fx-f l${f.layer}`} style={{ left: `${f.left}%`, animationDelay: `${f.delay}s`, animationDuration: `${f.dur}s`, '--sway': `${f.sway}px` }} />)}
        </div>
      )}
      {theme === 'newYear' && (
        <div className="fx" aria-hidden="true">
          {BURSTS.map((b, i) => <i key={i} className="fx-burst" style={{ left: `${b.l}%`, top: `${b.t}%`, animationDelay: `${b.d}s` }} />)}
        </div>
      )}
      {theme === 'eid' && (
        <div className="fx fx-eid" aria-hidden="true">
          {LANTERNS.map((l, i) => <i key={i} className="fx-lantern" style={{ left: `${l}%`, animationDelay: `${-(i * 0.7)}s` }} />)}
        </div>
      )}
      {theme === 'halloween' && (
        <div className="fx fx-hw" aria-hidden="true">
          <i className="fx-fog" />
          {BATS.map((b, i) => <i key={i} className="fx-bat" style={{ top: `${b.top}%`, width: b.size, height: b.size * 0.6, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }} />)}
        </div>
      )}
    </>
  );
}
