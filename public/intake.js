// Sales rep intake page. Collects job details, computes the locked 20%/80%
// amount from the total project cost, and hands everything off to
// checkout.html via URL parameters — either by navigating there directly
// (same device, rep hands the phone/laptop to the homeowner) or by copying
// a link to text/email to the homeowner.
//
// Example resulting link:
//   /checkout.html?type=deposit&amount=4600.00&name=Jane+Homeowner&email=jane%40example.com&phone=2105550123&address=123+Main+St%2C+Del+Rio%2C+TX

const params = new URLSearchParams(window.location.search);
let TYPE = params.get('type') === 'balance' ? 'balance' : 'deposit';

const typeDepositBtn = document.getElementById('type-deposit-btn');
const typeBalanceBtn = document.getElementById('type-balance-btn');
const nameField = document.getElementById('customer-name');
const addressField = document.getElementById('customer-address');
const emailField = document.getElementById('customer-email');
const phoneField = document.getElementById('customer-phone');
const totalCostField = document.getElementById('total-cost');
const amountDueCaption = document.getElementById('amount-due-caption');
const amountDueValue = document.getElementById('amount-due-value');
const errorEl = document.getElementById('error-message');
const successEl = document.getElementById('success-message');
const continueButton = document.getElementById('continue-button');
const sendEmailButton = document.getElementById('send-email-button');
const linkBlock = document.getElementById('link-block');
const generatedLinkField = document.getElementById('generated-link');
const copyLinkButton = document.getElementById('copy-link-button');

function fmt(cents) {
  return '$' + (cents / 100).toFixed(2);
}

// Live comma-formatting for the "Total project cost" field, e.g. typing
// "18500" becomes "18,500" and "18500.5" becomes "18,500.5" as you type.
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

    // Only allow one decimal point, max 2 decimal digits.
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

function setType(type) {
  TYPE = type;
  typeDepositBtn.classList.toggle('active', type === 'deposit');
  typeBalanceBtn.classList.toggle('active', type === 'balance');
  amountDueCaption.textContent = type === 'deposit' ? 'Amount due (20%)' : 'Amount due (80%)';
  recompute();
}

typeDepositBtn.addEventListener('click', () => setType('deposit'));
typeBalanceBtn.addEventListener('click', () => setType('balance'));

function currentAmountCents() {
  const total = parseFloat((totalCostField.value || '').replace(/,/g, ''));
  if (!total || total <= 0) return 0;
  const rate = TYPE === 'deposit' ? 0.2 : 0.8;
  return Math.round(total * rate * 100);
}

function recompute() {
  const cents = currentAmountCents();
  amountDueValue.textContent = fmt(cents);
  updateContinueState();
}

function updateContinueState() {
  const name = nameField.value.trim();
  const address = addressField.value.trim();
  const email = emailField.value.trim();
  const cents = currentAmountCents();
  const ready = name.length > 0 && address.length > 0 && cents > 0;
  continueButton.disabled = !ready;
  // Sending an email additionally requires a plausible email address.
  sendEmailButton.disabled = !ready || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (ready) {
    generatedLinkField.value = buildCheckoutUrl();
    linkBlock.style.display = 'block';
  } else {
    linkBlock.style.display = 'none';
  }
}

function buildCheckoutUrl() {
  const cents = currentAmountCents();
  const dollars = (cents / 100).toFixed(2);

  const out = new URLSearchParams();
  out.set('type', TYPE);
  out.set('amount', dollars);
  if (nameField.value.trim()) out.set('name', nameField.value.trim());
  if (emailField.value.trim()) out.set('email', emailField.value.trim());
  if (phoneField.value.trim()) out.set('phone', phoneField.value.trim());
  if (addressField.value.trim()) out.set('address', addressField.value.trim());

  return `${window.location.origin}/checkout.html?${out.toString()}`;
}

attachCommaFormatting(totalCostField);
totalCostField.addEventListener('input', () => {
  errorEl.textContent = '';
  successEl.textContent = '';
  recompute();
});
nameField.addEventListener('input', () => {
  errorEl.textContent = '';
  successEl.textContent = '';
  updateContinueState();
});
addressField.addEventListener('input', () => {
  errorEl.textContent = '';
  successEl.textContent = '';
  updateContinueState();
});
emailField.addEventListener('input', () => {
  errorEl.textContent = '';
  successEl.textContent = '';
  updateContinueState();
});
phoneField.addEventListener('input', updateContinueState);

continueButton.addEventListener('click', () => {
  if (continueButton.disabled) return;
  window.location.href = buildCheckoutUrl();
});

sendEmailButton.addEventListener('click', async () => {
  if (sendEmailButton.disabled) return;

  errorEl.textContent = '';
  successEl.textContent = '';
  const originalLabel = sendEmailButton.textContent;
  sendEmailButton.textContent = 'Sending…';
  sendEmailButton.disabled = true;

  try {
    const cents = currentAmountCents();
    const response = await fetch('/api/send-homeowner-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: nameField.value.trim(),
        customerEmail: emailField.value.trim(),
        jobAddress: addressField.value.trim(),
        type: TYPE,
        amount: (cents / 100).toFixed(2),
        checkoutUrl: buildCheckoutUrl(),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Something went wrong sending the email.');
    }
    successEl.textContent = `Sent to ${emailField.value.trim()}.`;
  } catch (err) {
    errorEl.textContent = 'Could not send email (' + err.message + '). You can still copy the link above.';
  } finally {
    sendEmailButton.textContent = originalLabel;
    updateContinueState();
  }
});

copyLinkButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(generatedLinkField.value);
    const original = copyLinkButton.textContent;
    copyLinkButton.textContent = 'Copied';
    setTimeout(() => { copyLinkButton.textContent = original; }, 1500);
  } catch (err) {
    // Clipboard API can fail in some contexts (e.g. non-HTTPS, older
    // browsers) — fall back to manual copy via text selection.
    generatedLinkField.select();
    errorEl.textContent = 'Could not copy automatically — link is selected, use Cmd/Ctrl+C.';
  }
});

setType(TYPE);

// Address autocomplete via Radar (https://radar.com) — optional. If
// RADAR_PUBLISHABLE_KEY isn't set on the server, this silently does
// nothing and the address field just stays a plain text field.
(async function initAddressAutocomplete() {
  try {
    const configRes = await fetch('/api/config');
    const config = await configRes.json();
    if (!config.radarPublishableKey || !window.Radar) return;

    Radar.initialize(config.radarPublishableKey);
    Radar.ui.autocomplete({
      container: 'customer-address', // renders into the existing input, keeping its styling
      countryCode: 'US',
      placeholder: '123 Main St, Del Rio, TX',
      onSelection: (address) => {
        addressField.value = address.formattedAddress || addressField.value;
        errorEl.textContent = '';
        successEl.textContent = '';
        updateContinueState();
      },
    });
  } catch (err) {
    // Autocomplete is a nice-to-have — if Radar's API is unreachable or
    // misconfigured, the address field just stays a plain text field.
    console.warn('Address autocomplete unavailable:', err);
  }
})();
