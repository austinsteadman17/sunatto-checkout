// Sunatto / Southern Energy Distributors — custom surcharge checkout.
//
// Handles BOTH the 20% deposit and the 80% final balance. Which one a given
// payment is for is just a "type" query/body param ("deposit" or "balance")
// used for labeling and metadata — the money logic is identical for both:
//   - ACH (us_bank_account): no surcharge, ever.
//   - Card, funding = "credit": add a 3% surcharge (the US cap — see README).
//   - Card, funding = "debit" or "prepaid": no surcharge, same as ACH.
//
// This uses Stripe's surcharging feature, which is in PUBLIC PREVIEW as of
// this writing (Stripe-Version 2026-03-25.preview). See:
// https://docs.stripe.com/payments/cards/surcharge
//
// IMPORTANT: This code has NOT been tested against live Stripe. The sandbox
// this was written in blocks all outbound calls to api.stripe.com, so there
// was no way to run it end-to-end before handing it off. Test thoroughly
// with a Stripe TEST mode secret key (real cards in test mode, e.g.
// 4242 4242 4242 4242 for a Visa credit test card, 4000 0566 5566 5556 for
// a Visa debit test card) before ever pointing this at the live account.

require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const path = require('path');
const Stripe = require('stripe');
const { getStore } = require('@netlify/blobs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('Missing STRIPE_SECRET_KEY in your .env file. See .env.example.');
  process.exit(1);
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Every call that touches surcharge fields needs this preview API version,
// per Stripe's docs. Passed per-request rather than globally so the rest of
// the account's normal API traffic (if any) isn't forced onto a preview
// version.
const PREVIEW_VERSION = { apiVersion: '2026-03-25.preview' };

const SURCHARGE_RATE = 0.03; // 3% — the US cap. Do not raise this without
                             // re-checking current Visa/Mastercard/Amex caps
                             // and Texas legal guidance. See README.

// ---------------------------------------------------------------------
// 1. Create the PaymentIntent for the base amount (no surcharge yet — we
//    don't know the payment method until the customer picks one).
// ---------------------------------------------------------------------
app.post('/api/create-intent', async (req, res) => {
  try {
    const {
      amountCents,
      type,
      customerEmail,
      customerName,
      customerPhone,
      jobAddress,
      description,
    } = req.body;

    if (!amountCents || amountCents <= 0) {
      return res.status(400).json({ error: 'amountCents is required and must be > 0' });
    }
    if (!['deposit', 'balance'].includes(type)) {
      return res.status(400).json({ error: 'type must be "deposit" or "balance"' });
    }

    // Reuse a customer by email if one exists, otherwise create one.
    let customer;
    if (customerEmail) {
      const existing = await stripe.customers.list({ email: customerEmail, limit: 1 });
      customer = existing.data[0];
    }
    if (!customer) {
      customer = await stripe.customers.create({
        email: customerEmail,
        name: customerName,
        phone: customerPhone || undefined,
      });
    } else if (customerPhone && !customer.phone) {
      // Keep the customer record current if we now have a phone number on file.
      await stripe.customers.update(customer.id, { phone: customerPhone });
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: 'usd',
        customer: customer.id,
        payment_method_types: ['card', 'us_bank_account'],
        description: description || (type === 'deposit'
          ? 'Southern Energy Solar Installation — 20% Deposit'
          : 'Southern Energy Solar Installation — Final 80% Balance'),
        metadata: {
          sunatto_payment_type: type,
          base_amount_cents: String(amountCents),
          customer_name: customerName || '',
          customer_phone: customerPhone || '',
          job_address: jobAddress || '',
        },
      },
      PREVIEW_VERSION
    );

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    console.error('create-intent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------
// 2. Once the customer has entered payment details (but before confirming),
//    look up the payment method to find out if a surcharge applies, and
//    how much. The front end uses this to show the disclosure screen.
// ---------------------------------------------------------------------
app.post('/api/payment-method-info', async (req, res) => {
  try {
    const { paymentMethodId, baseAmountCents } = req.body;
    if (!paymentMethodId || !baseAmountCents) {
      return res.status(400).json({ error: 'paymentMethodId and baseAmountCents are required' });
    }

    const pm = await stripe.paymentMethods.retrieve(paymentMethodId, PREVIEW_VERSION);

    let surchargeCents = 0;
    let reason = 'ach_or_debit_no_surcharge';

    if (pm.type === 'card') {
      const funding = pm.card && pm.card.funding; // 'credit' | 'debit' | 'prepaid' | 'unknown'
      if (funding === 'credit') {
        surchargeCents = Math.round(baseAmountCents * SURCHARGE_RATE);
        reason = 'credit_card_surcharge';
      } else {
        reason = `card_funding_${funding}_no_surcharge`;
      }
    }

    res.json({
      paymentMethodType: pm.type,
      cardFunding: pm.card ? pm.card.funding : null,
      cardBrand: pm.card ? pm.card.brand : null,
      baseAmountCents,
      surchargeCents,
      totalCents: baseAmountCents + surchargeCents,
      reason,
    });
  } catch (err) {
    console.error('payment-method-info error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------
// 3. After the customer has SEEN the surcharge breakdown and explicitly
//    confirmed, update the PaymentIntent's amount/surcharge fields.
//
//    IMPORTANT: this endpoint used to also call stripe.paymentIntents.confirm()
//    right here on the server — that worked fine for cards, but broke EVERY
//    ACH/us_bank_account payment with "This PaymentIntent requires a mandate,
//    but no existing mandate was found." Bank-account debits legally require
//    a mandate (the customer's authorization to debit their account), and
//    Stripe can only construct that mandate from the customer's actual
//    browser session (IP address, user agent) at the moment of confirmation
//    — something a server-side Node call can never supply. The fix is to
//    only update the amount/surcharge here, and let the browser do the
//    actual confirm via stripe.confirmPayment() (see checkout.js), which
//    Stripe.js can correctly attach mandate data to. See /api/payment-confirmed
//    below for what used to happen after a successful confirm.
// ---------------------------------------------------------------------
app.post('/api/finalize', async (req, res) => {
  try {
    const { paymentIntentId, baseAmountCents, surchargeCents } = req.body;
    if (!paymentIntentId || baseAmountCents == null) {
      return res.status(400).json({ error: 'paymentIntentId and baseAmountCents are required' });
    }

    const totalCents = baseAmountCents + (surchargeCents || 0);

    const updateParams = { amount: totalCents };
    if (surchargeCents > 0) {
      updateParams.amount_details = {
        surcharge: {
          amount: surchargeCents,
          enforce_validation: 'enabled', // let Stripe reject us if this exceeds the technical cap
        },
      };
    }

    await stripe.paymentIntents.update(paymentIntentId, updateParams, PREVIEW_VERSION);

    res.json({ ready: true });
  } catch (err) {
    console.error('finalize error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// 3b. Called by the browser AFTER stripe.confirmPayment() has resolved
// (client-side — see checkout.js). Re-checks the PaymentIntent's real
// status with Stripe and, if it succeeded or is processing, runs the same
// best-effort Monday.com / payment-links-hub sync that used to run inline
// inside /api/finalize above, before the confirm step moved to the browser.
app.post('/api/payment-confirmed', async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    if (!paymentIntentId) {
      return res.status(400).json({ error: 'paymentIntentId is required' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, PREVIEW_VERSION);

    res.json({ status: paymentIntent.status });

    // Fire-and-forget: don't make the customer wait on Monday.com (or the
    // payment-links hub lookup below), and never let either hiccup affect
    // the payment result already sent above.
    if (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing') {
      syncPaymentToMonday(paymentIntent).catch((err) => {
        console.error('Monday.com sync failed (payment itself was NOT affected):', err);
      });
      findAndMarkLinkPaid(paymentIntent).catch((err) => {
        console.error('Payment-links hub: marking link paid failed (payment itself was NOT affected):', err);
      });
    }
  } catch (err) {
    console.error('payment-confirmed error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// ---------------------------------------------------------------------
// 4. Refunds — surcharge must be refunded proportionally. This is a bare
//    starting point; wire this up to whatever refund workflow the team
//    actually uses (currently, refunds happen manually in the Stripe
//    dashboard — so at minimum, whoever issues a refund needs to manually
//    compute and include the prorated surcharge amount until this endpoint
//    is actually hooked up to a "Refund" button somewhere).
// ---------------------------------------------------------------------
app.post('/api/refund', async (req, res) => {
  try {
    const { paymentIntentId, refundAmountCents, totalChargedCents, surchargeChargedCents } = req.body;
    if (!paymentIntentId || !refundAmountCents || !totalChargedCents) {
      return res.status(400).json({ error: 'paymentIntentId, refundAmountCents, and totalChargedCents are required' });
    }

    // Prorate the surcharge refund: refund_surcharge = surcharge * (refund / total)
    const surchargeRefund = surchargeChargedCents
      ? Math.round((surchargeChargedCents * refundAmountCents) / totalChargedCents)
      : 0;

    const totalRefund = refundAmountCents + surchargeRefund;

    const refund = await stripe.refunds.create(
      { payment_intent: paymentIntentId, amount: totalRefund },
      PREVIEW_VERSION
    );

    res.json({ refund, surchargeRefunded: surchargeRefund, totalRefunded: totalRefund });
  } catch (err) {
    console.error('refund error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------
// 5. Monday.com sync — best effort, fire-and-forget.
//
// When a payment succeeds, try to find the matching item on the
// "Sunatto Pipeline 2026" board (matched the same way the scheduled
// invoice-drafting tasks already match — by customer name AND address,
// so "Evan Shiels" vs "Evan Shiels 2" at different addresses are never
// confused), mark the correct status column "Paid", and post an update
// mentioning Nicole so she knows to update her own boards.
//
// This is intentionally isolated from the payment flow: if MONDAY_API_TOKEN
// is missing, if the API call fails, or if we can't confidently find a
// single matching item, we log it and move on. A missed Monday sync is an
// inconvenience; it should never turn into a failed or double-charged
// payment.
//
// IMPORTANT: like the surcharge code, this has NOT been tested against the
// live Monday.com API (this sandbox cannot reach external APIs either).
// Test with a real payment against a real board item before relying on it,
// and double check that the @mention actually notifies Nicole rather than
// just rendering as plain text — Monday's mention format has changed
// before. See README.
// ---------------------------------------------------------------------
const MONDAY_API_URL = 'https://api.monday.com/v2';
const MONDAY_BOARD_ID = '18412868315'; // "Sunatto Pipeline 2026"
const MONDAY_ADDRESS_COLUMN_ID = 'location_mkrw6nb2'; // "Address"
const MONDAY_DEPOSIT_STATUS_COLUMN_ID = 'color_mm59rxn'; // "20% Invoice"
const MONDAY_BALANCE_STATUS_COLUMN_ID = 'color_mm59vk78'; // "80% Invoice"
const NICOLE_MONDAY_USER_ID = 43023232;

function normalizeForMatch(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Address matching is the safety-critical part of this sync — customer
// names repeat on the board far more often than addresses do (e.g.
// multiple "Evan Shiels" jobs), so a wrong address match is the main way
// this could ever mark the wrong item "Paid". This normalizer collapses
// common street-suffix and directional abbreviations so "123 Main St" and
// "123 Main Street" (or "N" / "North") are recognized as the same address
// even if the rep and the board entry weren't typed identically, on top of
// the usual case/punctuation/whitespace normalization.
const ADDRESS_WORD_REPLACEMENTS = [
  [/\bstreet\b/g, 'st'],
  [/\bdrive\b/g, 'dr'],
  [/\bavenue\b/g, 'ave'],
  [/\broad\b/g, 'rd'],
  [/\blane\b/g, 'ln'],
  [/\bboulevard\b/g, 'blvd'],
  [/\bcourt\b/g, 'ct'],
  [/\bplace\b/g, 'pl'],
  [/\bcircle\b/g, 'cir'],
  [/\bhighway\b/g, 'hwy'],
  [/\bparkway\b/g, 'pkwy'],
  [/\bterrace\b/g, 'ter'],
  [/\bapartment\b/g, 'apt'],
  [/\bsuite\b/g, 'ste'],
  [/\bnorth\b/g, 'n'],
  [/\bsouth\b/g, 's'],
  [/\beast\b/g, 'e'],
  [/\bwest\b/g, 'w'],
  [/\bunited states\b/g, ''],
  [/\busa\b/g, ''],
];

function normalizeAddressForMatch(str) {
  let s = (str || '').toLowerCase();
  for (const [pattern, replacement] of ADDRESS_WORD_REPLACEMENTS) {
    s = s.replace(pattern, replacement);
  }
  return s.replace(/[^a-z0-9]/g, '');
}

async function mondayRequest(query, variables) {
  if (!process.env.MONDAY_API_TOKEN) {
    throw new Error('MONDAY_API_TOKEN is not set — skipping Monday.com sync.');
  }
  const response = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: process.env.MONDAY_API_TOKEN,
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json();
  if (json.errors) {
    throw new Error('Monday.com API error: ' + JSON.stringify(json.errors));
  }
  return json.data;
}

// Finds exactly one matching board item by name + address. Returns null
// (and logs why) if there's no match OR more than one possible match —
// we never guess which job a payment belongs to.
async function findMondayItem(customerName, jobAddress) {
  const targetName = normalizeForMatch(customerName);
  const targetAddress = normalizeAddressForMatch(jobAddress);

  if (!targetName || !targetAddress) {
    console.warn('Monday sync: missing customer name or job address, skipping match.');
    return null;
  }

  let cursor = null;
  const matches = [];
  // Tracked purely for diagnostic logging, so it's obvious in the logs
  // *why* nothing matched — especially the "same name, different address"
  // case this was specifically built to avoid getting wrong.
  const nameOnlyMatches = [];
  const addressOnlyMatches = [];

  do {
    const data = await mondayRequest(
      `query ($boardId: [ID!], $cursor: String) {
        boards(ids: $boardId) {
          items_page(limit: 100, cursor: $cursor) {
            cursor
            items {
              id
              name
              column_values(ids: ["${MONDAY_ADDRESS_COLUMN_ID}"]) { text }
            }
          }
        }
      }`,
      { boardId: [MONDAY_BOARD_ID], cursor }
    );

    const page = data.boards[0].items_page;
    for (const item of page.items) {
      const itemName = normalizeForMatch(item.name);
      const itemAddress = normalizeAddressForMatch(item.column_values[0] && item.column_values[0].text);
      const nameMatch = itemName && (itemName.includes(targetName) || targetName.includes(itemName));
      const addressMatch = itemAddress && (itemAddress.includes(targetAddress) || targetAddress.includes(itemAddress));

      if (nameMatch && addressMatch) {
        matches.push(item);
      } else if (nameMatch) {
        nameOnlyMatches.push(item);
      } else if (addressMatch) {
        addressOnlyMatches.push(item);
      }
    }
    cursor = page.cursor;
  } while (cursor);

  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length === 0) {
    if (nameOnlyMatches.length > 0) {
      console.warn(
        `Monday sync: name="${customerName}" matched ${nameOnlyMatches.length} item(s) ` +
        `(${nameOnlyMatches.map((i) => i.id).join(', ')}) but NONE of them had a matching address ` +
        `("${jobAddress}") — this is the same-name-different-job case, refusing to guess.`
      );
    } else if (addressOnlyMatches.length > 0) {
      console.warn(
        `Monday sync: address="${jobAddress}" matched ${addressOnlyMatches.length} item(s) ` +
        `(${addressOnlyMatches.map((i) => i.id).join(', ')}) but the name ("${customerName}") didn't match any of them.`
      );
    } else {
      console.warn(`Monday sync: no board item matched name="${customerName}" address="${jobAddress}" at all.`);
    }
  } else {
    console.warn(
      `Monday sync: ${matches.length} board items matched BOTH name="${customerName}" AND address="${jobAddress}" ` +
      `(${matches.map((i) => i.id).join(', ')}) — skipping to avoid updating the wrong one.`
    );
  }
  return null;
}

async function markMondayItemPaid(itemId, type) {
  const columnId = type === 'deposit' ? MONDAY_DEPOSIT_STATUS_COLUMN_ID : MONDAY_BALANCE_STATUS_COLUMN_ID;
  await mondayRequest(
    `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
      change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
        id
      }
    }`,
    {
      boardId: MONDAY_BOARD_ID,
      itemId: String(itemId),
      columnId,
      value: JSON.stringify({ label: 'Paid' }),
    }
  );
}

async function notifyNicoleOnMonday(itemId, type) {
  const label = type === 'deposit' ? '20% deposit' : '80% balance';
  await mondayRequest(
    `mutation ($itemId: ID!, $body: String!, $mentionsList: [MentionObjectInput!]) {
      create_update(item_id: $itemId, body: $body, mentions_list: $mentionsList) {
        id
      }
    }`,
    {
      itemId: String(itemId),
      body: `The ${label} for this job has been collected online via the Southern Energy checkout page. @Nicole please update your boards accordingly.`,
      mentionsList: [{ id: NICOLE_MONDAY_USER_ID, type: 'User' }],
    }
  );
}

async function syncPaymentToMonday(paymentIntent) {
  const type = paymentIntent.metadata && paymentIntent.metadata.sunatto_payment_type;
  const customerName = paymentIntent.metadata && paymentIntent.metadata.customer_name;
  const jobAddress = paymentIntent.metadata && paymentIntent.metadata.job_address;

  if (!type) {
    console.warn('Monday sync: PaymentIntent has no sunatto_payment_type metadata, skipping.');
    return;
  }

  const item = await findMondayItem(customerName, jobAddress);
  if (!item) {
    return; // findMondayItem already logged why
  }

  await markMondayItemPaid(item.id, type);
  await notifyNicoleOnMonday(item.id, type);
  console.log(`Monday sync: marked item ${item.id} ("${item.name}") Paid for ${type}.`);
}

// ---------------------------------------------------------------------
// 6. Send-to-homeowner email — fully automated, via Postmark.
//
// Lets office staff fill out intake.html and email the payment link
// directly to the homeowner, instead of copying/pasting it into their own
// email or text app. Uses Postmark's transactional email API.
//
// IMPORTANT: like the Stripe surcharge code and the Monday.com sync, this
// has NOT been tested against the live Postmark API — this sandbox can't
// reach api.postmarkapp.com either. Send a real test email to yourself
// before relying on this for real customers. See README.
// ---------------------------------------------------------------------
const POSTMARK_API_URL = 'https://api.postmarkapp.com/email';
const POSTMARK_FROM_EMAIL = 'billing@quotes.southernenergydistributors.com';
const POSTMARK_REPLY_TO = 'office@southernenergydistributors.com';

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function buildHomeownerEmail({ customerName, jobAddress, type, amount, checkoutUrl }) {
  const firstName = (customerName || '').trim().split(/\s+/)[0] || 'there';
  const label = type === 'deposit' ? '20% deposit' : 'remaining 80% balance';
  const subject = type === 'deposit'
    ? 'Your 20% Deposit — Southern Energy Distributors'
    : 'Your Final Balance Payment — Southern Energy Distributors';

  const footnote = type === 'deposit'
    ? 'This is your secure 20% deposit for your residential solar installation, due at signing. The remaining 80% balance will be invoiced separately after installation is complete.'
    : 'This is your secure final 80% balance payment for your completed residential solar installation.';

  const textBody =
`Hi ${firstName},

Here is your secure payment link for the ${label} on your Southern Energy Distributors solar installation${jobAddress ? ` at ${jobAddress}` : ''}:

Amount due: $${amount}

${checkoutUrl}

${footnote} Credit card payments include a 3% processing surcharge, disclosed on the payment page before you're charged — ACH bank transfers and debit cards have no surcharge.

Questions? Call us at (210) 504-7669.

— Southern Energy Distributors`;

  const htmlBody = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#FAFAF9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#16171B;">
<div style="max-width:480px;margin:0 auto;padding:40px 16px;">
  <div style="text-align:center;font-size:13px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#454952;margin-bottom:24px;">
    Southern Energy Distributors
  </div>
  <div style="background:#FFFFFF;border:1px solid #E3E3E6;border-radius:16px;padding:32px;">
    <p style="margin:0 0 16px 0;font-size:14px;">Hi ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.5;">
      Here is your secure payment link for the ${label} on your solar installation${jobAddress ? ` at ${escapeHtml(jobAddress)}` : ''}.
    </p>
    <div style="background:#FAFAFA;border:1px solid #E3E3E6;border-radius:10px;padding:14px;margin:20px 0;text-align:center;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;color:#7D818A;">Amount Due</div>
      <div style="font-size:24px;font-weight:700;color:#16171B;">$${escapeHtml(amount)}</div>
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="${checkoutUrl}" style="display:inline-block;background:#16171B;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px;">
        Pay Now
      </a>
    </div>
    <p style="margin:16px 0 0 0;font-size:12px;line-height:1.5;color:#5B5E66;">
      ${footnote} Credit card payments include a 3% processing surcharge, disclosed on the payment page before you're charged — ACH bank transfers and debit cards have no surcharge.
    </p>
  </div>
  <div style="text-align:center;font-size:12px;color:#7D818A;line-height:1.5;margin-top:24px;padding:0 8px;">
    Questions? Call us at (210) 504-7669.
  </div>
</div>
</body></html>`;

  return { subject, textBody, htmlBody };
}

// Shared by both the initial send (below) and the hub's "Resend" button
// (section 7) so there's exactly one place that talks to Postmark.
async function sendViaPostmark({ to, subject, htmlBody, textBody }) {
  if (!process.env.POSTMARK_SERVER_TOKEN) {
    throw new Error('POSTMARK_SERVER_TOKEN is not set on the server.');
  }

  const response = await fetch(POSTMARK_API_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': process.env.POSTMARK_SERVER_TOKEN,
    },
    body: JSON.stringify({
      From: `Southern Energy Distributors <${POSTMARK_FROM_EMAIL}>`,
      To: to,
      ReplyTo: POSTMARK_REPLY_TO,
      Subject: subject,
      HtmlBody: htmlBody,
      TextBody: textBody,
      MessageStream: 'outbound',
    }),
  });

  const json = await response.json();
  if (!response.ok || json.ErrorCode) {
    console.error('Postmark send failed:', json);
    throw new Error(json.Message || 'Postmark rejected the email.');
  }
  return json.MessageID;
}

app.post('/api/send-homeowner-email', async (req, res) => {
  try {
    const { customerName, customerEmail, jobAddress, type, amount, checkoutUrl } = req.body;

    if (!customerEmail) {
      return res.status(400).json({ error: 'customerEmail is required' });
    }
    if (!checkoutUrl) {
      return res.status(400).json({ error: 'checkoutUrl is required' });
    }
    if (!['deposit', 'balance'].includes(type)) {
      return res.status(400).json({ error: 'type must be "deposit" or "balance"' });
    }

    const { subject, textBody, htmlBody } = buildHomeownerEmail({
      customerName, jobAddress, type, amount, checkoutUrl,
    });
    const messageId = await sendViaPostmark({ to: customerEmail, subject, htmlBody, textBody });

    res.json({ sent: true, messageId });
  } catch (err) {
    console.error('send-homeowner-email error:', err);
    res.status(err.message === 'POSTMARK_SERVER_TOKEN is not set on the server.' ? 500 : 502)
      .json({ error: err.message });
  }
});

// ---------------------------------------------------------------------
// 7. Payment-links hub — tracks every link intake.html has generated, so
// staff have one place to see what's outstanding and resend a link without
// digging through texts/emails. Backed by Netlify Blobs (small JSON
// documents, not a real database — plenty for this volume, and it needs
// zero extra sign-up since it's built into the same Netlify project
// already hosting this site).
//
// Access model: each person logs in with their first/last name (creating
// a PIN the first time, entering it thereafter — see the /api/hub/*
// endpoints below). What THEY see on the hub is then derived entirely from
// the "Sunatto Pipeline 2026" Monday board: a job is visible to them if
// their name appears in that job's Sales Rep, Office, OR Manager column
// (all three checked the same way — there's no separate admin/role flag
// to maintain here, it's 100% driven by who's assigned to what in
// Monday). A payment link is then visible if its customer name + address
// fuzzy-matches one of those jobs, using the same normalize/match helpers
// as syncPaymentToMonday above (section 5).
//
// Two different trust levels on purpose:
//   - Creating a link (POST /api/links) is called silently by intake.js
//     for a job the rep is already looking at — same trust level as
//     intake.html itself, so no login required.
//   - Everything under /api/hub/* and /api/links/:id/resend, plus reading
//     the list itself (GET /api/links), requires a valid session (the
//     X-Hub-Session header, obtained by logging in) — see requireHubUser.
//
// IMPORTANT: like the Stripe/Monday/Postmark code above, this has NOT been
// tested against live Netlify Blobs or the live Monday API (this sandbox
// can't reach either). Create a test account, confirm login works, and
// confirm your own jobs actually show up on /hub.html before relying on
// this for real staff. See README.
// ---------------------------------------------------------------------
const LINKS_STORE_NAME = 'sunatto-payment-links';
const LINKS_BLOB_KEY = 'links.json';
const USERS_STORE_NAME = 'sunatto-hub-users';
const USERS_BLOB_KEY = 'users.json';

// The three "people" columns on the Sunatto Pipeline 2026 board (same
// board as MONDAY_BOARD_ID above) that together determine who can see a
// given job on the hub.
const MONDAY_SALES_REP_COLUMN_ID = 'multiple_person_mkrwz37g';
const MONDAY_OFFICE_COLUMN_ID = 'multiple_person_mksd8yte';
const MONDAY_MANAGER_COLUMN_ID = 'multiple_person_mkrwcp2r';

// @netlify/blobs is supposed to auto-detect the site/credentials when
// called from inside a Netlify Function with zero configuration — but
// that auto-detection doesn't reach in through serverless-http's
// Express-style wrapping (see netlify/functions/api.js), so `getStore()`
// on its own throws "The environment has not been configured to use
// Netlify Blobs" here. Falling back to explicit manual configuration
// (Netlify's own documented escape hatch) fixes it: SITE_ID is set
// automatically in every Netlify Function regardless of bundler, and
// NETLIFY_BLOBS_TOKEN is a personal access token you create once — see
// README.md's "Payment Links Hub" section for how to get one.
function blobStore(name) {
  const siteID = process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  return (siteID && token) ? getStore({ name, siteID, token }) : getStore(name);
}

async function loadLinks() {
  const store = blobStore(LINKS_STORE_NAME);
  const data = await store.get(LINKS_BLOB_KEY, { type: 'json' });
  return Array.isArray(data) ? data : [];
}

async function saveLinks(links) {
  const store = blobStore(LINKS_STORE_NAME);
  await store.setJSON(LINKS_BLOB_KEY, links);
}

async function loadUsers() {
  const store = blobStore(USERS_STORE_NAME);
  const data = await store.get(USERS_BLOB_KEY, { type: 'json' });
  return Array.isArray(data) ? data : [];
}

async function saveUsers(users) {
  const store = blobStore(USERS_STORE_NAME);
  await store.setJSON(USERS_BLOB_KEY, users);
}

function fullNameOf(user) {
  return `${user.firstName} ${user.lastName}`;
}

function hashPin(pin, salt) {
  return crypto.pbkdf2Sync(String(pin), salt, 100000, 32, 'sha256').toString('hex');
}

// Names that are always treated as admin, regardless of what's stored in
// Blobs — this is what makes Austin an admin on his very first login even
// though there's no admin UI yet to grant that to anyone (a real admin can
// promote/demote anyone else later via the admin panel below; this list is
// purely the bootstrap seed so the whole system isn't a chicken-and-egg
// problem). Matched the same fuzzy way as everything else in this file.
const BOOTSTRAP_ADMIN_NAMES = ['austin steadman'].map((n) => normalizeForMatch(n));

function isUserAdmin(user) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return BOOTSTRAP_ADMIN_NAMES.includes(normalizeForMatch(fullNameOf(user)));
}

// Looks up the logged-in user from the X-Hub-Session header. Sends 401
// and returns null if there's no valid session — callers should
// `if (!user) return;` right after calling this.
async function requireHubUser(req, res) {
  const token = req.get('X-Hub-Session');
  if (!token) {
    res.status(401).json({ error: 'Not logged in.' });
    return null;
  }
  const users = await loadUsers();
  const user = users.find((u) => u.sessionToken === token);
  if (!user) {
    res.status(401).json({ error: 'Session expired — please log in again.' });
    return null;
  }
  return user;
}

// Same as requireHubUser, but also requires the isUserAdmin check — for
// the admin-only endpoints below (user list/create/reset-pin/etc). Sends
// 403 (not 401) if the session is valid but the person just isn't an admin,
// so the frontend can tell the difference between "log in again" and "you
// don't have access."
async function requireAdmin(req, res) {
  const user = await requireHubUser(req, res);
  if (!user) return null;
  if (!isUserAdmin(user)) {
    res.status(403).json({ error: 'Admin access required.' });
    return null;
  }
  return user;
}

// --- Hub login: name + PIN, no separate sign-up flow. ---

// Step 1 of the frontend's flow — lets hub.js know whether to show the
// "create a PIN" screen or the "enter your PIN" screen for this name.
app.post('/api/hub/lookup-name', async (req, res) => {
  try {
    const { firstName, lastName } = req.body;
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'firstName and lastName are required.' });
    }
    const users = await loadUsers();
    const target = normalizeForMatch(`${firstName} ${lastName}`);
    const existing = users.find((u) => normalizeForMatch(fullNameOf(u)) === target);
    res.json({ userExists: !!existing });
  } catch (err) {
    console.error('hub/lookup-name error:', err);
    res.status(500).json({ error: err.message });
  }
});

// First-time visitors only — fails with 409 if that name already has a
// PIN (they should log in instead, not create a second account).
app.post('/api/hub/create-user', async (req, res) => {
  try {
    const { firstName, lastName, pin } = req.body;
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'firstName and lastName are required.' });
    }
    if (!/^\d{4}$/.test(pin || '')) {
      return res.status(400).json({ error: 'PIN must be 4 digits.' });
    }

    const users = await loadUsers();
    const target = normalizeForMatch(`${firstName} ${lastName}`);
    if (users.some((u) => normalizeForMatch(fullNameOf(u)) === target)) {
      return res.status(409).json({ error: 'An account already exists for that name — enter your PIN instead.' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const sessionToken = crypto.randomUUID();
    const newUser = {
      id: crypto.randomUUID(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      pinSalt: salt,
      pinHash: hashPin(pin, salt),
      sessionToken,
      isAdmin: false,
      createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    await saveUsers(users);

    res.json({
      sessionToken,
      userId: newUser.id,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      isAdmin: isUserAdmin(newUser),
    });
  } catch (err) {
    console.error('hub/create-user error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Returning visitors. Accepts either a userId (once hub.js has one cached
// on this device, from localStorage) or a firstName/lastName pair (first
// login on a new device, or after using "Switch user").
app.post('/api/hub/login', async (req, res) => {
  try {
    const { userId, firstName, lastName, pin } = req.body;
    if (!pin) {
      return res.status(400).json({ error: 'PIN is required.' });
    }

    const users = await loadUsers();
    let user = null;
    if (userId) {
      user = users.find((u) => u.id === userId);
    } else if (firstName && lastName) {
      const target = normalizeForMatch(`${firstName} ${lastName}`);
      user = users.find((u) => normalizeForMatch(fullNameOf(u)) === target);
    } else {
      return res.status(400).json({ error: 'userId or firstName/lastName is required.' });
    }

    if (!user || hashPin(pin, user.pinSalt) !== user.pinHash) {
      return res.status(401).json({ error: 'Incorrect PIN.' });
    }

    user.sessionToken = crypto.randomUUID(); // rotate on every login
    await saveUsers(users);

    res.json({
      sessionToken: user.sessionToken,
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      isAdmin: isUserAdmin(user),
    });
  } catch (err) {
    console.error('hub/login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Tells hub.js whether the currently logged-in person is an admin, so it
// knows whether to show the Admin button — checked fresh on every page
// load rather than trusting a cached value, since admin status can change
// (someone can be promoted/demoted after they've already logged in).
app.get('/api/hub/me', async (req, res) => {
  const user = await requireHubUser(req, res);
  if (!user) return;
  res.json({
    userId: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    isAdmin: isUserAdmin(user),
  });
});

// Lets a logged-in person change their own PIN (they must know their
// current one — this is not the same as an admin's forced reset below).
// Returns a new sessionToken since the PIN hash changed; the frontend
// swaps it into sessionStorage so this same tab stays logged in.
app.post('/api/hub/change-pin', async (req, res) => {
  const user = await requireHubUser(req, res);
  if (!user) return;
  try {
    const { currentPin, newPin } = req.body;
    if (!currentPin || hashPin(currentPin, user.pinSalt) !== user.pinHash) {
      return res.status(401).json({ error: 'Current PIN is incorrect.' });
    }
    if (!/^\d{4}$/.test(newPin || '')) {
      return res.status(400).json({ error: 'New PIN must be 4 digits.' });
    }

    const users = await loadUsers();
    const target = users.find((u) => u.id === user.id);
    const salt = crypto.randomBytes(16).toString('hex');
    target.pinSalt = salt;
    target.pinHash = hashPin(newPin, salt);
    target.sessionToken = crypto.randomUUID(); // rotate — signs out other devices
    await saveUsers(users);

    res.json({ sessionToken: target.sessionToken });
  } catch (err) {
    console.error('hub/change-pin error:', err);
    res.status(500).json({ error: err.message });
  }
});

// The board's contact/cost columns, pulled alongside the address so the
// "Generate Link" flow on the hub can pre-fill a job's email, phone, and
// total project cost instead of a rep re-typing them from scratch.
const MONDAY_EMAIL_COLUMN_ID = 'email_mks09rsp';
const MONDAY_PHONE_COLUMN_ID = 'phone_mkrwp33a';
const MONDAY_TOTAL_COST_COLUMN_ID = 'numeric_mkrw6pqv';

// Queries the Sunatto Pipeline 2026 board directly (bypassing
// findMondayItem's single-match requirement above, since here we WANT
// every job this person is attached to, not just one) and returns
// { id, name, address, email, phone, totalCostCents } for every item where
// fullName shows up in the Sales Rep, Office, or Manager column. Each of
// those columns' text value is a comma-separated list of Monday people's
// display names.
//
// Pass { isAdmin: true } to skip the attached-person check entirely and
// return every job on the board — this is what gives admins (see
// isUserAdmin above) full visibility regardless of who's assigned to what.
async function getUserAttachedJobs(fullName, { isAdmin = false } = {}) {
  const targetName = normalizeForMatch(fullName);
  if (!isAdmin && !targetName) return [];

  const peopleColumnIds = [MONDAY_SALES_REP_COLUMN_ID, MONDAY_OFFICE_COLUMN_ID, MONDAY_MANAGER_COLUMN_ID];
  const contactColumnIds = [MONDAY_ADDRESS_COLUMN_ID, MONDAY_EMAIL_COLUMN_ID, MONDAY_PHONE_COLUMN_ID, MONDAY_TOTAL_COST_COLUMN_ID];
  const allColumnIds = [...contactColumnIds, ...peopleColumnIds];
  let cursor = null;
  const jobs = [];

  do {
    const data = await mondayRequest(
      `query ($boardId: [ID!], $cursor: String) {
        boards(ids: $boardId) {
          items_page(limit: 100, cursor: $cursor) {
            cursor
            items {
              id
              name
              group { title }
              column_values(ids: [${allColumnIds.map((id) => `"${id}"`).join(', ')}]) {
                id
                text
              }
            }
          }
        }
      }`,
      { boardId: [MONDAY_BOARD_ID], cursor }
    );

    const page = data.boards[0].items_page;
    for (const item of page.items) {
      const values = {};
      for (const cv of item.column_values) values[cv.id] = cv.text;

      const peopleText = peopleColumnIds.map((id) => values[id]).filter(Boolean).join(', ');
      const attached = isAdmin || peopleText
        .split(',')
        .map((n) => normalizeForMatch(n))
        .some((n) => n && (n.includes(targetName) || targetName.includes(n)));

      if (attached) {
        const totalCost = parseFloat(values[MONDAY_TOTAL_COST_COLUMN_ID] || '');
        jobs.push({
          id: item.id,
          name: item.name,
          address: values[MONDAY_ADDRESS_COLUMN_ID] || '',
          email: values[MONDAY_EMAIL_COLUMN_ID] || '',
          phone: values[MONDAY_PHONE_COLUMN_ID] || '',
          totalCostCents: Number.isFinite(totalCost) ? Math.round(totalCost * 100) : null,
          // The Monday board group (e.g. "Installed - Review/Corrections")
          // this item currently sits in — surfaced in the hub as "Monday
          // Status" so staff can see pipeline stage without opening Monday.
          groupTitle: (item.group && item.group.title) || null,
        });
      }
    }
    cursor = page.cursor;
  } while (cursor);

  return jobs;
}

// Returns the single Monday job (name/address fuzzy match) this payment
// link record corresponds to, or null. Shared by linkMatchesJobs (below)
// and by GET /api/links to surface that job's board group as "Monday
// Status" without duplicating the matching logic in two places.
function findMatchedJobForLink(link, normalizedJobs) {
  const linkName = normalizeForMatch(link.customerName);
  const linkAddress = normalizeAddressForMatch(link.jobAddress);
  if (!linkName || !linkAddress) return null;
  return normalizedJobs.find((j) =>
    j.name && j.address
    && (j.name.includes(linkName) || linkName.includes(j.name))
    && (j.address.includes(linkAddress) || linkAddress.includes(j.address))
  ) || null;
}

// True if a payment-link record's customer name + address fuzzy-matches
// any of this user's Monday jobs.
function linkMatchesJobs(link, normalizedJobs) {
  return !!findMatchedJobForLink(link, normalizedJobs);
}

// Called by intake.js right before Copy Link / Send Email / Continue to
// Payment — no login required (see note above). Returns the new link's
// id (currently unused by intake.js, but available if it ever needs to
// reference the record it just created).
app.post('/api/links', async (req, res) => {
  try {
    const { customerName, customerEmail, customerPhone, jobAddress, type, amount, checkoutUrl } = req.body;

    if (!['deposit', 'balance'].includes(type)) {
      return res.status(400).json({ error: 'type must be "deposit" or "balance"' });
    }
    if (!checkoutUrl) {
      return res.status(400).json({ error: 'checkoutUrl is required' });
    }

    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(),
      customerName: customerName || '',
      customerEmail: customerEmail || '',
      customerPhone: customerPhone || '',
      jobAddress: jobAddress || '',
      type,
      amountCents: Math.round(parseFloat(amount || '0') * 100),
      checkoutUrl,
      createdAt: now,
      lastSentAt: now,
      sentCount: 1,
      paid: false,
      paidAt: null,
      paymentIntentId: null,
    };

    const links = await loadLinks();
    links.unshift(record); // newest first
    await saveLinks(links);

    res.json({ id: record.id });
  } catch (err) {
    console.error('create link error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Powers hub.html's table — session-gated, and filtered down to only the
// links whose job this user is attached to on the Monday board.
app.get('/api/links', async (req, res) => {
  const user = await requireHubUser(req, res);
  if (!user) return;
  try {
    const admin = isUserAdmin(user);
    const [links, jobs] = await Promise.all([
      loadLinks(),
      getUserAttachedJobs(fullNameOf(user), { isAdmin: admin }),
    ]);

    // Voided links (see POST /api/links/:id/void below) are stale/incorrect
    // records an admin has explicitly pulled out of view — e.g. a link
    // that was generated before financing terms were finalized and never
    // actually reflected a real request to the homeowner. Never shown to
    // anyone, admin included, same as how void invoices are hidden above.
    const activeLinks = links.filter((l) => !l.voided);

    const normalizedJobs = jobs.map((j) => ({
      name: normalizeForMatch(j.name),
      address: normalizeAddressForMatch(j.address),
      groupTitle: j.groupTitle || null,
    }));
    // Attaches "Monday Status" (the board group this job currently sits
    // in, e.g. "Installed - Review/Corrections") to each link so staff
    // can see pipeline stage without opening Monday. null if no job matched.
    const withMondayStatus = (link) => ({
      ...link,
      mondayStatus: (findMatchedJobForLink(link, normalizedJobs) || {}).groupTitle || null,
    });

    // Admins see every (non-voided) link, full stop — no fuzzy
    // job-matching filter, so nothing is ever hidden even if a job was
    // since renamed/removed from the Monday board.
    if (admin) {
      return res.json({ links: activeLinks.map(withMondayStatus), jobCount: jobs.length, isAdmin: true });
    }

    const visibleLinks = activeLinks
      .filter((l) => linkMatchesJobs(l, normalizedJobs))
      .map(withMondayStatus);
    res.json({ links: visibleLinks, jobCount: jobs.length, isAdmin: false });
  } catch (err) {
    console.error('list links error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Powers the hub's "Generate Payment Link" picker — the same visibility
// rule as GET /api/links above (name in Sales Rep/Office/Manager column),
// but returning full job details (email, phone, total cost) instead of
// just name+address, so the generate form can pre-fill from Monday rather
// than making the rep re-type everything intake.html would ask for.
app.get('/api/hub/my-jobs', async (req, res) => {
  const user = await requireHubUser(req, res);
  if (!user) return;
  try {
    const jobs = await getUserAttachedJobs(fullNameOf(user), { isAdmin: isUserAdmin(user) });
    res.json({ jobs });
  } catch (err) {
    console.error('hub/my-jobs error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Hub's "Resend" button — session-gated, and re-checks that the target
// link actually belongs to one of this user's jobs before sending, so a
// logged-in rep can't resend an arbitrary link by guessing its id.
app.post('/api/links/:id/resend', async (req, res) => {
  const user = await requireHubUser(req, res);
  if (!user) return;
  try {
    const admin = isUserAdmin(user);
    const [links, jobs] = await Promise.all([
      loadLinks(),
      getUserAttachedJobs(fullNameOf(user), { isAdmin: admin }),
    ]);
    const normalizedJobs = jobs.map((j) => ({
      name: normalizeForMatch(j.name),
      address: normalizeAddressForMatch(j.address),
    }));

    const record = links.find((l) => l.id === req.params.id);
    if (!record || (!admin && !linkMatchesJobs(record, normalizedJobs))) {
      return res.status(404).json({ error: 'Link not found.' });
    }
    if (!record.customerEmail) {
      return res.status(400).json({ error: 'This link has no email on file — copy and send it manually.' });
    }

    const { subject, textBody, htmlBody } = buildHomeownerEmail({
      customerName: record.customerName,
      jobAddress: record.jobAddress,
      type: record.type,
      amount: (record.amountCents / 100).toFixed(2),
      checkoutUrl: record.checkoutUrl,
    });
    const messageId = await sendViaPostmark({ to: record.customerEmail, subject, htmlBody, textBody });

    record.lastSentAt = new Date().toISOString();
    record.sentCount = (record.sentCount || 0) + 1;
    await saveLinks(links);

    res.json({ sent: true, messageId });
  } catch (err) {
    console.error('resend link error:', err);
    res.status(err.message === 'POSTMARK_SERVER_TOKEN is not set on the server.' ? 500 : 502)
      .json({ error: err.message });
  }
});

// Voids a stale/incorrect payment link record — e.g. one generated before
// financing terms were finalized that never reflected a real request to
// the homeowner. Admin-only: this hides the link from EVERY viewer of the
// hub (see the `voided` filter in GET /api/links above), not just the
// person who created it, so it's restricted the same way other
// hub-wide/account-affecting actions are gated to the Admin panel.
app.post('/api/links/:id/void', async (req, res) => {
  const user = await requireHubUser(req, res);
  if (!user) return;
  if (!isUserAdmin(user)) {
    return res.status(403).json({ error: 'Only an admin can void a payment link.' });
  }
  try {
    const links = await loadLinks();
    const record = links.find((l) => l.id === req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Link not found.' });
    }
    record.voided = true;
    record.voidedAt = new Date().toISOString();
    await saveLinks(links);
    res.json({ voided: true });
  } catch (err) {
    console.error('void link error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Best-effort: after a payment succeeds (called from /api/finalize above),
// try to find the ONE unpaid link record that matches this PaymentIntent's
// name + address + type + base amount, and mark it paid. Same
// "never guess, never block the payment" philosophy as syncPaymentToMonday
// — if this fails or can't find exactly one match, the payment itself is
// completely unaffected. Staff can still see it succeeded in Stripe; it
// just won't be reflected on the hub.
async function findAndMarkLinkPaid(paymentIntent) {
  const type = paymentIntent.metadata && paymentIntent.metadata.sunatto_payment_type;
  const customerName = paymentIntent.metadata && paymentIntent.metadata.customer_name;
  const jobAddress = paymentIntent.metadata && paymentIntent.metadata.job_address;
  const baseAmountCents = paymentIntent.metadata && Number(paymentIntent.metadata.base_amount_cents);

  if (!type || !customerName || !jobAddress || !baseAmountCents) {
    console.warn('Payment-links hub: PaymentIntent missing metadata needed to match, skipping.');
    return;
  }

  const targetName = normalizeForMatch(customerName);
  const targetAddress = normalizeAddressForMatch(jobAddress);

  const links = await loadLinks();
  const candidates = links.filter((l) => {
    if (l.paid || l.type !== type || l.amountCents !== baseAmountCents) return false;
    const linkName = normalizeForMatch(l.customerName);
    const linkAddress = normalizeAddressForMatch(l.jobAddress);
    return linkName && linkAddress
      && (linkName.includes(targetName) || targetName.includes(linkName))
      && (linkAddress.includes(targetAddress) || targetAddress.includes(linkAddress));
  });

  if (candidates.length !== 1) {
    console.warn(
      `Payment-links hub: ${candidates.length} unpaid link(s) matched name="${customerName}" ` +
      `address="${jobAddress}" type="${type}" amount=${baseAmountCents} for PaymentIntent ${paymentIntent.id} ` +
      `— skipping to avoid marking the wrong one paid.`
    );
    return;
  }

  candidates[0].paid = true;
  candidates[0].paidAt = new Date().toISOString();
  candidates[0].paymentIntentId = paymentIntent.id;
  await saveLinks(links);
  console.log(`Payment-links hub: marked link ${candidates[0].id} paid for PaymentIntent ${paymentIntent.id}.`);
}

// ---------------------------------------------------------------------
// 7a2. Invoices — lets hub users see and send Stripe invoices for their
// jobs without leaving the hub or touching the Stripe dashboard.
// Visibility mirrors the payment-links table: admins see every invoice,
// everyone else only sees invoices for jobs they're attached to on the
// Monday board.
//
// These invoices are built by hand (or by the invoice-drafting
// automation) directly against the Stripe API/dashboard, not through
// this endpoint, so there's no metadata tag linking an invoice back to
// a Monday job. Instead, invoices are matched to jobs by customer
// email — exactly the value used to create/find the Stripe customer for
// each job in the first place — with the invoice's "Installation
// Address" custom field (when present) used as a tiebreaker for the
// rare case where the same person/email has more than one job on the
// board.
// ---------------------------------------------------------------------
const STRIPE_ACCOUNT_ID = 'acct_1TtX1FAKmB8qDjmo';

// Voiding an invoice is a permanent, one-way action in Stripe (unlike a
// draft, which can just be deleted — see the DELETE endpoint below). The
// invoice record itself sticks around in Stripe marked "void", which is
// exactly why voided invoices get pulled into their own "Voided" tab in
// the hub instead of just disappearing. Stripe's API has no concept of a
// "reason" for voiding, so that's tracked entirely on our side — this
// small Blobs store maps invoice id -> { reason, voidedByName, voidedAt },
// looked up whenever the Voided tab is built (GET /api/invoices/voided).
const VOID_META_STORE_NAME = 'sunatto-voided-invoice-meta';
const VOID_META_BLOB_KEY = 'voided-meta.json';

async function loadVoidMeta() {
  const store = blobStore(VOID_META_STORE_NAME);
  const data = await store.get(VOID_META_BLOB_KEY, { type: 'json' });
  return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
}

async function saveVoidMeta(meta) {
  const store = blobStore(VOID_META_STORE_NAME);
  await store.setJSON(VOID_META_BLOB_KEY, meta);
}

function invoiceDashboardUrl(invoiceId) {
  return `https://dashboard.stripe.com/${STRIPE_ACCOUNT_ID}/invoices/${invoiceId}`;
}

// Best-effort "deposit" vs "balance" label, since there's no metadata to
// read directly: compare the invoice total against the matched job's
// Total Cost. ~20% -> deposit, ~80% -> balance, otherwise unlabeled
// (e.g. a one-off invoice, or a job we couldn't confidently match).
function guessInvoiceType(totalCents, totalCostCents) {
  if (!totalCostCents) return null;
  const ratio = totalCents / totalCostCents;
  if (Math.abs(ratio - 0.2) < 0.03) return 'deposit';
  if (Math.abs(ratio - 0.8) < 0.03) return 'balance';
  return null;
}

function invoiceInstallationAddress(invoice) {
  const field = (invoice.custom_fields || []).find((f) =>
    (f.name || '').toLowerCase().includes('installation address')
  );
  return field ? normalizeAddressForMatch(field.value) : null;
}

// Every Monday job whose email matches this invoice's customer email.
// Usually exactly one; if a person/email has multiple jobs, narrows
// down using the invoice's Installation Address custom field when
// available, otherwise just picks the first as a best guess (matching
// ANY of them is enough to grant visibility either way).
function findMatchedJob(invoice, normalizedJobs) {
  const email = (invoice.customer_email || '').toLowerCase().trim();
  if (!email) return null;
  const candidates = normalizedJobs.filter((j) => j.email === email);
  if (candidates.length <= 1) return candidates[0] || null;

  const invoiceAddress = invoiceInstallationAddress(invoice);
  if (invoiceAddress) {
    const byAddress = candidates.find(
      (j) => j.address && (j.address.includes(invoiceAddress) || invoiceAddress.includes(j.address))
    );
    if (byAddress) return byAddress;
  }
  return candidates[0];
}

function invoiceMatchesJobs(invoice, normalizedJobs) {
  const email = (invoice.customer_email || '').toLowerCase().trim();
  if (!email) return false;
  return normalizedJobs.some((j) => j.email === email);
}

// A customer can submit payment on an invoice (e.g. ACH/bank debit)
// that then takes several business days to actually clear. During
// that window the Invoice itself is still "open" with amount_paid=0
// (Stripe doesn't mark it paid until the underlying charge settles),
// but there IS a PaymentIntent sitting in "processing" — that's our
// signal that someone already submitted payment and this should NOT
// be treated as untouched/unpaid (no resend, no re-invoicing).
function invoicePaymentIsProcessing(invoice) {
  const pi = invoice.payment_intent;
  if (!pi || typeof pi !== 'object') return false;
  return invoice.status === 'open' && pi.status === 'processing';
}

function publicInvoice(invoice, matchedJob) {
  const paymentProcessing = invoicePaymentIsProcessing(invoice);
  const pi = paymentProcessing ? invoice.payment_intent : null;
  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status, // draft | open | paid | uncollectible | void
    customerName: invoice.customer_name || '',
    customerEmail: invoice.customer_email || '',
    amountDueCents: invoice.amount_due,
    amountPaidCents: invoice.amount_paid,
    totalCents: invoice.total,
    created: invoice.created ? new Date(invoice.created * 1000).toISOString() : null,
    dueDate: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
    hostedInvoiceUrl: invoice.hosted_invoice_url || null,
    dashboardUrl: invoiceDashboardUrl(invoice.id),
    type: guessInvoiceType(invoice.total, matchedJob ? matchedJob.totalCostCents : null),
    jobName: matchedJob ? matchedJob.rawName : null,
    jobAddress: matchedJob ? matchedJob.rawAddress : null,
    // The Monday board group (pipeline stage) this job currently sits in,
    // e.g. "Installed - Review/Corrections" — null if no job matched.
    mondayStatus: matchedJob ? matchedJob.groupTitle : null,
    // True when the customer already submitted payment and it's just
    // waiting to clear (e.g. ACH bank debit, ~4-5 business days).
    paymentProcessing,
    paymentProcessingSince: pi && pi.created ? new Date(pi.created * 1000).toISOString() : null,
  };
}

async function buildNormalizedJobsForUser(user, admin) {
  const jobs = await getUserAttachedJobs(fullNameOf(user), { isAdmin: admin });
  return jobs.map((j) => ({
    email: (j.email || '').toLowerCase().trim(),
    address: normalizeAddressForMatch(j.address),
    totalCostCents: j.totalCostCents,
    rawName: j.name,
    rawAddress: j.address,
    groupTitle: j.groupTitle || null,
  }));
}

// Safety cap on pagination — this business does not remotely approach
// this many invoices, so hitting this cap means something is wrong
// (e.g. an infinite loop) rather than there being legitimately more to
// fetch, and we'd rather stop than hang the request.
const MAX_INVOICE_PAGES = 20;

async function listAllStripeInvoices() {
  const invoices = [];
  let startingAfter;
  for (let page = 0; page < MAX_INVOICE_PAGES; page += 1) {
    // Expand payment_intent so we can tell "nothing submitted yet" apart
    // from "customer submitted payment, it's still clearing" — see
    // invoicePaymentIsProcessing() / publicInvoice() above.
    const result = await stripe.invoices.list({
      limit: 100,
      starting_after: startingAfter,
      expand: ['data.payment_intent'],
    });
    invoices.push(...result.data);
    if (!result.has_more) break;
    startingAfter = result.data[result.data.length - 1].id;
  }
  return invoices;
}

app.get('/api/invoices', async (req, res) => {
  const user = await requireHubUser(req, res);
  if (!user) return;
  try {
    const admin = isUserAdmin(user);
    const normalizedJobs = await buildNormalizedJobsForUser(user, admin);
    const invoices = await listAllStripeInvoices();

    const results = [];
    for (const invoice of invoices) {
      if (invoice.status === 'void') continue; // voided invoices are clutter, never shown
      if (!admin && !invoiceMatchesJobs(invoice, normalizedJobs)) continue;
      const matchedJob = findMatchedJob(invoice, normalizedJobs);
      results.push(publicInvoice(invoice, matchedJob));
    }

    results.sort((a, b) => new Date(b.created) - new Date(a.created));

    res.json({ invoices: results, isAdmin: admin });
  } catch (err) {
    console.error('invoices list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Powers the hub's "Voided" tab — every invoice that's been voided (via
// the button below, OR directly in the Stripe dashboard), so staff have
// somewhere to see what's been pulled out of the active list and why,
// instead of it just disappearing. Same visibility rule as the main
// invoices list above: admins see every voided invoice, everyone else
// only ones for jobs they're attached to.
app.get('/api/invoices/voided', async (req, res) => {
  const user = await requireHubUser(req, res);
  if (!user) return;
  try {
    const admin = isUserAdmin(user);
    const [normalizedJobs, invoices, voidMeta] = await Promise.all([
      buildNormalizedJobsForUser(user, admin),
      listAllStripeInvoices(),
      loadVoidMeta(),
    ]);

    const results = [];
    for (const invoice of invoices) {
      if (invoice.status !== 'void') continue;
      if (!admin && !invoiceMatchesJobs(invoice, normalizedJobs)) continue;
      const matchedJob = findMatchedJob(invoice, normalizedJobs);
      const meta = voidMeta[invoice.id] || null;
      results.push({
        ...publicInvoice(invoice, matchedJob),
        voidReason: meta ? meta.reason : null,
        voidedByName: meta ? meta.voidedByName : null,
        voidedAt: meta ? meta.voidedAt : null,
      });
    }

    results.sort((a, b) => new Date(b.voidedAt || b.created) - new Date(a.voidedAt || a.created));

    res.json({ invoices: results, isAdmin: admin });
  } catch (err) {
    console.error('voided invoices list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Finalizes (if still a draft) and sends an invoice directly — the same
// end result as clicking "Finalize and send" in the Stripe dashboard,
// just without leaving the hub. Re-checks visibility server-side so a
// non-admin can never send an invoice for a job they're not attached to,
// even by guessing/crafting an invoice id.
app.post('/api/invoices/:id/send', async (req, res) => {
  const user = await requireHubUser(req, res);
  if (!user) return;
  try {
    const admin = isUserAdmin(user);
    const invoice = await stripe.invoices.retrieve(req.params.id, { expand: ['payment_intent'] });

    if (!admin) {
      const normalizedJobs = await buildNormalizedJobsForUser(user, false);
      if (!invoiceMatchesJobs(invoice, normalizedJobs)) {
        return res.status(404).json({ error: 'Invoice not found.' });
      }
    }

    if (!['draft', 'open'].includes(invoice.status)) {
      return res.status(400).json({ error: `This invoice is already "${invoice.status}" — nothing to send.` });
    }

    // Customer already submitted payment (e.g. an ACH bank debit) and
    // it's just waiting to clear — don't resend/re-invoice them while
    // that's in flight, even if someone bypasses the disabled button.
    if (invoicePaymentIsProcessing(invoice)) {
      return res.status(400).json({ error: 'This invoice already has a payment submitted and processing — no need to resend.' });
    }

    const finalized = invoice.status === 'draft'
      ? await stripe.invoices.finalizeInvoice(invoice.id)
      : invoice;

    const sent = await stripe.invoices.sendInvoice(finalized.id);

    res.json({ invoice: publicInvoice(sent, null) });
  } catch (err) {
    console.error('invoice send error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Permanently deletes a DRAFT invoice — both the hub's view of it AND the
// underlying Stripe object (stripe.invoices.del only works on invoices
// still in "draft"; Stripe itself refuses to delete anything that's ever
// been finalized/sent, which is exactly the safety net we want here — an
// invoice a customer may have already seen should be voided in Stripe, not
// deleted). This is for cleaning up mistaken/duplicate drafts before
// they're ever sent, e.g. a job entered twice or wrong amount typed in.
// Same visibility check as /send: a non-admin can only delete drafts for
// jobs they're attached to.
app.delete('/api/invoices/:id', async (req, res) => {
  const user = await requireHubUser(req, res);
  if (!user) return;
  try {
    const admin = isUserAdmin(user);
    const invoice = await stripe.invoices.retrieve(req.params.id);

    if (!admin) {
      const normalizedJobs = await buildNormalizedJobsForUser(user, false);
      if (!invoiceMatchesJobs(invoice, normalizedJobs)) {
        return res.status(404).json({ error: 'Invoice not found.' });
      }
    }

    if (invoice.status !== 'draft') {
      return res.status(400).json({ error: `This invoice is "${invoice.status}", not a draft — it can only be voided in Stripe, not deleted.` });
    }

    await stripe.invoices.del(invoice.id);

    res.json({ deleted: true });
  } catch (err) {
    console.error('invoice delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Voids a SENT (open, unpaid) invoice — e.g. the customer said they'd pay
// the invoice, then decided to pay by credit card instead (invoices
// themselves have no card option here), so the invoice needs to come off
// the active list rather than sit open forever. Unlike the draft delete
// above, this is permanent in Stripe too and the record is kept (marked
// "void"), which is why it lands in the Voided tab (GET /api/invoices/voided)
// instead of vanishing.
//
// Blocked while a payment is already processing (e.g. mid-flight ACH) —
// voiding an invoice a customer already submitted payment against risks
// that payment landing against a voided invoice, which is exactly the
// confusion this whole feature exists to prevent. Same visibility check
// as everywhere else: a non-admin can only void invoices for their jobs.
app.post('/api/invoices/:id/void', async (req, res) => {
  const user = await requireHubUser(req, res);
  if (!user) return;
  try {
    const admin = isUserAdmin(user);
    const invoice = await stripe.invoices.retrieve(req.params.id, { expand: ['payment_intent'] });

    if (!admin) {
      const normalizedJobs = await buildNormalizedJobsForUser(user, false);
      if (!invoiceMatchesJobs(invoice, normalizedJobs)) {
        return res.status(404).json({ error: 'Invoice not found.' });
      }
    }

    if (invoice.status !== 'open') {
      return res.status(400).json({ error: `This invoice is "${invoice.status}" — only a sent, unpaid invoice can be voided here.` });
    }
    if (invoicePaymentIsProcessing(invoice)) {
      return res.status(400).json({ error: 'A payment is already submitted and processing on this invoice — wait for it to clear (or fail) before voiding.' });
    }

    const reason = (req.body && req.body.reason) || '';

    const voided = await stripe.invoices.voidInvoice(invoice.id);

    const meta = await loadVoidMeta();
    meta[invoice.id] = {
      reason: reason.trim(),
      voidedByName: fullNameOf(user),
      voidedAt: new Date().toISOString(),
    };
    await saveVoidMeta(meta);

    res.json({ invoice: publicInvoice(voided, null) });
  } catch (err) {
    console.error('invoice void error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------
// 7b. Hub admin panel — lets an admin (see isUserAdmin above) see every
// hub account, create one on someone else's behalf, reset a forgotten PIN
// without needing the old one, promote/demote admins, and remove an
// account. This replaces the old "no self-serve PIN reset" limitation
// (previously the only fix was editing the Blobs store by hand).
// ---------------------------------------------------------------------

// Never send pinHash/pinSalt/sessionToken to the client — this is the
// only shape of a user record that should ever leave the server.
function publicUser(u) {
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    isAdmin: isUserAdmin(u),
    createdAt: u.createdAt,
  };
}

app.get('/api/admin/users', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const users = await loadUsers();
    res.json({ users: users.map(publicUser) });
  } catch (err) {
    console.error('admin/users list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin creates an account on someone else's behalf (e.g. onboarding a new
// rep who isn't in front of the hub themselves) — same validation as the
// self-serve create-user above, plus an optional isAdmin flag.
app.post('/api/admin/users', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const { firstName, lastName, pin, isAdmin } = req.body;
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'firstName and lastName are required.' });
    }
    if (!/^\d{4}$/.test(pin || '')) {
      return res.status(400).json({ error: 'PIN must be 4 digits.' });
    }

    const users = await loadUsers();
    const target = normalizeForMatch(`${firstName} ${lastName}`);
    if (users.some((u) => normalizeForMatch(fullNameOf(u)) === target)) {
      return res.status(409).json({ error: 'An account already exists for that name.' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const newUser = {
      id: crypto.randomUUID(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      pinSalt: salt,
      pinHash: hashPin(pin, salt),
      sessionToken: crypto.randomUUID(),
      isAdmin: !!isAdmin,
      createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    await saveUsers(users);

    res.json({ user: publicUser(newUser) });
  } catch (err) {
    console.error('admin/users create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin sets a brand new PIN for someone else, no need to know their old
// one — this is the actual fix for "I forgot my PIN." Rotates their
// session too, so they (or anyone else who had that session) get signed
// out and have to log back in with the new PIN.
app.post('/api/admin/users/:id/reset-pin', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const { newPin } = req.body;
    if (!/^\d{4}$/.test(newPin || '')) {
      return res.status(400).json({ error: 'New PIN must be 4 digits.' });
    }

    const users = await loadUsers();
    const target = users.find((u) => u.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    target.pinSalt = salt;
    target.pinHash = hashPin(newPin, salt);
    target.sessionToken = crypto.randomUUID();
    await saveUsers(users);

    res.json({ user: publicUser(target) });
  } catch (err) {
    console.error('admin/users reset-pin error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Promote/demote another account's admin flag. Bootstrap admins (see
// BOOTSTRAP_ADMIN_NAMES above) can't be demoted through this endpoint —
// they'd just be treated as admin again on their next request anyway, so
// this just avoids a confusing "it didn't work" toggle in the UI.
app.post('/api/admin/users/:id/toggle-admin', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const { isAdmin } = req.body;
    const users = await loadUsers();
    const target = users.find((u) => u.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'User not found.' });
    }
    if (!isAdmin && BOOTSTRAP_ADMIN_NAMES.includes(normalizeForMatch(fullNameOf(target)))) {
      return res.status(400).json({ error: 'This person is a permanent admin and can\'t be demoted.' });
    }

    target.isAdmin = !!isAdmin;
    await saveUsers(users);

    res.json({ user: publicUser(target) });
  } catch (err) {
    console.error('admin/users toggle-admin error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Removes an account entirely (e.g. a typo'd duplicate, or someone who's
// left) so the name is free to re-create if they still need access.
app.delete('/api/admin/users/:id', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const users = await loadUsers();
    const target = users.find((u) => u.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'User not found.' });
    }
    if (BOOTSTRAP_ADMIN_NAMES.includes(normalizeForMatch(fullNameOf(target)))) {
      return res.status(400).json({ error: 'This person is a permanent admin and can\'t be deleted.' });
    }

    const remaining = users.filter((u) => u.id !== req.params.id);
    await saveUsers(remaining);

    res.json({ deleted: true });
  } catch (err) {
    console.error('admin/users delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Publishable key + Stripe account-level config the frontend needs.
// mapboxAccessToken (optional) enables address autocomplete on
// intake.html — it's a Mapbox *public* access token (starts with `pk.`),
// meant to be used client-side (same trust model as the Stripe publishable
// key above), so serving it here is fine. Without it, the address field
// just stays a plain text field.
app.get('/api/config', (req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN || null,
  });
});

// Run standalone with `node server.js` for local dev. When deployed to
// Netlify, this file is instead required by netlify/functions/api.js and
// wrapped with serverless-http, so app.listen() never runs there.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Surcharge checkout running on port ${PORT}`));
}

module.exports = app;
