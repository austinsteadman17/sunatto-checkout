# Sunatto Surcharge Checkout (Netlify)

Custom checkout for both the 20% deposit and the 80% final balance:
ACH (bank debit) and debit cards have **no surcharge**. Credit cards get a
**3% surcharge** (the US cap — see "Compliance" below).

Two pages:
- `intake.html` — internal tool for sales reps. They fill in the customer's
  name, address, email, phone, and the **total project cost**; the page
  automatically computes the locked 20% or 80% amount and hands everything
  off to `checkout.html`.
- `checkout.html` — the customer-facing payment page. One page/backend
  handles both payment types — which one is which is just a URL parameter.

## Before you deploy

1. **Get the Texas surcharge question signed off by an attorney.** Texas has
   a state law that nominally bans surcharges; a 2018 federal court ruling
   blocked its enforcement, but the legal landscape is unsettled. Confirm
   this is safe before pointing this at real customers.
2. **The surcharge logic has been tested end-to-end in Stripe test mode**
   (test cards, disclosure screen, and successful charge all confirmed
   working). The **Monday.com sync has NOT been tested against the live
   Monday API** — this was built in an environment that cannot reach
   `api.monday.com`. Test it with one real payment against a real board item
   before relying on it (see "Testing the Monday.com sync" below).

## Deploying to Netlify

1. Push this folder to a GitHub (or GitLab/Bitbucket) repo.
2. In Netlify: **Add new site > Import an existing project**, connect the
   repo. Netlify will read `netlify.toml` automatically — build command
   `npm install`, publish directory `public`, functions directory
   `netlify/functions`.
3. In **Site settings > Environment variables**, add:
   - `STRIPE_SECRET_KEY` — start with a test key (`sk_test_...`), switch to
     the live key (`sk_live_...`) only after testing is done.
   - `STRIPE_PUBLISHABLE_KEY` — matching `pk_test_...` or `pk_live_...`.
   - `MONDAY_API_TOKEN` — optional, but required for the Monday.com sync
     (see below). Without it, payments still work fine — the sync is
     skipped silently and logged.
   - `POSTMARK_SERVER_TOKEN` — optional, but required for the "Send to
     Homeowner by Email" button (see "Send to Homeowner email" below).
     Without it, payments/links still work fine — office staff just fall
     back to the "Copy" link.
   - `RADAR_PUBLISHABLE_KEY` — optional, enables address autocomplete on
     `intake.html`'s Address field (see "Address autocomplete" below).
     Without it, the Address field is just a plain text field like before.
4. Deploy. Netlify gives you a URL like `https://your-site.netlify.app`.
   You can attach a custom domain (e.g. `pay.southernenergydistributors.com`)
   under Domain settings.

## Sales rep workflow

1. Rep opens `intake.html` (optionally `intake.html?type=balance` to default
   to the 80% balance instead of the 20% deposit — either can be switched
   right on the page).
2. Rep fills in the customer's full name, address, email, phone, and the
   **total project cost**. The "Amount due" box updates live and is
   read-only — it is always 20% or 80% of the total cost, never manually
   typed.
3. Once name, address, and a total cost are entered, a "Continue to
   Payment" button, a "Send to Homeowner by Email" button, and a copyable
   link all become available:
   - **Continue to Payment** navigates the same device straight to
     `checkout.html` with everything pre-filled — use this when the rep is
     handing their phone/laptop directly to the homeowner.
   - **Send to Homeowner by Email** (requires a valid email address entered
     above, and `POSTMARK_SERVER_TOKEN` set — see "Send to Homeowner email"
     below) automatically emails the payment link to the homeowner — no
     copy/paste needed.
   - **Copy** grabs a full link to text or email manually instead, for when
     `POSTMARK_SERVER_TOKEN` isn't set or the rep prefers to send it a
     different way.

## Building payment links directly (skipping the intake page)

A link to `checkout.html` looks like:

```
https://your-site.netlify.app/checkout.html?type=deposit&amount=4600.00&name=Ismael+Martinez&email=ismael%40example.com&phone=2105550123&address=103+Kim+Drive%2C+Del+Rio%2C+TX
https://your-site.netlify.app/checkout.html?type=balance&amount=18400.00&name=Evan+Shiels&email=evan%40example.com
```

Parameters:
- `type` — `deposit` or `balance` (controls page title and Stripe metadata only; the surcharge logic is identical for both).
- `amount` — the BASE amount in dollars, before any surcharge. If omitted, the customer is shown an editable "Amount" field instead of a locked one — normally you won't hit this if the link came from `intake.html`, since it always fills this in.
- `name`, `email`, `phone`, `address` — all optional, used to pre-fill/create the Stripe customer and (if `MONDAY_API_TOKEN` is set) to match the payment back to the right Monday.com board item.

## Local development / testing

