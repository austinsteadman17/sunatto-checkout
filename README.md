# Sunatto Surcharge Checkout (Netlify)

Custom checkout for both the 20% deposit and the 80% final balance:
ACH (bank debit) and debit cards have **no surcharge**. Credit cards get a
**3% surcharge** (the US cap — see "Compliance" below).

Three pages:
- `intake.html` — internal tool for sales reps. They fill in the customer's
  name, address, email, phone, and the **total project cost**; the page
  automatically computes the locked 20% or 80% amount and hands everything
  off to `checkout.html`.
- `checkout.html` — the customer-facing payment page. One page/backend
  handles both payment types — which one is which is just a URL parameter.
- `hub.html` — internal "Payment Links Hub" for staff to see every link
  that's been sent out, whether it's been paid, and resend one if needed
  (see "Payment Links Hub" below).

## Before you deploy

1. **Get the Texas surcharge question signed off by an attorney.** Texas has
   a state law that nominally bans surcharges; a 2018 federal court ruling
   blocked its enforcement, but the legal landscape is unsettled. Confirm
   this is safe before pointing this at real customers.
2. **The surcharge logic has been tested end-to-end in Stripe test mode**
   (test cards, disclosure screen, and successful charge all confirmed
   working). The **Monday.com sync, the Payment Links Hub, and address
   autocomplete have NOT been tested against their respective live APIs**
   — this was built in an environment that cannot reach `api.monday.com`,
   Netlify Blobs, or Mapbox. Test each one for real before relying on it
   (see each section below).

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
   - `MONDAY_API_TOKEN` — required for both the Monday.com sync (see below)
     **and** the Payment Links Hub (see below), since the hub reads the
     Sunatto Pipeline 2026 board directly to decide who can see what.
     Without it, payments still work fine — the sync is skipped silently
     and logged, and the hub will show every logged-in person zero jobs.
   - `POSTMARK_SERVER_TOKEN` — optional, but required for the "Send to
     Homeowner by Email" button (see "Send to Homeowner email" below) and
     the hub's "Resend" button. Without it, payments/links still work
     fine — office staff just fall back to the "Copy" link.
   - `MAPBOX_ACCESS_TOKEN` — optional, enables address autocomplete on
     `intake.html`'s Address field (see "Address autocomplete" below).
     Without it, the Address field is just a plain text field like before.
   - `NETLIFY_BLOBS_TOKEN` — required for `/hub.html` to actually work
     (see "Payment Links Hub" below for why and how to get one). Without
     it, the hub shows an error instead of the login screen.
4. Deploy. Netlify gives you a URL like `https://your-site.netlify.app`.
   You can attach a custom domain (e.g. `pay.southernenergydistributors.com`)
   under Domain settings.

The Payment Links Hub's storage uses
[Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/),
which is built into every Netlify project (no separate database to stand
up) — but it does need one manual token, `NETLIFY_BLOBS_TOKEN` (see below),
because this project's Express server runs inside a Netlify Function via
`serverless-http`, and Blobs' normal zero-configuration auto-detection
doesn't reach through that wrapper.

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
4. Whichever of those three actions is used, the link is also silently
   recorded to the Payment Links Hub (`hub.html`) — see below.

## Building payment links directly (skipping the intake page)

A link to `checkout.html` looks like:

```
https://your-site.netlify.app/checkout.html?type=deposit&amount=4600.00&name=Ismael+Martinez&email=ismael%40example.com&phone=2105550123&address=103+Kim+Drive%2C+Del+Rio%2C+TX
https://your-site.netlify.app/checkout.html?type=balance&amount=18400.00&name=Evan+Shiels&email=evan%40example.com
```

Parameters:
- `type` — `deposit` or `balance` (controls page title and Stripe metadata only; the surcharge logic is identical for both).
- `amount` — the BASE amount in dollars, before any surcharge. If omitted, the customer is shown an editable "Amount" field instead of a locked one — normally you won't hit this if the link came from `intake.html`, since it always fills this in.
- `name`, `email`, `phone`, `address` — all optional, used to pre-fill/create the Stripe customer and (if `MONDAY_API_TOKEN` is set) to match the payment back to the right Monday.com board item and to the Payment Links Hub.

Links built this way (bypassing `intake.html`) are **not** recorded to the
Payment Links Hub, since only `intake.js` calls `POST /api/links` — they'll
still work fine for payment, just won't show up on `hub.html`.

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

Note: Netlify Blobs (used by the Payment Links Hub) generally needs either
`netlify dev` (instead of `npm start`) or a deployed Netlify environment to
work — plain `node server.js` locally may not have Blobs access. The hub's
core payment-link recording will still work everywhere else either way.

