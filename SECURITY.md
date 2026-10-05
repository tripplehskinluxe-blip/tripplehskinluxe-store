# Security checklist

## Built in (Phase 1)
- **Prices are never trusted from the browser.** The server rebuilds totals from database prices, and the database refuses the order if they differ.
- **Payments are confirmed by Paystack, not the browser.** The Railway listener hashes the raw request body with the Paystack secret key (HMAC-SHA512) and compares it to the `x-paystack-signature` header; anything that does not match is rejected before any database work. It then re-verifies the payment with Paystack's API and marks the order paid. Repeated webhooks are harmless, and if Paystack or the database is briefly down the listener answers 500 so Paystack retries. If a webhook is ever missed, the confirmation page asks Paystack directly (rate-limited).
- **A payment for a cancelled order is kept and flagged**, never reviving the order or taking stock; look for `needs_attention = true` and refund in Paystack.
- **Overselling is blocked.** Stock changes happen inside locked database transactions. If an item sells out between payment and confirmation, the order is flagged `needs_attention`.
- **Principle of least privilege (tested).** Every database role holds only the operations it needs, on top of the row rules. A visitor who is not signed in can only read public shop content (products, categories, published reviews, settings, legal pages): no write, no delete, no other table, and cannot run any database function. A signed-in customer cannot write to orders, customers, stock, settings or the audit log at all, and cannot change the `role` column even on their own profile (roles change only in the Supabase SQL editor). New tables start with no access for these roles. Settings can only be saved through `save_setting()`, which re-checks admin + two-factor, validates the size and is written to the audit log; the website runs that call as the signed-in admin, not with the server's master key. Internal columns (who edited a setting, who wrote a review) are hidden from the public.
- **Row-level security on every table (tested).** The public can only read active products, categories, published reviews, settings and the legal pages. A signed-in customer can read only their own orders and nothing else private. Customers, contact messages, newsletter, discounts and the audit log are visible only to team members with two-factor (some to admin only). Nobody can change their own role. Roles are `customer`, `staff` and `admin`. These rules were attacked on a real PostgreSQL 16 (`supabase/tests/`).
- **Secrets stay on the server.** `SUPABASE_SERVICE_ROLE_KEY` and `PAYSTACK_SECRET_KEY` have no `NEXT_PUBLIC_` prefix and are only imported in server code.
- **Admin routes check the role in the database**, not just that someone is logged in.
- **Input validation + size limits** on checkout and CSV import; errors don't leak database details.
- **Rate limiting** on checkout, order-status, import and status emails (basic, in-memory; see the checklist).
- **Emails are sent once** per order event (the database records it), the text is HTML-escaped, and the status email is chosen from the order's real status, never from the request.
- **Security headers:** CSP, HSTS, no framing, no sniffing.
- **Audit log** for imports, stock adjustments, cancellations and status changes.
- **No card data touches our servers**: Paystack hosts the payment page, which keeps us out of heavy card-compliance scope.

## You must do before going live
- [ ] Turn on **MFA/2FA** for every admin and staff login, and for Supabase, Vercel, Paystack and the domain/email accounts.
- [ ] Use strong unique passwords; give staff the `staff` role, not `admin`.
- [ ] Rotate keys if they were ever pasted into a chat, email or screenshot. **Never share secret keys with anyone, including me.**
- [ ] Test the full flow with Paystack **test** keys: success, failed card, abandoned payment, duplicate webhook, sold-out item.
- [ ] Switch to live keys only in Vercel's environment settings, never in code or git.
- [ ] Enable Supabase backups (daily on paid plans, point-in-time recovery if available) and try restoring one.
- [ ] Replace in-memory rate limiting with Upstash/Redis or Vercel's firewall.
- [ ] Privacy, Terms and Returns pages exist (draft text). **Have a Nigerian lawyer review and edit them** (Team area → Legal pages), including NDPA 2023 duties (consent, data retention, breach notice).
- [ ] Set up the Resend domain (SPF / DKIM records) so order emails reach inboxes and cannot be spoofed.
- [ ] Supabase → Authentication: **turn off "Allow new users to sign up"** and consider enabling CAPTCHA (see the sign-in note above).
- [ ] Railway: keep `PAYSTACK_SECRET_KEY` and `SUPABASE_SERVICE_ROLE_KEY` only in Railway/Vercel variables; register only the Railway webhook URL in Paystack.
- [ ] Set up error monitoring (e.g. Sentry) and uptime alerts; watch for orders with `needs_attention = true`.
- [ ] Run `npm audit` and keep dependencies updated monthly.
- [ ] Get an independent security review/penetration test before taking real money at scale.

## Added with the storefront
- **Order tracking needs the phone number too**, because order numbers are sequential; attempts are rate-limited so nobody can browse other people's orders.
- **Promo codes can't be listed.** Shoppers can only test one code at a time (rate-limited); discounts are re-checked on the server at payment.
- **Contact and newsletter forms** have a hidden bot trap, size limits and rate limits, and write through the server only (no public database access).
- **Product data shown to the public** comes through a read-only public key restricted by database rules to active products.
- **Product pages embed structured data safely** (angle brackets are escaped).
- Product photos must be `https://` and hosted on your Supabase project or Cloudinary (the CSV importer enforces this and reports what it removed).

## Team area (admin)
Layers, from weakest to strongest:
1. **Secret address.** The team area is not at /admin (that returns "Not Found"). It lives at the value of `NEXT_PUBLIC_ADMIN_PATH`, and the admin is switched OFF if that is empty or shorter than 12 characters. This only keeps casual scanners away: the address is part of the admin's own code, so treat it as a speed bump, not a lock. It is also hidden from search engines.
2. **Sign-in with a server-side escalating lockout, then two-factor, and automatic sign-out after 30 minutes idle.**
   - The browser sends the email and password to `/api/admin/login` on the server. After 5 wrong passwords the account is locked for 15 minutes; after the next 5 wrong ones, 30 minutes; then 60, 120 ... up to a longest lock of 24 hours. A **correct password during a lock is refused too** (the password is not even checked). The lock follows the email (stored only as a hash) and the visitor's IP address. All numbers are stored in the database and an admin can change them (Settings → Login security).
   - If the lock check cannot run (database problem) sign-in is refused, never allowed. A Supabase outage is not counted against a person.
   - **Honest limit:** Supabase's own sign-in address is public (anyone can find it in the site's code), so a determined person can call it directly and skip this lockout. What still protects you: they need a valid email AND the password AND the authenticator code (a guessed password alone gets nobody in), the team address is secret, and Supabase applies its own rate limits. To close the gap completely, pick one: (a) Supabase **Teams** plan: its Password Verification hook can run the same lockout inside Supabase (the functions `login_check/login_failure/login_success` are ready for it); (b) turn on **CAPTCHA** in Supabase → Authentication → Attack Protection, which makes direct password guessing expensive.
   - To unlock someone at once (SQL editor): `delete from public.login_locks;`
3. **Two-factor is mandatory and enforced by the database and the import API**, not just the screen. A stolen password alone cannot read orders, change stock or edit products.
4. **Roles + row-level security.** `staff` can run orders, in-store sales and inventory; only `admin` can edit products, discounts and reviews or see analytics. The database refuses anything else even if someone calls it directly.
5. **No secret keys in the browser.** The team area uses the signed-in user's own session, never the service key.

Do: turn off public sign-ups in Supabase; give each person their own login; remove people the day they leave; never share the admin address publicly; if the address leaks, change `NEXT_PUBLIC_ADMIN_PATH` and redeploy.
