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
const express = require('express');
const path = require('path');
const Stripe = require('stripe');

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
//    confirmed, update the PaymentIntent's amount/surcharge fields and
//    confirm it. On success, best-effort sync the result back to
//    Monday.com (see syncPaymentToMonday below) — this never blocks or
//    fails the payment response to the customer.
// ---------------------------------------------------------------------
app.post('/api/finalize', async (req, res) => {
  try {
    const { paymentIntentId, paymentMethodId, baseAmountCents, surchargeCents } = req.body;
    if (!paymentIntentId || !paymentMethodId || baseAmountCents == null) {
      return res.status(400).json({ error: 'paymentIntentId, paymentMethodId, and baseAmountCents are required' });
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

    const confirmed = await stripe.paymentIntents.confirm(
      paymentIntentId,
      { payment_method: paymentMethodId },
      PREVIEW_VERSION
    );

    res.json({
      status: confirmed.status,
      clientSecret: confirmed.client_secret, // frontend may need this if 3DS/next_action is required
    });

    // Fire-and-forget: don't make the customer wait on Monday.com, and never
    // let a Monday.com hiccup affect the payment result already sent above.
    if (confirmed.status === 'succeeded' || confirmed.status === 'processing') {
      syncPaymentToMonday(confirmed).catch((err) => {
        console.error('Monday.com sync failed (payment itself was NOT affected):', err);
      });
    }
  } catch (err) {
    console.error('finalize error:', err);
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
    if (!process.env.POSTMARK_SERVER_TOKEN) {
      return res.status(500).json({ error: 'POSTMARK_SERVER_TOKEN is not set on the server.' });
    }

    const { subject, textBody, htmlBody } = buildHomeownerEmail({
      customerName, jobAddress, type, amount, checkoutUrl,
    });

    const response = await fetch(POSTMARK_API_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': process.env.POSTMARK_SERVER_TOKEN,
      },
      body: JSON.stringify({
        From: `Southern Energy Distributors <${POSTMARK_FROM_EMAIL}>`,
        To: customerEmail,
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
      return res.status(502).json({ error: json.Message || 'Postmark rejected the email.' });
    }

    res.json({ sent: true, messageId: json.MessageID });
  } catch (err) {
    console.error('send-homeowner-email error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Publishable key + Stripe account-level config the frontend needs.
app.get('/api/config', (req, res) => {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

// Run standalone with `node server.js` for local dev. When deployed to
// Netlify, this file is instead required by netlify/functions/api.js and
// wrapped with serverless-http, so app.listen() never runs there.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Surcharge checkout running on port ${PORT}`));
}

module.exports = app;