## How the surcharge is actually calculated (technical)

This uses Stripe's surcharge feature, which is in **public preview**
(`Stripe-Version: 2026-03-25.preview`). Flow:

1. `POST /api/create-intent` creates a PaymentIntent for the base amount, allowing both `card` and `us_bank_account`. Customer name, phone, and job address are stored in PaymentIntent metadata for the Monday.com sync (below).
2. The customer fills in the Stripe Payment Element on the page and clicks Continue. The frontend calls `stripe.elements({..., paymentMethodCreation: 'manual'})` and then `stripe.createPaymentMethod` to tokenize their payment method *without* confirming yet. (The `paymentMethodCreation: 'manual'` flag is required — without it, Stripe throws an IntegrationError on `createPaymentMethod` that silently breaks the flow.)
3. `POST /api/payment-method-info` looks up that payment method's type/funding (`credit`, `debit`, `prepaid`, or bank account) and calculates the surcharge (3% if — and only if — it's a credit card).
4. The customer sees a breakdown (subtotal, surcharge if any, total) and must explicitly click "Confirm and Pay" — or back out and pick a different payment method. This disclosure-before-charging step is a hard requirement from Stripe/card network rules, not optional UX.
5. `POST /api/finalize` updates the PaymentIntent's amount and `amount_details.surcharge` fields, confirms it, and responds to the customer immediately. If the payment succeeded, it *then* (fire-and-forget, after the response is already sent) tries to sync the result to Monday.com and to mark the matching Payment Links Hub record "paid" (see below).
6. If the card requires extra authentication (3D Secure), the frontend handles that via `stripe.handleNextAction`.

## Monday.com sync (existing)

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

## Payment Links Hub (new)

`hub.html` gives staff one place to see every link `intake.html` has
generated, whether it's been paid, and a "Resend" button — instead of
digging back through old texts/emails to figure out what's outstanding.

### How it works

- **Recording links.** Every time a rep uses Copy Link, Send Email, or
  Continue to Payment on `intake.html`, the job's details are silently
  recorded (`POST /api/links`) to a small JSON store in
  [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)
  — no extra sign-up, it's built into this same Netlify project.
- **Marking links paid.** After a payment succeeds, `server.js`
  (`findAndMarkLinkPaid`) tries to match it — by customer name, address,
  type, and base amount, same fuzzy matching as the Monday sync — to
  exactly one unpaid link record, and marks it paid. If it can't find
  exactly one confident match, it does nothing and logs why; this never
  affects the payment itself.
- **Who can see what.** This is the important part: **visibility on the
  hub is 100% driven by the "Sunatto Pipeline 2026" Monday board**, not by
  any separate role/permission you have to maintain. When someone logs
  into the hub, the server looks up every board item where that person's
  name appears in the **Sales Rep**, **Office**, or **Manager** column
  (all three checked the same way), and shows only the payment links whose
  customer name + address match one of those jobs. In practice, Office and
  Manager tend to be the same handful of people attached to nearly every
  job, so they naturally end up seeing most/all jobs — Sales Reps see just
  their own. There's no separate "admin" flag to manage: add or remove
  someone from a job in Monday, and their hub visibility updates
  automatically next time they load the page.
- **Generating a link from the hub.** The **"+ Generate Link"** button
  lets someone create a payment link without going through `intake.html`
  at all. It shows a picker of just the Monday jobs that person is
  attached to (same Sales Rep/Office/Manager rule as above), and picking
  one pre-fills email, phone, and total project cost straight from the
  Monday board's Email / Customer Phone / Total Cost columns — all still
  editable, since that Monday data can be stale or incomplete. From there
  it works exactly like `intake.html`: pick 20% Deposit or 80% Balance,
  then Continue to Payment, Send to Homeowner by Email, or Copy Link. It
  calls the exact same `/api/links` and `/api/send-homeowner-email`
  endpoints `intake.html` does, so anything generated this way shows up
  on the Sent Links list immediately, same fuzzy-matching and "mark paid"
  behavior included.

### Logging in

There's no email/password account system — just first/last name + a PIN:

1. **First visit (on any device):** enter your first and last name. If
   that's a name the hub hasn't seen before, it asks you to create a 4-6
   digit PIN.
2. **Returning to the same device:** the name is remembered in the
   browser's local storage, so you'll just see "Welcome back, \[name]" and
   a PIN field — no need to retype your name. Use **"Not you? Switch
   user"** if a different person is using this device (e.g. a shared
   office computer).