```bash
npm install
cp .env.example .env   # fill in your Stripe TEST secret + publishable keys, and MONDAY_API_TOKEN if testing that
npm start
```

Then open `http://localhost:3000/intake.html` to test the rep flow, or go
straight to
`http://localhost:3000/checkout.html?type=deposit&amount=100.00&name=Test+Customer&email=test%40example.com`.

Use Stripe's test cards to confirm the surcharge logic:
- `4242 4242 4242 4242` — Visa **credit** test card → should show a 3% surcharge.
- `4000 0566 5566 5556` — Visa **debit** test card → should show NO surcharge.
- Test bank account (ACH) via Stripe's test bank flow → should show NO surcharge.

Confirm in each case that the breakdown screen shows the right numbers
*before* the payment is confirmed, and that the final charged amount in the
Stripe test dashboard matches what was shown to the "customer."

## How the surcharge is actually calculated (technical)

This uses Stripe's surcharge feature, which is in **public preview**
(`Stripe-Version: 2026-03-25.preview`). Flow:

1. `POST /api/create-intent` creates a PaymentIntent for the base amount, allowing both `card` and `us_bank_account`. Customer name, phone, and job address are stored in PaymentIntent metadata for the Monday.com sync (below).
2. The customer fills in the Stripe Payment Element on the page and clicks Continue. The frontend calls `stripe.elements({..., paymentMethodCreation: 'manual'})` and then `stripe.createPaymentMethod` to tokenize their payment method *without* confirming yet. (The `paymentMethodCreation: 'manual'` flag is required — without it, Stripe throws an IntegrationError on `createPaymentMethod` that silently breaks the flow.)
3. `POST /api/payment-method-info` looks up that payment method's type/funding (`credit`, `debit`, `prepaid`, or bank account) and calculates the surcharge (3% if — and only if — it's a credit card).
4. The customer sees a breakdown (subtotal, surcharge if any, total) and must explicitly click "Confirm and Pay" — or back out and pick a different payment method. This disclosure-before-charging step is a hard requirement from Stripe/card network rules, not optional UX.
5. `POST /api/finalize` updates the PaymentIntent's amount and `amount_details.surcharge` fields, confirms it, and responds to the customer immediately. If the payment succeeded, it *then* (fire-and-forget, after the response is already sent) tries to sync the result to Monday.com.
6. If the card requires extra authentication (3D Secure), the frontend handles that via `stripe.handleNextAction`.

## Monday.com sync (new)

When a payment succeeds, `server.js` tries to:

1. Find the matching item on the "Sunatto Pipeline 2026" board (ID `18412868315`) by comparing the customer name AND address against every item's name and "Address" column (`location_mkrw6nb2`) — the same name+address matching the scheduled invoice-drafting tasks already use, so same-name-different-address jobs (e.g. "Evan Shiels" vs "Evan Shiels 2") are never confused.
2. If **exactly one** item matches, set its status column (`color_mm59rxn` for a 20% deposit, `color_mm59vk78` for an 80% balance) to "Paid".
3. Post an update on that item mentioning Nicole (`@Nicole please update your boards accordingly`).
4. If zero or more than one item matches, or `MONDAY_API_TOKEN` isn't set, or the Monday API call fails for any reason — it logs why and does nothing further. **This never affects the payment itself**; the customer's success screen and the actual Stripe charge are completely independent of whether the Monday sync succeeds.

### Getting a Monday.com API token

