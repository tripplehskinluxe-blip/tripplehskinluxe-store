import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin.js';

// Reads the 'aal' claim (assurance level) from a token Supabase has ALREADY verified.
const tokenAal = (t) => { try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).aal; } catch { return null; } };

/** Checks the caller's Supabase login token AND their role in the database. Returns { error } or { user, role }. */
export async function requireStaff(req, { adminOnly = false } = {}) {
  const h = req.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const db = supabaseAdmin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  if (tokenAal(token) !== 'aal2') return { error: NextResponse.json({ error: 'Two-factor verification required' }, { status: 403 }) };

  const { data: prof } = await db.from('profiles').select('role').eq('id', data.user.id).single();
  const ok = prof && (adminOnly ? prof.role === 'admin' : ['admin', 'staff'].includes(prof.role));
  if (!ok) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };

  return { user: data.user, role: prof.role, token };
}