3. **New browser session, same device:** the actual login session clears
   whenever the browser/tab fully closes, so you'll be asked for your PIN
   again next time you open the page — but again, not your name, since
   that part's remembered.

### Changing your PIN

Anyone can change their own PIN from inside the hub — click **"Change
PIN"** next to your name (top right of Sent Links), enter your current
PIN and a new 4-6 digit one, and save. This requires knowing your current
PIN; if you've forgotten it, an admin needs to reset it for you (see
"Admin access" below).

### Admin access

One person — **Austin Steadman** — is a permanent admin, hardcoded into
`server.js` (`BOOTSTRAP_ADMIN_NAMES`) so there's always at least one admin
account without needing a chicken-and-egg setup step. Admins get two
things regular accounts don't:

- **Full visibility.** An admin's Sent Links list and Generate Link job
  picker show *every* job on the Sunatto Pipeline 2026 board, not just
  ones where their name is in the Sales Rep/Office/Manager column.
- **The Admin panel** (a new "Admin" button appears next to "+ Generate
  Link" for admins only) where you can:
  - See every hub account and whether they're an admin.
  - Create a new account on someone's behalf (useful for onboarding
    without handing them your device) — you set their starting PIN, and
    they can change it themselves afterward.
  - **Reset anyone's PIN** without knowing their old one — this is the
    fix for "I forgot my PIN," replacing the old workaround of manually
    editing the Netlify Blobs store.
  - Promote another account to admin, or remove admin access from one
    (you can't remove Austin's — the bootstrap name above is always
    treated as admin regardless of what's stored).
  - Delete an account entirely (they'd just create a new one under the
    same name if they need access again).

To make someone else a permanent admin the same way Austin is, add their
name (normalized the same way as everywhere else in this file — lowercase,
no punctuation) to `BOOTSTRAP_ADMIN_NAMES` in `server.js`. Otherwise, use
the Admin panel's promote/demote toggle for everyone else.

### Getting set up

Two things beyond what's already needed for the Monday.com sync above:

1. **`NETLIFY_BLOBS_TOKEN`** — Netlify Blobs (used to store links and user
   accounts) is supposed to configure itself automatically with zero setup
   inside any Netlify Function, but that auto-detection doesn't reach
   through this project's `serverless-http` wrapper (see
   `netlify/functions/api.js`) — without this token, `/hub.html` shows
   "The environment has not been configured to use Netlify Blobs" instead
   of the login screen. To fix it:
   1. In Netlify, go to your **User settings** (click your avatar, top
      right) → **Applications** → **Personal access tokens** → **New
      access token**.
   2. Give it a name (e.g. "Sunatto Blobs") and generate it.
   3. Add it to this site as `NETLIFY_BLOBS_TOKEN`.
   No other configuration is needed — `SITE_ID` (the other piece Blobs
   needs) is already set automatically by Netlify in every Function.
2. **`MONDAY_API_TOKEN`** (same one as the Monday.com sync) — the hub
   reuses it to read the Sales Rep / Office / Manager columns. Just make
   sure whoever's using the hub has their name entered in Monday
   **exactly (or close to) how they'll type it when logging in** —
   matching is fuzzy (case/punctuation-insensitive, substring-based) but
   it's still name-text matching, not a hard user ID link.

### Testing the Payment Links Hub

This has **not** been tested against the real Netlify Blobs or Monday APIs
— same sandbox limitation as everything else above. Before trusting it:

1. Send a test link to yourself from `intake.html`, then open `hub.html`,
   create an account under your own name, and confirm the link shows up
   (it will only show up if your name is in the Sales Rep, Office, or
   Manager column of a Monday item matching that job's name + address).
2. Make a real test payment against that link and confirm it flips to
   "Paid" on the hub.
3. Try **Resend** and confirm the homeowner actually gets a second email.
4. Log in as someone attached to a *different* job (or a made-up name with
   no jobs) and confirm they do **not** see links that aren't theirs.
5. Click **"+ Generate Link,"** confirm the job picker only shows jobs
   that account is attached to, pick one, confirm email/phone/total cost
   pre-fill correctly, and confirm Continue/Send Email/Copy Link all work
   and the resulting link shows up back on the Sent Links list.
6. Check the Netlify function logs (Project → Logs → Functions) for
   `hub/`, `create link`, `list links`, or `resend link` errors if
   anything doesn't behave as expected.

### Known limitations (read before relying on this for real access control)

- **PINs are a low-security convenience, not a strong credential.** A 4-6
  digit PIN is guessable with enough attempts; there's currently no
  rate-limiting or lockout on `/api/hub/login`. This is fine for an
  internal tool among trusted staff, but don't treat it as a strong
  security boundary.
- **Forgotten PINs need an admin.** There's still no *self-serve* reset
  (you must know your current PIN to change it yourself) — but an admin
  can now reset anyone's PIN from the Admin panel (see "Admin access"
  above), so this no longer requires editing the Netlify Blobs store by
  hand.
