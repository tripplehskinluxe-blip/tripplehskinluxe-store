# Tripple H Skin Luxe — online store (Next.js + Supabase + Paystack)

## What's in this version
- **Storefront:** home, shop (search, filters, sort, pages), product pages, wishlist, bag, 3-step checkout, order confirmation and tracking, brands, offers, about, contact, delivery, FAQ, **Spa & Wellness**, and a **Meet the CEO** page with her socials.
- **Team area (hidden address, two-factor sign-in):** dashboard, orders (status changes, cancel), **in-store sales**, products (add/edit, photo upload, **CSV import/export**), inventory (counts and history), customers, discounts, reviews, **Settings** (every price, fee, contact detail and page text), **legal pages editor**, analytics.
- **Legal pages:** Privacy, Terms of Sale and Returns (`/privacy`, `/terms`, `/returns`). A built-in draft is shown until an admin saves their own text in the team area.
- **Email (Resend):** order confirmation after payment, and shipped / out-for-delivery / delivered updates. Off until `RESEND_API_KEY` and `EMAIL_FROM` are set.
- **Backend:** database with security rules, Paystack payment start + confirmation, a **standalone Paystack listener for Railway** (`railway/`), and the APIs behind the forms.
- **Later phases:** customer accounts and review submission, bank-transfer and pay-on-delivery checkout.

## Run it on your computer (no accounts needed)
You need Node.js 20.9 or newer (check with `node -v`).
```
npm install
npm run dev
```
Open http://localhost:3000. With no keys the shop runs in **demo mode** on the built-in sample catalogue (28 products), checkout ends in a demo confirmation, and the team area says "Not connected". Nothing is saved anywhere. To see the production version instead: `npm run build` then `npm start`.

When Supabase exists, you add its keys to `.env.local` and restart (steps below). The shop then switches from demo mode to the real database by itself.

## Go live
1. Create a Supabase project. In **SQL Editor**, run these in order: `supabase/schema.sql`, `002_content_and_ratings.sql`, `003_admin_security.sql`, `004_storage.sql`, `005_hardening_pages_email.sql`, **`006_least_privilege.sql`**, **`007_settings_and_login_guard.sql`**. Run them one at a time, in this order, each exactly once.
2. In Supabase → Authentication, **turn off "Allow new users to sign up"** (team accounts are created by hand; customer accounts come later).
3. Copy `.env.example` to `.env.local` and fill it in. Use Paystack **test** keys first. Generate the secret admin address with the command in the file.
4. Create your login (Supabase → Authentication → Users → Add user), then make it the owner:
   `update public.profiles set role='admin' where id=(select id from auth.users where email='YOU@example.com');`
   Staff accounts get `role='staff'` instead (they see Orders, In-store sales, Inventory, Customers only). Roles can only be changed here in the SQL editor, never from the website.
5. Open `https://YOUR-SITE/<your NEXT_PUBLIC_ADMIN_PATH>`, sign in, and scan the QR code with an authenticator app. Two-factor is required for everyone on the team.
6. Load the catalogue: Products → Import CSV, using `data/products.csv` (or your own file in the same format).
7. **Payment listener on Railway** (the service Paystack calls after each payment):
   - New Railway service from this repository. Set the **start command** to `npm run start:listener` (it does not need `next build`). Set the health-check path to `/health`.
   - Variables on that service: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, `NEXT_PUBLIC_SITE_URL`, and (when email is ready) `RESEND_API_KEY`, `EMAIL_FROM`. It refuses to start if a required one is missing.
   - Paystack dashboard → Settings → API Keys & Webhooks → webhook URL `https://YOUR-RAILWAY-DOMAIN/paystack/webhook`. This is the only webhook address (the site itself has no webhook route).
   - What it does: checks the HMAC-SHA512 signature of the raw request body using your secret key, asks Paystack to confirm the payment, marks the order paid, sends the confirmation email. If anything is temporarily down it answers 500 so Paystack retries.
