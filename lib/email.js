// Transactional email through Resend (https://resend.com). Plain fetch, no extra dependency.
// Works in Next.js route handlers AND in the standalone Railway listener, so it only uses relative imports.
//
// Needs two environment variables. Until BOTH are set, emailConfigured() is false and the app simply skips email:
//   RESEND_API_KEY  - from the Resend dashboard
//   EMAIL_FROM      - e.g.  Tripple H Skin Luxe <orders@your-domain.com>   (the domain must be verified in Resend)
import { naira } from './format.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// header-safe single line (subjects never contain line breaks)
const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function sendEmail({ to, subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject: oneLine(subject),
      html,
      text,
      ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`resend ${res.status}: ${detail.slice(0, 200)}`);
  }
  return true;
}

const base = () => (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
const addressLine = (a = {}) => [a.address, a.landmark, a.city, a.state].filter(Boolean).join(', ');

function layout(store, title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#f8f5fc;font-family:Arial,Helvetica,sans-serif;color:#2b1445">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f5fc;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#4b1f75;color:#ffffff;padding:20px 28px;font-size:18px;font-weight:bold;letter-spacing:.04em">${esc(store.name)}</td></tr>
<tr><td style="padding:28px"><h1 style="margin:0 0 14px;font-size:22px;color:#2b1445">${esc(title)}</h1>${bodyHtml}</td></tr>
<tr><td style="padding:18px 28px;background:#f1e9fb;font-size:12px;color:#6f6581">${esc(store.name)} · ${esc(store.address)}<br>Questions? Reply to this email or message us on WhatsApp.</td></tr>
</table></td></tr></table></body></html>`;
}

const trackBlock = (num) => {
  const url = base() ? `${base()}/track-order` : '';
  return url
    ? `<p style="margin:18px 0 0;font-size:14px">Track your order any time at <a href="${esc(url)}" style="color:#4b1f75">${esc(url)}</a> using order number <b>${esc(num)}</b> and the phone number you gave at checkout.</p>`
    : '';
};
const trackText = (num) => (base() ? `\nTrack your order: ${base()}/track-order (order number ${num} + your phone number)\n` : '');

export function confirmationEmail(order, items, settings) {
  const { store, delivery } = settings;
  const rows = items.map((i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-size:14px">${esc(i.name)} × ${esc(i.qty)}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #eee;font-size:14px">${esc(naira(i.unit_price_ngn * i.qty))}</td></tr>`).join('');
  const line = (l, v, strong) => `<tr><td style="padding:4px 0;font-size:14px;${strong ? 'font-weight:bold;font-size:16px' : ''}">${l}</td><td align="right" style="padding:4px 0;font-size:14px;${strong ? 'font-weight:bold;font-size:16px' : ''}">${v}</td></tr>`;
  const html = layout(store, 'Thank you, your order is confirmed',
    `<p style="margin:0 0 16px;font-size:15px">Hi ${esc(order.customer_name)}, we have received your payment for order <b>${esc(order.order_number)}</b>.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px">
${line('Subtotal', esc(naira(order.subtotal_ngn)))}${line('Delivery', order.delivery_ngn ? esc(naira(order.delivery_ngn)) : 'Free')}${order.discount_ngn ? line(`Discount${order.discount_code ? ` (${esc(order.discount_code)})` : ''}`, '-' + esc(naira(order.discount_ngn))) : ''}${line('Total paid', esc(naira(order.total_ngn)), true)}
</table>
<p style="margin:18px 0 0;font-size:14px"><b>Delivering to:</b><br>${esc(addressLine(order.address))}</p>
<p style="margin:14px 0 0;font-size:14px">Estimated delivery: ${esc(delivery.lagosDays)} in Lagos, ${esc(delivery.otherDays)} nationwide.</p>${trackBlock(order.order_number)}`);
  const text = [
    `Hi ${order.customer_name}, we have received your payment for order ${order.order_number}.`, '',
    ...items.map((i) => `${i.name} x ${i.qty}  ${naira(i.unit_price_ngn * i.qty)}`), '',
    `Subtotal: ${naira(order.subtotal_ngn)}`, `Delivery: ${order.delivery_ngn ? naira(order.delivery_ngn) : 'Free'}`,
    ...(order.discount_ngn ? [`Discount: -${naira(order.discount_ngn)}`] : []), `Total paid: ${naira(order.total_ngn)}`, '',
    `Delivering to: ${addressLine(order.address)}`, `Estimated delivery: ${delivery.lagosDays} in Lagos, ${delivery.otherDays} nationwide.`, trackText(order.order_number),
    store.name,
  ].join('\n');
  return { subject: `Order ${order.order_number} confirmed · ${store.name}`, html, text };
}

const STATUS_COPY = {
  shipped: ['Your order has shipped', 'is on its way to you', 'Your order has left us and is on its way.'],
  out_for_delivery: ['Your order is out for delivery', 'is out for delivery', 'Our rider is on the way. Please keep your phone close so you can receive it.'],
  delivered: ['Your order has been delivered', 'has been delivered', 'We hope you love it. If anything is wrong, message us on WhatsApp with your order number and a photo.'],
};

export function statusEmail(order, settings) {
  const { store } = settings;
  const c = STATUS_COPY[order.status];
  if (!c) return null;
  const html = layout(store, c[0], `<p style="margin:0 0 14px;font-size:15px">Hi ${esc(order.customer_name)}, order <b>${esc(order.order_number)}</b> ${esc(c[1])}.</p><p style="margin:0;font-size:14px">${esc(c[2])}</p>${trackBlock(order.order_number)}`);
  const text = `Hi ${order.customer_name}, order ${order.order_number} ${c[1]}.\n\n${c[2]}\n${trackText(order.order_number)}\n${store.name}`;
  return { subject: `${c[0]} · ${order.order_number}`, html, text };
}
