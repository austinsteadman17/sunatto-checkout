// Reads config from the URL so the SAME page/backend serves both the 20%
// deposit and the 80% balance. The dollar amount can either be provided in
// the link (?amount=...) — in which case it is shown locked and cannot be
// edited — or, if the link has no amount, whoever opens the page can type
// one in manually. Example links:
//   /checkout.html?type=deposit&amount=4600.00&name=Ismael+Martinez&email=x@y.com
//   /checkout.html?type=balance&name=Evan+Shiels&email=x@y.com   (amount typed in manually)

const params = new URLSearchParams(window.location.search);
const TYPE = params.get('type') === 'balance' ? 'balance' : 'deposit';
const CUSTOMER_NAME = params.get('name') || '';
const CUSTOMER_EMAIL = params.get('email') || '';
const CUSTOMER_PHONE = params.get('phone') || '';
const JOB_ADDRESS = params.get('address') || '';

const URL_AMOUNT_DOLLARS = parseFloat(params.get('amount') || '0');
const AMOUNT_LOCKED = URL_AMOUNT_DOLLARS > 0;

let AMOUNT_CENTS = AMOUNT_LOCKED ? Math.round(URL_AMOUNT_DOLLARS * 100) : 0;

function fmt(cents) {
  return '$' + (cents / 100).toFixed(2);
}

// Live comma-formatting for manually-typed amounts, e.g. typing "18500"
// becomes "18,500" as you type.
function formatNumberWithCommas(raw) {
  let [intPart, decPart] = raw.split('.');
  intPart = intPart.replace(/^0+(?=\d)/, '') || '0';
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
}

function attachCommaFormatting(field) {
  field.addEventListener('input', () => {
    const cursorFromEnd = field.value.length - field.selectionStart;
    let raw = field.value.replace(/[^\d.]/g, '');

    const firstDot = raw.indexOf('.');
    if (firstDot !== -1) {
      const intPart = raw.slice(0, firstDot);
      const decPart = raw.slice(firstDot + 1).replace(/\./g, '').slice(0, 2);
      raw = `${intPart}.${decPart}`;
    }

    field.value = raw ? formatNumberWithCommas(raw) : '';
    const newPos = Math.max(field.value.length - cursorFromEnd, 0);
    field.setSelectionRange(newPos, newPos);
  });
}

document.getElementById('page-eyebrow').textContent =
  TYPE === 'deposit' ? '20% Deposit' : 'Final Balance (80%)';
document.getElementById('page-subtitle').textContent =
  `Southern Energy Distributors LLC${CUSTOMER_NAME ? ' — ' + CUSTOMER_NAME : ''}${JOB_ADDRESS ? ' · ' + JOB_ADDRESS : ''}`;

document.getElementById('footnote').textContent =
  TYPE === 'deposit'
    ? 'Secure 20% deposit for your residential solar installation, due at signing. The remaining 80% balance will be invoiced separately after installation is complete. Processed securely via Stripe. Questions? Call (210) 504-7669.'
    : 'Secure final 80% balance payment for your completed residential solar installation. Processed securely via Stripe. Questions? Call (210) 504-7669.';

let stripe, elements, paymentIntentId, paymentIntentClientSecret, currentPaymentMethodId, currentSurchargeCents;

const lockedBlock = document.getElementById('locked-amount-block');
const manualBlock = document.getElementById('manual-amount-block');
const amountField = document.getElementById('amount-field');
const amountContinueButton = document.getElementById('amount-continue-button');
const paymentForm = document.getElementById('payment-form');
const errorEl = document.getElementById('error-message');

if (AMOUNT_LOCKED) {
  lockedBlock.style.display = 'flex';
  document.getElementById('locked-amount-value').textContent = fmt(AMOUNT_CENTS);
  manualBlock.style.display = 'none';
  paymentForm.style.display = 'block';
  init();
} else {
  lockedBlock.style.display = 'none';
  manualBlock.style.display = 'block';
  paymentForm.style.display = 'none';

  attachCommaFormatting(amountField);
  amountField.addEventListener('input', () => {
    errorEl.textContent = '';
  });

  amountField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      amountContinueButton.click();
    }
  });

  amountContinueButton.addEventListener('click', async () => {
    const dollars = parseFloat((amountField.value || '').replace(/,/g, ''));
    if (!dollars || dollars <= 0) {
      errorEl.textContent = 'Enter a valid amount before continuing.';
      return;
    }
    AMOUNT_CENTS = Math.round(dollars * 100);

    amountField.disabled = true;
    amountContinueButton.disabled = true;
    amountContinueButton.textContent = 'Loading…';

    await init();

    amountContinueButton.style.display = 'none';

    lockedBlock.style.display = 'flex';
    document.getElementById('locked-amount-caption').textContent = 'Amount';
    document.getElementById('locked-amount-value').textContent = fmt(AMOUNT_CENTS);

    const changeLink = document.createElement('a');
    changeLink.href = '#';
    changeLink.textContent = 'Change';
    changeLink.style.marginLeft = '8px';
    changeLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.reload();
    });
    document.getElementById('locked-amount-value').after(changeLink);

    manualBlock.style.display = 'none';
    paymentForm.style.display = 'block';
  });
}

