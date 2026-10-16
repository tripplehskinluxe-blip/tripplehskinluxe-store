// Tell the server to refresh the shop's cached pages after a change. Fire-and-forget: a failure only means the shop catches up within a minute.
export function refreshShop(token) {
  Promise.resolve(typeof token === 'function' ? token() : token)
    .then((t) => fetch('/api/admin/revalidate', { method: 'POST', headers: { Authorization: `Bearer ${t}` }, keepalive: true }))
    .catch(() => {});
}