- **Name matching is fuzzy, not exact.** "Chris Beggs" logging in won't
  match a Monday job assigned to "Christopher Beggs" unless one name is a
  substring of the other after normalizing. Encourage people to log in
  using their name close to however it appears on the Monday board.
- **One active session per person.** Logging in on a new device rotates
  that person's session token, which signs them out of any other device
  still using the old one.

## Send to Homeowner email (existing)

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
- The same underlying send logic also powers the Payment Links Hub's
  "Resend" button (see above).

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

## Address autocomplete (existing)

`intake.html`'s Address field uses [Mapbox's Search Box
API](https://docs.mapbox.com/api/search/search-box/) for address
autocomplete — a small custom dropdown built directly against Mapbox's
`/suggest` and `/retrieve` endpoints (rather than Mapbox's prebuilt widget),
so it matches the existing single-line address field and Sunatto styling
exactly. Mapbox has a generous free tier and genuinely self-serve signup
(no sales call required). The "Total project cost" field (and the manual
amount field on `checkout.html`, if a link is opened without a locked
amount) also now auto-format with commas as you type, e.g. typing `18500`
shows `18,500`.

### Getting a Mapbox access token

1. [Sign up](https://account.mapbox.com/auth/signup/) for a free Mapbox
   account (self-serve, no demo/sales call needed).
2. In the Mapbox account dashboard, go to **Tokens** and copy your
   **Default public token** (starts with `pk.`), or create a new one
   scoped to just the Search/Geocoding APIs.
3. Add it to Netlify as `MAPBOX_ACCESS_TOKEN`.

This is a *public* access token, meant to be used directly in the browser
(same trust model as Stripe's publishable key) — it's not a secret, so
there's no security risk in it being visible in the page's network
requests.

If this variable isn't set, `intake.html` still works exactly as before —
the Address field just stays a plain text field with no suggestions.

## Compliance notes (read this)

- **3% is the real US cap** once you accept both Visa and Mastercard (Visa allows up to 3%, Mastercard up to 4% — you're bound by the lower one). Don't raise this rate without re-checking current network rules.
- **Credit cards only.** Debit cards — including debit-funded Apple Pay/Google Pay — cannot legally be surcharged in the US. The code already enforces this by checking `card.funding`, but double check Amex's own surcharge policy specifically, as they've historically been stricter than Visa/Mastercard.
- The surcharge must be **disclosed before charging** and shown as a **separate line on the receipt** — both handled in this build, and confirmed visually in a live test-mode transaction.
- **Refunds must prorate the surcharge.** `POST /api/refund` in `server.js` does the math, but it isn't wired up to any UI yet — right now refunds happen manually in the Stripe dashboard, so whoever processes a refund needs to either use this endpoint or manually include the prorated surcharge.

## Known gaps / follow-ups

- No sales-rep attribution on the *payment* itself yet — Stripe metadata isn't tagged to a specific rep (the Payment Links Hub now covers "who can see this job," which is different from "who gets commission credit"). Easy to add later as a field on `intake.html` plus a metadata field, if commission tracking becomes a priority.
- The Monday.com sync and Payment Links Hub "paid" status only fire on a *successful* payment through this page. If a rep sends a link and the homeowner never completes the payment, it will just sit as "Unpaid" on the hub indefinitely (which is the intended behavior — that's the point of the hub) but there's no reminder/nudge automation yet.
- No admin UI for reviewing past payments outside of Stripe's own dashboard.
- Monday.com sync is untested against the live API (see above) — verify with one real transaction before relying on it.
- Send to Homeowner email is untested against the live Postmark API (see above) — send yourself a real test email before relying on it.
- DMARC isn't set up yet for `quotes.southernenergydistributors.com` (Postmark flags this) — worth adding once the domain has a bit of real sending history, for better inbox placement.
- Address autocomplete (Mapbox) is untested against the live Mapbox API — verify once `MAPBOX_ACCESS_TOKEN` is set that suggestions actually appear while typing in `intake.html`'s Address field.
- Payment Links Hub is untested against live Netlify Blobs/Monday (see "Testing the Payment Links Hub" above) — PINs have no rate-limiting/lockout and no self-serve reset yet (see "Known limitations" above).