In Monday.com: click your avatar (bottom left) → **Admin** → **API**, or go
to your profile → **Developers** → **My access tokens**, and generate a
personal API token (or use an existing one with access to the "Sunatto
Pipeline 2026" board). Add it to Netlify as `MONDAY_API_TOKEN`.

### Testing the Monday.com sync

This has **not** been tested against the real Monday.com API — the sandbox
this was written in can't reach `api.monday.com`, same limitation as the
original Stripe surcharge code before it was tested. Before trusting it:

1. Make a real test payment (in Stripe test mode) using a name and address
   that exactly match one existing board item.
2. Check that item's status column actually flipped to "Paid" and that an
   update was posted.
3. **Specifically check whether the "@Nicole" mention actually notifies
   her** (shows as a real tagged mention, not just plain text) — Monday's
   API mention format (`mentions_list` on `create_update`) is implemented
   here per Monday's current docs, but this is exactly the kind of detail
   that's worth eyeballing once for real before relying on it.
4. Check the Netlify function logs (Project → Logs → Functions) for any
   `Monday.com sync failed` messages if something doesn't show up as
   expected — every failure is logged with the reason (no match, multiple
   matches, missing token, or an API error).

## Send to Homeowner email (new)

`intake.html` can automatically email the payment link to the homeowner
instead of the rep having to copy/paste it, using
[Postmark](https://postmarkapp.com) as the transactional email provider.

- Sends from `billing@quotes.southernenergydistributors.com` (a subdomain
  dedicated to this, so it never touches the company's main email/MX
  records), with Reply-To set to `office@southernenergydistributors.com` so
  any homeowner reply lands in a real inbox.
- The email includes the amount due, job address, a "Pay Now" button
  linking straight to `checkout.html` with everything pre-filled, and the
  same 3% credit-card-surcharge disclosure and phone number used elsewhere.
- If `POSTMARK_SERVER_TOKEN` isn't set, or the Postmark API call fails for
  any reason, the button shows an error and the rep can fall back to the
  "Copy" link — this never blocks or breaks the rest of the intake flow.

### Getting a Postmark server token

In Postmark: **Servers** → select (or create) a server → **API Tokens** →
copy the **Server API token** shown there. Add it to Netlify as
`POSTMARK_SERVER_TOKEN`.

This also requires a **verified sending domain** in Postmark
(`quotes.southernenergydistributors.com` in this build) — under
**Sender Signatures** → the domain → add the DKIM (TXT) and Return-Path
(CNAME) DNS records shown there at your DNS provider. No MX record is
required for sending. (Postmark was chosen over Resend specifically
because Resend's setup requires an MX record on the sending subdomain,
which Wix — this domain's original DNS host — doesn't support publishing
on a subdomain.)

### Testing the Send to Homeowner email

This has **not** been tested against the real Postmark API — same sandbox
limitation as the Stripe and Monday.com code above (this environment can't
reach `api.postmarkapp.com` either). Before trusting it:

1. Fill out `intake.html` with your own email address as the "customer
   email" and click **Send to Homeowner by Email**.
2. Confirm the email actually arrives (check spam too, until DMARC is set
   up — see the "Monitor email authentication" prompt in Postmark).
3. Click the "Pay Now" button in the email and confirm it lands on
   `checkout.html` with the right amount, name, address, and type
   pre-filled.
4. Check the Netlify function logs (Project → Logs → Functions) for any
   `send-homeowner-email` errors if the button reports a failure.

## Address autocomplete (new)

`intake.html`'s Address field uses [Radar](https://radar.com) for address
autocomplete (chosen because it's genuinely free to start — no credit card
required, 100,000 free autocomplete requests/month). The "Total project
cost" field (and the manual amount field on `checkout.html`, if a link is
opened without a locked amount) also now auto-format with commas as you
type, e.g. typing `18500` shows `18,500`.

### Getting a Radar publishable key

1. [Sign up](https://radar.com/signup) for a free Radar account (no credit
   card needed).
2. In the Radar dashboard, go to **Settings → API Keys** and copy the
   **Publishable key** (starts with `prj_live_pk_...` for production, or
   `prj_test_pk_...` for testing).
3. Add it to Netlify as `RADAR_PUBLISHABLE_KEY`.

This key is meant to be used directly in the browser (same trust model as
Stripe's publishable key) — it's not a secret, so there's no security risk
in it being visible in the page's network requests.

If this variable isn't set, `intake.html` still works exactly as before —
the Address field just stays a plain text field with no suggestions.

## Compliance notes (read this)

- **3% is the real US cap** once you accept both Visa and Mastercard (Visa allows up to 3%, Mastercard up to 4% — you're bound by the lower one). Don't raise this rate without re-checking current network rules.
- **Credit cards only.** Debit cards — including debit-funded Apple Pay/Google Pay — cannot legally be surcharged in the US. The code already enforces this by checking `card.funding`, but double check Amex's own surcharge policy specifically, as they've historically been stricter than Visa/Mastercard.
- The surcharge must be **disclosed before charging** and shown as a **separate line on the receipt** — both handled in this build, and confirmed visually in a live test-mode transaction.
- **Refunds must prorate the surcharge.** `POST /api/refund` in `server.js` does the math, but it isn't wired up to any UI yet — right now refunds happen manually in the Stripe dashboard, so whoever processes a refund needs to either use this endpoint or manually include the prorated surcharge.

## Known gaps / follow-ups

- No sales-rep attribution yet — payments aren't tagged to a specific rep. Easy to add later as a field on `intake.html` plus a metadata field, if commission tracking becomes a priority.
- The Monday.com sync only fires on a *successful* payment through this page. If a rep fills out `intake.html` and the homeowner never completes the payment, there's currently no record of that anywhere (no different from before this build existed, but worth knowing).
- No admin UI for reviewing past payments outside of Stripe's own dashboard.
- Monday.com sync is untested against the live API (see above) — verify with one real transaction before relying on it.
- Send to Homeowner email is untested against the live Postmark API (see above) — send yourself a real test email before relying on it.
- DMARC isn't set up yet for `quotes.southernenergydistributors.com` (Postmark flags this) — worth adding once the domain has a bit of real sending history, for better inbox placement.
- Address autocomplete (Radar) is untested against the live Radar API — verify once `RADAR_PUBLISHABLE_KEY` is set that suggestions actually appear while typing in `intake.html`'s Address field.
