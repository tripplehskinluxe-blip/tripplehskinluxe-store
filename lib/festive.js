// Festive looks. One switch per season in Admin > Settings. If more than one is on, the first in this list is shown.
export const FESTIVALS = ['christmas', 'newYear', 'eid', 'halloween'];
const NAMES = { christmas: 'Merry Christmas', newYear: 'Happy New Year', eid: 'Eid Mubarak', halloween: 'Happy Halloween' };

export function activeFestive(f) {
  if (!f || typeof f !== 'object') return null;
  return FESTIVALS.find((k) => f[k] === true) || null;
}

export const festiveBanner = (key, name) => `${NAMES[key] || ''} from ${name || 'us'}`.trim();