8. Deploy the site on Vercel with the same variables (it still needs `PAYSTACK_SECRET_KEY` to start payments). Then work through `SECURITY.md` before using live keys.
10. **First time in the team area:** open **Settings** and check/replace every placeholder (WhatsApp number, phone, email, address, delivery fees, spa prices, CEO page). Until you save, the shop shows the starting values from `content/defaults.js`.
9. **Email:** verify your domain in Resend, then set `RESEND_API_KEY` and `EMAIL_FROM` on both Vercel and Railway. Until then no emails are sent and nothing breaks.

## Changing prices, contact details and page text (no code, no developer)
Sign in to the team area as an admin → **Settings**. Everything below is stored in the database and goes live the moment you press Save:

| Tab | What you can change |
|---|---|
| Business & contact | shop name, tagline, announcement bar, WhatsApp, phone, email, address, opening hours, social links |
| Delivery & returns | Lagos and other-state delivery fees, the free-delivery amount, delivery times, return window, processing note |
| Spa menu & prices | page heading and intro, every treatment (name, duration, price, description) |
| FAQ | add, edit, reorder and remove questions |
| About page | story, sections, trust badges |
| CEO page | name, title, portrait (upload), quote, story, social links |
| Login security | how many wrong passwords lock an account, and for how long |

Answers and texts can contain tokens such as `{{otherFee}}`, `{{freeThreshold}}`, `{{returnDays}}`, `{{email}}`: they are replaced with the current saved values, so a price typed in the FAQ can never go out of date. The delivery fee is shown to the customer and charged from the same saved setting, and checkout refuses to charge an amount different from the one the customer was shown.

Privacy, Terms and Returns text: team area → **Legal pages** (the built-in drafts live in `content/legal.js`).

`content/defaults.js` holds only the **starting values** used until something is saved (and as a safety net if the database cannot be reached). You do not need to edit it.

Product photos: upload them in the team area (Edit product). The database stores each photo's **web address (URL)**, and the file itself sits in Supabase Storage. A CSV import may only point at photos hosted on your Supabase project or Cloudinary; any other website is removed and reported, because the browser would refuse to show it.

## Tests and checks
- `npm test` runs 74 unit tests: prices, discounts, Paystack signature, the payment listener (forged/tampered/oversized requests, retries, once-only emails), email templates, the sign-in lockout logic, the settings rules (every field's limits, bad data, tokens), CSV import and image rules, catalogue filtering, admin address rules and the legal-page renderer.
- `supabase/tests/` holds database tests (attacks as anonymous / customer / staff without two-factor / admin, the payment flow, the exact permission list of every role, the 15 → 30 → 60 minute lockout with a simulated clock, and settings saving). Run them with `supabase/tests/run.sh` on any plain PostgreSQL 16 (not your Supabase project; the script header explains how). `00_supabase_stub.sql` imitates Supabase's login functions. They all passed on PostgreSQL 16, and each test was shown to fail when its rule was deliberately broken.

## Known items
- `npm audit` reports a high-severity PostCSS issue bundled inside Next 15 (the PostCSS advisories concern CSS that an attacker controls, such as source-map comments in CSS being processed). No Next 15 release fixes it; the fix is Next 16, a major upgrade. This site only processes its own stylesheet at build time. Plan the Next 16 upgrade as a separate, tested change after launch.
- The legal text is a **draft** built from how the shop works. A Nigerian lawyer must review it before launch.
- Rate limiting for the public forms is in memory (see `SECURITY.md`).
- **Sign-in lockout limits:** the lockout is enforced on your server, but Supabase's own sign-in address is public, so someone who calls it directly skips the lockout. They still cannot get in without the authenticator code. See `SECURITY.md` for the two ways to close this fully.

## Not verified here
- Live Paystack payments and a real Supabase project's sign-in / two-factor were not exercised (no keys). Test the whole flow with Paystack **test** keys before real money: success, failed card, abandoned payment, duplicate webhook, sold-out item, cancel-then-pay.
- Resend delivery was tested with a simulated Resend, not a real send.
- The Railway service was run locally as a plain Node process; deploy and send a Paystack test event to confirm it end to end.
