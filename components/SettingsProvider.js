'use client';
import { createContext, useContext, useMemo } from 'react';
import { announcement, tokenValues, fillTokens, waLink } from '@/lib/settings-core.js';

const Ctx = createContext(null);

// Gives every client component the shop's settings (loaded once on the server in the root layout).
export function SettingsProvider({ settings, children }) {
  const value = useMemo(() => ({
    ...settings,
    announcement: announcement(settings),
    waLink: (message, number) => waLink(settings, message, number),
    fill: (text) => fillTokens(text, tokenValues(settings)),
  }), [settings]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export default SettingsProvider;

export function useSettings() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings must be used inside SettingsProvider');
  return v;
}
