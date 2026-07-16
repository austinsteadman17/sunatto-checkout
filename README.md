# Sunatto Surcharge Checkout (Netlify)

Custom checkout for both the 20% deposit and the 80% final balance:
ACH (bank debit) and debit cards have **no surcharge**. Credit cards get a
**3% surcharge** (the US cap — see "Compliance" below).

One page/backend handles both payment types — which one is which is just a
URL parameter.

## Before you deploy

1. **Get the Texas surcharge question signed off by an attorney.** Texas has
   a state law that nominally bans surcharges; a 2018 federal court ruling
   blocked its enforcement, but the legal landscape is unsettled. Confirm
   this is safe before pointing this at real customers.
2. **This code has not been tested against live Stripe.** It was written in
   an environment that couldn't reach `api.stripe.com` at all, so there was
   no way to run it end-to-end before handing it off. Test thoroughly in
   Stripe **test mode** first (see "Testing" below) before switching to live
   keys.

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
4. Deploy. Netlify gives you a URL like `https://your-site.netlify.app`.
   You can attach a custom domain (e.g. `pay.southernenergydistributors.com`)
   under Domain settings.

## Building the actual payment links

Once deployed, a link looks like:

```
https://your-site.netlify.app/checkout.html?type=deposit&amount=4600.00&name=Ismael+Martinez&email=ismael%40example.com
https://your-site.netlify.app/checkout.html?type=balance&amount=18400.00&name=Evan+Shiels&email=evan%40example.com
```

Parameters:
- `type` — `deposit` or `balance` (controls page title and Stripe metadata only; the surcharge logic is identical for both).
- `amount` — the BASE amount in dollars, before any surcharge (e.g. the 20% or 80% figure you'd already calculated). The surcharge is added on top of this automatically if the customer pays by credit card.
- `name`, `email` — optional, used to pre-fill/create the Stripe customer.

Whoever currently sends out the old Payment Link URL (sales reps / office
staff) would send one of these instead, with the right amount filled in.

## Local development / testing

```bash
npm install
cp .env.example .env   # fill in your Stripe TEST secret + publishable keys
npm start
```

Then open `http://localhost:3000/checkout.html?type=deposit&amount=100.00&name=Test+Customer&email=test%40example.com`.

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

1. `POST /api/create-intent` creates a PaymentIntent for the base amount, allowing both `card` and `us_bank_account`.
2. The customer fills in the Stripe Payment Element on the page and clicks Continue. The frontend calls `stripe.createPaymentMethod` to tokenize their payment method *without* confirming yet.
3. `POST /api/payment-method-info` looks up that payment method's type/funding (`credit`, `debit`, `prepaid`, or bank account) and calculates the surcharge (3% if — and only if — it's a credit card).
4. The customer sees a breakdown (subtotal, surcharge if any, total) and must explicitly click "Confirm and Pay" — or back out and pick a different payment method. This disclosure-before-charging step is a hard requirement from Stripe/card network rules, not optional UX.
5. `POST /api/finalize` updates the PaymentIntent's amount and `amount_details.surcharge` fields, then confirms it.
6. If the card requires extra authentication (3D Secure), the frontend handles that via `stripe.handleNextAction`.

## Compliance notes (read this)

- **3% is the real US cap** once you accept both Visa and Mastercard (Visa allows up to 3%, Mastercard up to 4% — you're bound by the lower one). Don't raise this rate without re-checking current network rules.
- **Credit cards only.** Debit cards — including debit-funded Apple Pay/Google Pay — cannot legally be surcharged in the US. The code already enforces this by checking `card.funding`, but double check Amex's own surcharge policy specifically, as they've historically been stricter than Visa/Mastercard.
- The surcharge must be **disclosed before charging** and shown as a **separate line on the receipt** — both handled in this build, but worth verifying visually after a real test transaction.
- **Refunds must prorate the surcharge.** `POST /api/refund` in `server.js` does the math, but it isn't wired up to any UI yet — right now refunds happen manually in the Stripe dashboard, so whoever processes a refund needs to either use this endpoint or manually include the prorated surcharge.

## Known gaps / follow-ups

- No webhook listener yet for updating Monday.com automatically when one of these payments succeeds (the existing scheduled tasks check Stripe directly instead, so this isn't strictly required, but could be added later for speed).
- No admin UI for generating the payment links themselves — right now whoever sends payment requests needs to construct the URL by hand (or we build a small internal tool for that later).
- Not tested against live Stripe at all yet (see "Before you deploy" above).
