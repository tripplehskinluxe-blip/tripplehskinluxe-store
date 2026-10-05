import Icon from './Icon';
import { getSettings } from '@/lib/settings.js';
import { waLink } from '@/lib/settings-core.js';

export default async function WhatsApp() {
  const settings = await getSettings();
  return <a className="wa" href={waLink(settings)} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp"><Icon n="chat" s={26} /></a>;
}
