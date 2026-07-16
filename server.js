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
    const { amountCents, type, customerEmail, customerName, description } = req.body;

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
      });
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
//    confirm it.
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
  } catch (err) {
    console.error('finalize error:', err);
    res.status(500).json({ error: err.message });
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
