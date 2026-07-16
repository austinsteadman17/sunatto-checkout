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

const URL_AMOUNT_DOLLARS = parseFloat(params.get('amount') || '0');
const AMOUNT_LOCKED = URL_AMOUNT_DOLLARS > 0;

let AMOUNT_CENTS = AMOUNT_LOCKED ? Math.round(URL_AMOUNT_DOLLARS * 100) : 0;

function fmt(cents) {
  return '$' + (cents / 100).toFixed(2);
}

document.getElementById('page-eyebrow').textContent =
  TYPE === 'deposit' ? '20% Deposit' : 'Final Balance (80%)';
document.getElementById('page-subtitle').textContent =
  `Southern Energy Distributors LLC${CUSTOMER_NAME ? ' — ' + CUSTOMER_NAME : ''}`;

let stripe, elements, paymentIntentId, currentPaymentMethodId, currentSurchargeCents;

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
    }),
  });
  const intentData = await intentRes.json();

  if (intentData.error) {
    errorEl.textContent = intentData.error;
    return;
  }

  paymentIntentId = intentData.paymentIntentId;

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
    const finalizeRes = await fetch('/api/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentIntentId,
        paymentMethodId: currentPaymentMethodId,
        baseAmountCents: AMOUNT_CENTS,
        surchargeCents: currentSurchargeCents,
      }),
    });
    const result = await finalizeRes.json();

    if (result.error) {
      errorEl2.textContent = result.error;
      return;
    }

    let finalStatus = result.status;

    if (finalStatus === 'requires_action') {
      const { error, paymentIntent } = await stripe.handleNextAction({ clientSecret: result.clientSecret });
      if (error) {
        errorEl2.textContent = error.message;
        return;
      }
      finalStatus = paymentIntent.status;
    }

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