async function init() {
  if (!AMOUNT_CENTS || AMOUNT_CENTS <= 0) {
    errorEl.textContent = 'No amount specified. Enter a valid amount before continuing.';
    return;
  }

  const configRes = await fetch('/api/config');
  const { publishableKey } = await configRes.json();
  stripe = Stripe(publishableKey);

  const intentRes = await fetch('/api/create-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amountCents: AMOUNT_CENTS,
      type: TYPE,
      customerName: CUSTOMER_NAME,
      customerEmail: CUSTOMER_EMAIL,
      customerPhone: CUSTOMER_PHONE,
      jobAddress: JOB_ADDRESS,
    }),
  });
  const intentData = await intentRes.json();

  if (intentData.error) {
    errorEl.textContent = intentData.error;
    return;
  }

  paymentIntentId = intentData.paymentIntentId;
  paymentIntentClientSecret = intentData.clientSecret;

  elements = stripe.elements({ clientSecret: intentData.clientSecret, paymentMethodCreation: 'manual' });
  const paymentElement = elements.create('payment');
  paymentElement.mount('#payment-element');
}

document.getElementById('payment-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const continueButton = document.getElementById('continue-button');
  errorEl.textContent = '';
  continueButton.disabled = true;
  continueButton.textContent = 'Checking payment method…';

  try {
    const { error: submitError } = await elements.submit();
    if (submitError) {
      errorEl.textContent = submitError.message;
      return;
    }

    const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({ elements });
    if (pmError) {
      errorEl.textContent = pmError.message;
      return;
    }

    currentPaymentMethodId = paymentMethod.id;

    const infoRes = await fetch('/api/payment-method-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentMethodId: paymentMethod.id, baseAmountCents: AMOUNT_CENTS }),
    });
    const info = await infoRes.json();
    if (info.error) {
      errorEl.textContent = info.error;
      return;
    }

    currentSurchargeCents = info.surchargeCents || 0;

    document.getElementById('bd-subtotal').textContent = fmt(AMOUNT_CENTS);
    document.getElementById('bd-total').textContent = fmt(info.totalCents);

    const surchargeRow = document.getElementById('bd-surcharge-row');
    const surchargeNote = document.getElementById('surcharge-note');
    if (currentSurchargeCents > 0) {
      document.getElementById('bd-surcharge').textContent = fmt(currentSurchargeCents);
      surchargeRow.style.display = 'flex';
      surchargeNote.style.display = 'block';
    } else {
      surchargeRow.style.display = 'none';
      surchargeNote.style.display = 'none';
    }

    document.getElementById('entry-screen').style.display = 'none';
    document.getElementById('breakdown-screen').style.display = 'block';
  } catch (err) {
    errorEl.textContent = 'Something went wrong (' + (err && err.message ? err.message : 'unknown error') + '). Please try again.';
  } finally {
    continueButton.disabled = false;
    continueButton.textContent = 'Continue';
  }
});

document.getElementById('back-button').addEventListener('click', () => {
  document.getElementById('breakdown-screen').style.display = 'none';
  document.getElementById('entry-screen').style.display = 'block';
  document.getElementById('error-message-2').textContent = '';
});

document.getElementById('confirm-button').addEventListener('click', async () => {
  const confirmButton = document.getElementById('confirm-button');
  const errorEl2 = document.getElementById('error-message-2');
  errorEl2.textContent = '';
  confirmButton.disabled = true;
  confirmButton.textContent = 'Processing…';

  try {
    // Step 1: server just updates the PaymentIntent's amount/surcharge —
    // it no longer confirms the payment itself. See server.js's
    // /api/finalize comment for why: confirming server-side broke every
    // ACH/bank-account payment with a "requires a mandate" error, since
    // only the browser (via stripe.confirmPayment below) can supply the
    // mandate data a bank debit legally requires.
    const finalizeRes = await fetch('/api/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentIntentId,
        baseAmountCents: AMOUNT_CENTS,
        surchargeCents: currentSurchargeCents,
      }),
    });
    const finalizeResult = await finalizeRes.json();

    if (finalizeResult.error) {
      errorEl2.textContent = finalizeResult.error;
      return;
    }

    // Step 2: confirm in the browser, reusing the PaymentMethod we already
    // created above. This is Stripe's documented pattern for "manual"
    // payment method creation, and the only way ACH mandate data gets
    // attached correctly. redirect: 'if_required' means most cards/bank
    // accounts resolve right here without ever leaving the page; Stripe
    // only redirects if the specific payment method truly requires it.
    const { error, paymentIntent } = await stripe.confirmPayment({
      clientSecret: paymentIntentClientSecret,
      confirmParams: {
        payment_method: currentPaymentMethodId,
        return_url: window.location.href,
      },
      redirect: 'if_required',
    });

    if (error) {
      errorEl2.textContent = error.message;
      return;
    }

    const finalStatus = paymentIntent.status;

    // Best-effort: let the server know the payment went through so it can
    // sync Monday.com / the payment-links hub. Fire-and-forget — never
    // blocks or affects the success screen below.
    fetch('/api/payment-confirmed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentIntentId }),
    }).catch(() => {});

    if (finalStatus === 'succeeded' || finalStatus === 'processing') {
      document.getElementById('breakdown-screen').style.display = 'none';
      document.getElementById('success-screen').style.display = 'block';
      document.getElementById('success-detail').textContent =
        finalStatus === 'processing'
          ? `Your ${TYPE === 'deposit' ? 'deposit' : 'balance'} payment (${fmt(AMOUNT_CENTS + currentSurchargeCents)}) is processing. ACH payments can take a few business days to clear.`
          : `Your ${TYPE === 'deposit' ? 'deposit' : 'balance'} payment of ${fmt(AMOUNT_CENTS + currentSurchargeCents)} was received. Thank you!`;
    } else {
      errorEl2.textContent = `Payment status: ${finalStatus}. Please contact Southern Energy Distributors if this seems wrong.`;
    }
  } catch (err) {
    errorEl2.textContent = 'Something went wrong (' + (err && err.message ? err.message : 'unknown error') + '). Please try again.';
  } finally {
    confirmButton.disabled = false;
    confirmButton.textContent = 'Confirm and Pay';
  }
});
