// Payment Links Hub. Lists the payment links intake.js has recorded via
// POST /api/links, filtered down to just the jobs the logged-in person is
// attached to on the "Sunatto Pipeline 2026" Monday board (Sales Rep,
// Office, or Manager column — see server.js's getUserAttachedJobs). Also
// lets them resend a link's email without digging through old texts.
//
// Login is name + PIN, no email/password account system:
//   - First visit on a device: enter first/last name. If that name has
//     never been seen before, create a 4-digit PIN. If it has, enter
//     the existing PIN.
//   - Later visits on the SAME device: the name is remembered in
//     localStorage (persists across browser restarts), so only the PIN
//     needs to be re-entered. "Switch user" clears that if a different
//     person is using this device.
//   - The actual session (X-Hub-Session header) is a short-lived token
//     kept in sessionStorage — cleared when the tab/browser closes, so a
//     new browser session always re-prompts for the PIN even though the
//     name is remembered.

const LS_USER_KEY = 'sunatto_hub_user';       // {userId, firstName, lastName} — persists across sessions
const SS_SESSION_KEY = 'sunatto_hub_session'; // sessionToken — cleared when the tab/browser closes

const loginView = document.getElementById('login-view');
const hubView = document.getElementById('hub-view');
const loginError = document.getElementById('login-error');

const stepName = document.getElementById('step-name');
const stepPinLogin = document.getElementById('step-pin-login');
const stepPinCreate = document.getElementById('step-pin-create');

const firstNameField = document.getElementById('first-name');
const lastNameField = document.getElementById('last-name');
const continueNameButton = document.getElementById('continue-name-button');

const pinLoginGreeting = document.getElementById('pin-login-greeting');
const pinLoginField = document.getElementById('pin-login-field');
const loginButton = document.getElementById('login-button');
const switchUserButton = document.getElementById('switch-user-button');

const pinCreateField = document.getElementById('pin-create-field');
const pinConfirmField = document.getElementById('pin-confirm-field');
const createPinButton = document.getElementById('create-pin-button');
const backToNameButton = document.getElementById('back-to-name-button');

const currentUserName = document.getElementById('current-user-name');
const currentUserAvatar = document.getElementById('current-user-avatar');
const logoutButton = document.getElementById('logout-button');
const jobCountNote = document.getElementById('job-count-note');
const refreshButton = document.getElementById('refresh-button');
const generateLinkButton = document.getElementById('generate-link-button');
const searchInput = document.getElementById('search-input');
const summaryStrip = document.getElementById('summary-strip');
const hubError = document.getElementById('hub-error');
const tableWrap = document.getElementById('table-wrap');

const generateView = document.getElementById('generate-view');
const jobPickerStep = document.getElementById('job-picker-step');
const jobFormStep = document.getElementById('job-form-step');
const jobSearchInput = document.getElementById('job-search-input');
const jobPickerList = document.getElementById('job-picker-list');
const selectedJobName = document.getElementById('selected-job-name');
const selectedJobAddress = document.getElementById('selected-job-address');
const changeJobButton = document.getElementById('change-job-button');
const backToListButton = document.getElementById('back-to-list-button');
const backToHubButton = document.getElementById('back-to-hub-button');
const genTypeDepositBtn = document.getElementById('gen-type-deposit-btn');
const genTypeBalanceBtn = document.getElementById('gen-type-balance-btn');
const genEmailField = document.getElementById('gen-email');
const genPhoneField = document.getElementById('gen-phone');
const genTotalCostField = document.getElementById('gen-total-cost');
const genAmountDueCaption = document.getElementById('gen-amount-due-caption');
const genAmountDueValue = document.getElementById('gen-amount-due-value');
const generateError = document.getElementById('generate-error');
const generateSuccess = document.getElementById('generate-success');
const genContinueButton = document.getElementById('gen-continue-button');
const genSendEmailButton = document.getElementById('gen-send-email-button');
const genLinkBlock = document.getElementById('gen-link-block');
const genGeneratedLinkField = document.getElementById('gen-generated-link');
const genCopyLinkButton = document.getElementById('gen-copy-link-button');

const changePinToggleButton = document.getElementById('change-pin-toggle-button');
const changePinPanel = document.getElementById('change-pin-panel');
const currentPinField = document.getElementById('current-pin-field');
const newPinField = document.getElementById('new-pin-field');
const confirmNewPinField = document.getElementById('confirm-new-pin-field');
const changePinError = document.getElementById('change-pin-error');
const changePinSuccess = document.getElementById('change-pin-success');
const savePinButton = document.getElementById('save-pin-button');
const cancelChangePinButton = document.getElementById('cancel-change-pin-button');
const cancelChangePinButtonTop = document.getElementById('cancel-change-pin-button-top');

const adminButton = document.getElementById('admin-button');
const adminView = document.getElementById('admin-view');
const backToHubFromAdminButton = document.getElementById('back-to-hub-from-admin-button');
const newUserFirstNameField = document.getElementById('new-user-first-name');
const newUserLastNameField = document.getElementById('new-user-last-name');
const newUserPinField = document.getElementById('new-user-pin');
const newUserIsAdminCheckbox = document.getElementById('new-user-is-admin');
const createUserError = document.getElementById('create-user-error');
const createUserSuccess = document.getElementById('create-user-success');
const createUserButton = document.getElementById('create-user-button');
const resetPinPanel = document.getElementById('reset-pin-panel');
const resetPinTargetName = document.getElementById('reset-pin-target-name');
const resetPinField = document.getElementById('reset-pin-field');
const resetPinError = document.getElementById('reset-pin-error');
const resetPinSuccess = document.getElementById('reset-pin-success');
const confirmResetPinButton = document.getElementById('confirm-reset-pin-button');
const cancelResetPinButton = document.getElementById('cancel-reset-pin-button');
const adminUsersError = document.getElementById('admin-users-error');
const adminUsersTableWrap = document.getElementById('admin-users-table-wrap');

const invoicesNavButton = document.getElementById('invoices-nav-button');
const invoicesView = document.getElementById('invoices-view');
const backToHubFromInvoicesButton = document.getElementById('back-to-hub-from-invoices-button');
const invoicesCountNote = document.getElementById('invoices-count-note');
const invoicesSummaryStrip = document.getElementById('invoices-summary-strip');
const invoicesSearchInput = document.getElementById('invoices-search-input');
const invoicesError = document.getElementById('invoices-error');
const invoicesTableWrap = document.getElementById('invoices-table-wrap');

// --- Custom confirm modal -------------------------------------------
// Replaces window.confirm() (which renders as a plain, unstyled browser
// dialog) with a modal that matches the rest of the hub's design system.
const confirmModalOverlay = document.getElementById('confirm-modal-overlay');
const confirmModalTitle = document.getElementById('confirm-modal-title');
const confirmModalMessage = document.getElementById('confirm-modal-message');
const confirmModalOkButton = document.getElementById('confirm-modal-ok');
const confirmModalCancelButton = document.getElementById('confirm-modal-cancel');
const confirmModalIcon = document.getElementById('confirm-modal-icon');
const CONFIRM_MODAL_ICON_SEND = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"></path><path d="M22 2 15 22l-4-9-9-4 20-7z"></path></svg>';
const CONFIRM_MODAL_ICON_DANGER = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';

function showConfirmModal({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    confirmModalTitle.textContent = title;
    confirmModalMessage.textContent = message;
    confirmModalOkButton.textContent = confirmLabel;
    confirmModalOkButton.classList.toggle('danger-action', danger);
    confirmModalIcon.classList.toggle('danger-icon', danger);
    confirmModalIcon.innerHTML = danger ? CONFIRM_MODAL_ICON_DANGER : CONFIRM_MODAL_ICON_SEND;
    confirmModalOverlay.style.display = 'flex';

    function cleanup(result) {
      confirmModalOverlay.style.display = 'none';
      confirmModalOkButton.removeEventListener('click', onOk);
      confirmModalCancelButton.removeEventListener('click', onCancel);
      confirmModalOverlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeydown);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onOverlayClick(e) { if (e.target === confirmModalOverlay) cleanup(false); }
    function onKeydown(e) { if (e.key === 'Escape') cleanup(false); }

    confirmModalOkButton.addEventListener('click', onOk);
    confirmModalCancelButton.addEventListener('click', onCancel);
    confirmModalOverlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeydown);
  });
}

// --- PIN box enhancement --------------------------------------------
// Purely visual: turns each real `<input type="password" maxlength="N">`
// PIN field into a row of single-digit boxes, without changing how the
// rest of this file reads/writes those fields. The original input stays
// in the DOM (just hidden) and remains the single source of truth — its
// `value` property is overridden so that setting it from anywhere else
// in this file (e.g. clearing a field after an error) automatically
// updates the boxes too, and typing into the boxes writes back through
// to the original input (including firing a real `input` event), so any
// existing `.value` reads or `addEventListener('input', ...)` listeners
// elsewhere keep working with zero changes.
function enhancePinInput(input, options = {}) {
  if (!input || input.dataset.enhanced) return;
  input.dataset.enhanced = 'true';
  const autoSubmit = !!options.autoSubmit;
  const submitButton = options.submitButton || null;

  // Every PIN in this system has always been 4 digits in practice (the
  // server accepts 4-6 as a range, but nothing has ever used more than 4)
  // — show 4 boxes to match, rather than the field's maxlength="6", which
  // made the UI look like it required a full 6-digit PIN.
  const max = 4;
  const wrap = document.createElement('div');
  wrap.className = 'pin-boxes';

  const boxes = [];
  for (let i = 0; i < max; i += 1) {
    const box = document.createElement('input');
    box.type = 'password';
    box.inputMode = 'numeric';
    box.setAttribute('pattern', '[0-9]*');
    box.maxLength = 1;
    box.autocomplete = 'one-time-code';
    box.className = 'pin-box';
    boxes.push(box);
    wrap.appendChild(box);
  }

  function writeThrough() {
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(input, boxes.map((b) => b.value).join(''));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function triggerSubmit() {
    // Prefer the button this field was explicitly wired to. Several of
    // these PIN steps share one parent .card with OTHER primary buttons
    // (e.g. the name/PIN-login/create-account steps all live in the same
    // card), so falling back to "the first .primary button in this card"
    // can silently click the wrong one — only use that as a last resort.
    const btn = submitButton || (input.closest('.card') && input.closest('.card').querySelector('button.primary'));
    if (btn && !btn.disabled) btn.click();
  }

  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/[^0-9]/g, '').slice(-1);
      box.classList.toggle('filled', !!box.value);
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
      writeThrough();
      // Once every box has a digit, submit automatically — no need to
      // click the button or press Enter after typing the last digit.
      if (autoSubmit && box.value && boxes.every((b) => b.value)) {
        triggerSubmit();
      }
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) {
        boxes[i - 1].focus();
      }
      if (e.key === 'Enter') {
        triggerSubmit();
      }
    });
    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
      boxes.forEach((b, idx) => { b.value = text[idx] || ''; b.classList.toggle('filled', !!b.value); });
      const nextEmpty = boxes.findIndex((b) => !b.value);
      boxes[nextEmpty === -1 ? boxes.length - 1 : nextEmpty].focus();
      writeThrough();
      if (autoSubmit && boxes.every((b) => b.value)) {
        triggerSubmit();
      }
    });
  });

  // Any code elsewhere that sets `input.value = ...` directly (clearing
  // the field after a failed attempt, etc.) should reflect in the boxes.
  const nativeDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  Object.defineProperty(input, 'value', {
    configurable: true,
    get() { return nativeDescriptor.get.call(input); },
    set(v) {
      nativeDescriptor.set.call(input, v);
      const chars = String(v || '').split('');
      boxes.forEach((b, i) => {
        b.value = chars[i] || '';
        b.classList.toggle('filled', !!b.value);
      });
    },
  });

  input.style.display = 'none';
  input.insertAdjacentElement('afterend', wrap);
  input.focusFirstBox = () => boxes[0].focus();
}

enhancePinInput(pinLoginField, { autoSubmit: true, submitButton: loginButton });
enhancePinInput(pinCreateField, { submitButton: createPinButton });
enhancePinInput(pinConfirmField, { submitButton: createPinButton });
enhancePinInput(currentPinField, { submitButton: savePinButton });
enhancePinInput(newPinField, { submitButton: savePinButton });
enhancePinInput(confirmNewPinField, { submitButton: savePinButton });
enhancePinInput(newUserPinField, { submitButton: createUserButton });
enhancePinInput(resetPinField, { submitButton: confirmResetPinButton });

let allLinks = [];
let pendingName = { firstName: '', lastName: '' }; // held between the name step and the pin steps

let myJobs = [];              // full job list (name/address/email/phone/totalCostCents) for this user
let myJobsLoaded = false;
let selectedJob = null;       // the job currently being turned into a link
let genType = 'deposit';
let genLastRecordedFingerprint = null;

let currentIsAdmin = false;
let adminUsers = [];
let resetPinTargetUserId = null;

let allInvoices = [];
let invoicesLoaded = false;

// --- storage helpers ---

function getRememberedUser() {
  try { return JSON.parse(localStorage.getItem(LS_USER_KEY) || 'null'); } catch (err) { return null; }
}
function rememberUser(user) {
  localStorage.setItem(LS_USER_KEY, JSON.stringify(user));
}
function forgetUser() {
  localStorage.removeItem(LS_USER_KEY);
}
function getSessionToken() {
  return sessionStorage.getItem(SS_SESSION_KEY) || '';
}
function setSessionToken(token) {
  sessionStorage.setItem(SS_SESSION_KEY, token);
}
function clearSessionToken() {
  sessionStorage.removeItem(SS_SESSION_KEY);
}

// --- formatting helpers ---

function fmtMoney(cents) {
  const dollars = ((cents || 0) / 100).toFixed(2);
  const [intPart, decPart] = dollars.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${withCommas}.${decPart}`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// --- view switching ---

function showLogin() {
  hubView.style.display = 'none';
  generateView.style.display = 'none';
  adminView.style.display = 'none';
  invoicesView.style.display = 'none';
  loginView.style.display = 'block';
}

function showHub() {
  loginView.style.display = 'none';
  generateView.style.display = 'none';
  adminView.style.display = 'none';
  invoicesView.style.display = 'none';
  hubView.style.display = 'block';
}

function showGenerate() {
  loginView.style.display = 'none';
  hubView.style.display = 'none';
  adminView.style.display = 'none';
  invoicesView.style.display = 'none';
  generateView.style.display = 'block';
}

function showAdmin() {
  loginView.style.display = 'none';
  hubView.style.display = 'none';
  generateView.style.display = 'none';
  invoicesView.style.display = 'none';
  adminView.style.display = 'block';
}

function showInvoices() {
  loginView.style.display = 'none';
  hubView.style.display = 'none';
  generateView.style.display = 'none';
  adminView.style.display = 'none';
  invoicesView.style.display = 'block';
}

function showStep(step) {
  stepName.style.display = step === 'name' ? 'block' : 'none';
  stepPinLogin.style.display = step === 'pin-login' ? 'block' : 'none';
  stepPinCreate.style.display = step === 'pin-create' ? 'block' : 'none';
  loginError.textContent = '';
}

// --- login flow ---

function initLogin() {
  const remembered = getRememberedUser();
  if (remembered && remembered.firstName) {
    pendingName = remembered;
    pinLoginGreeting.textContent = `Welcome back, ${remembered.firstName}.`;
    showLogin();
    showStep('pin-login');
    pinLoginField.focusFirstBox();
  } else {
    showLogin();
    showStep('name');
  }
}

continueNameButton.addEventListener('click', async () => {
  const firstName = firstNameField.value.trim();
  const lastName = lastNameField.value.trim();
  if (!firstName || !lastName) {
    loginError.textContent = 'Enter your first and last name.';
    return;
  }

  pendingName = { firstName, lastName };
  continueNameButton.disabled = true;
  continueNameButton.textContent = 'Checking…';
  loginError.textContent = '';

  try {
    const res = await fetch('/api/hub/lookup-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');

    if (data.userExists) {
      pinLoginGreeting.textContent = `Welcome back, ${firstName}.`;
      showStep('pin-login');
      pinLoginField.focusFirstBox();
    } else {
      showStep('pin-create');
      pinCreateField.focusFirstBox();
    }
  } catch (err) {
    loginError.textContent = err.message;
  } finally {
    continueNameButton.disabled = false;
    continueNameButton.textContent = 'Continue';
  }
});

loginButton.addEventListener('click', async () => {
  const pin = pinLoginField.value.trim();
  if (!pin) return;

  loginButton.disabled = true;
  loginButton.textContent = 'Checking…';
  loginError.textContent = '';

  try {
    const remembered = getRememberedUser();
    const body = remembered && remembered.userId
      ? { userId: remembered.userId, pin }
      : { firstName: pendingName.firstName, lastName: pendingName.lastName, pin };

    const res = await fetch('/api/hub/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Incorrect PIN.');

    setSessionToken(data.sessionToken);
    rememberUser({ userId: data.userId, firstName: data.firstName, lastName: data.lastName });
    await loadAndRender();
  } catch (err) {
    loginError.textContent = err.message;
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = 'Unlock';
    pinLoginField.value = '';
    // Clearing the boxes leaves focus sitting on whichever box it was
    // last on (box 4, since that's what triggers auto-submit) — after a
    // wrong PIN, put the cursor back at box 1 so retyping doesn't need a
    // manual click first.
    pinLoginField.focusFirstBox();
  }
});

switchUserButton.addEventListener('click', () => {
  forgetUser();
  pendingName = { firstName: '', lastName: '' };
  firstNameField.value = '';
  lastNameField.value = '';
  showStep('name');
  firstNameField.focus();
});

backToNameButton.addEventListener('click', () => {
  showStep('name');
  firstNameField.focus();
});

createPinButton.addEventListener('click', async () => {
  const pin = pinCreateField.value.trim();
  const confirmPin = pinConfirmField.value.trim();

  if (!/^\d{4}$/.test(pin)) {
    loginError.textContent = 'PIN must be 4 digits.';
    return;
  }
  if (pin !== confirmPin) {
    loginError.textContent = 'PINs don’t match.';
    pinCreateField.value = '';
    pinConfirmField.value = '';
    pinCreateField.focusFirstBox();
    return;
  }

  createPinButton.disabled = true;
  createPinButton.textContent = 'Creating…';
  loginError.textContent = '';

  try {
    const res = await fetch('/api/hub/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: pendingName.firstName, lastName: pendingName.lastName, pin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not create your account.');

    setSessionToken(data.sessionToken);
    rememberUser({ userId: data.userId, firstName: data.firstName, lastName: data.lastName });
    await loadAndRender();
  } catch (err) {
    loginError.textContent = err.message;
    pinCreateField.value = '';
    pinConfirmField.value = '';
    pinCreateField.focusFirstBox();
  } finally {
    createPinButton.disabled = false;
    createPinButton.textContent = 'Create Account';
  }
});

logoutButton.addEventListener('click', () => {
  clearSessionToken();
  currentIsAdmin = false;
  adminButton.style.display = 'none';
  changePinPanel.style.display = 'none';
  initLogin();
});

[firstNameField, lastNameField].forEach((field) => {
  field.addEventListener('keydown', (e) => { if (e.key === 'Enter') continueNameButton.click(); });
});
pinLoginField.addEventListener('keydown', (e) => { if (e.key === 'Enter') loginButton.click(); });
pinConfirmField.addEventListener('keydown', (e) => { if (e.key === 'Enter') createPinButton.click(); });

// --- data loading + rendering ---

async function fetchLinks() {
  const res = await fetch('/api/links', {
    headers: { 'X-Hub-Session': getSessionToken() },
  });
  if (res.status === 401) {
    clearSessionToken();
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return res.json();
}

// Refreshes the Admin button's visibility from the server (never trusted
// from cached/local state) — admin status can change after someone's
// already logged in, e.g. promoted or demoted by another admin.
async function refreshAdminButton() {
  try {
    const res = await fetch('/api/hub/me', { headers: { 'X-Hub-Session': getSessionToken() } });
    if (!res.ok) throw new Error('not ok');
    const data = await res.json();
    currentIsAdmin = !!data.isAdmin;
  } catch (err) {
    currentIsAdmin = false;
  }
  adminButton.style.display = currentIsAdmin ? 'inline-block' : 'none';
}

async function loadAndRender() {
  try {
    const data = await fetchLinks();
    allLinks = data.links || [];

    const remembered = getRememberedUser();
    const displayName = remembered ? `${remembered.firstName} ${remembered.lastName}` : '';
    currentUserName.textContent = displayName;
    currentUserAvatar.textContent = displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('');
    jobCountNote.textContent = data.isAdmin
      ? ''
      : data.jobCount
        ? `Showing links for the ${data.jobCount} job${data.jobCount === 1 ? '' : 's'} you're attached to on the Monday board.`
        : 'No jobs on the Monday board are attached to your name yet — once you’re added as Sales Rep, Office, or Manager on a job, its links will show up here.';

    hubError.textContent = '';
    await refreshAdminButton();

    // Sent Links' own table is rendered now too (even though it isn't
    // the visible view below) so it's instantly ready the moment someone
    // clicks over to it — same "render hidden, show later" trick used
    // for Invoices pre-loading before Invoices became the default view.
    renderTable();

    // Invoices is the primary view shown right after login — Sent Links
    // is the secondary one, reached via its own nav button from here.
    showInvoices();
    await fetchInvoices();
  } catch (err) {
    if (err.message === 'unauthorized') {
      const remembered = getRememberedUser();
      if (remembered && remembered.firstName) {
        pendingName = remembered;
        pinLoginGreeting.textContent = `Welcome back, ${remembered.firstName}. Please log in again.`;
        showLogin();
        showStep('pin-login');
        pinLoginField.focusFirstBox();
      } else {
        showLogin();
        showStep('name');
      }
    } else {
      const remembered = getRememberedUser();
      showLogin();
      showStep(remembered ? 'pin-login' : 'name');
      if (remembered) pinLoginField.focusFirstBox();
      loginError.textContent = err.message;
    }
  }
}

function renderSummary(links) {
  const paid = links.filter((l) => l.paid);
  const unpaid = links.filter((l) => !l.paid);
  const collected = paid.reduce((sum, l) => sum + (l.amountCents || 0), 0);
  const outstanding = unpaid.reduce((sum, l) => sum + (l.amountCents || 0), 0);

  const icon = (path) => `<span class="pill-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span>`;
  const iconSend = icon('<path d="M22 2 11 13"></path><path d="M22 2 15 22l-4-9-9-4 20-7Z"></path>');
  const iconCheck = icon('<circle cx="12" cy="12" r="9"></circle><path d="m8.5 12.5 2.5 2.5 5-5"></path>');
  const iconClock = icon('<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path>');
  const iconMoney = icon('<rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="3"></circle>');

  summaryStrip.innerHTML = `
    <div class="summary-pill">${iconSend}<div><strong>${links.length}</strong>Links sent</div></div>
    <div class="summary-pill icon-paid">${iconCheck}<div><strong>${paid.length}</strong>Paid</div></div>
    <div class="summary-pill icon-unpaid">${iconClock}<div><strong>${unpaid.length}</strong>Unpaid</div></div>
    <div class="summary-pill icon-money">${iconMoney}<div><strong>${fmtMoney(collected)}</strong>Collected</div></div>
    <div class="summary-pill">${iconMoney}<div><strong>${fmtMoney(outstanding)}</strong>Outstanding</div></div>
  `;
}

function matchesSearch(link, query) {
  if (!query) return true;
  const haystack = `${link.customerName} ${link.jobAddress}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function renderTable() {
  const query = searchInput.value.trim();
  renderSummary(allLinks);

  // A non-empty search now cross-references Invoices too, so the same
  // name only has to be typed once — see renderCombinedTable below.
  if (query) {
    renderCombinedTable(tableWrap, query);
    return;
  }

  const links = allLinks;

  if (links.length === 0) {
    tableWrap.innerHTML = `<div class="empty-state">No links to show yet for your jobs. They’ll show up here as soon as a rep sends one from the intake page for a job you’re attached to.</div>`;
    return;
  }

  const rows = links.map((link) => {
    const typeLabel = link.type === 'deposit' ? '20% Deposit' : '80% Balance';
    const statusBadge = link.paid
      ? '<span class="badge paid">Paid</span>'
      : '<span class="badge unpaid">Unpaid</span>';
    const sentInfo = link.sentCount > 1
      ? `${fmtDate(link.lastSentAt)} <span class="cust-sub">(sent ${link.sentCount}×)</span>`
      : fmtDate(link.lastSentAt);

    const canResend = !!link.customerEmail;

    return `
      <tr data-id="${link.id}">
        <td>
          <div class="cust-name">${escapeHtml(link.customerName || '(no name)')}</div>
          <div class="cust-sub">${escapeHtml(link.jobAddress || '')}</div>
          <div class="cust-sub">${escapeHtml(link.customerEmail || '')}${link.customerPhone ? ' · ' + escapeHtml(link.customerPhone) : ''}</div>
        </td>
        <td><span class="badge ${link.type}">${typeLabel}</span></td>
        <td>${fmtMoney(link.amountCents)}</td>
        <td>${statusBadge}</td>
        <td>${sentInfo}</td>
        <td>
          <div class="row-actions">
            <button type="button" class="secondary copy-btn" data-url="${escapeHtml(link.checkoutUrl)}">Copy Link</button>
            <button type="button" class="secondary resend-btn" data-id="${link.id}" ${canResend ? '' : 'disabled title="No email on file"'}>Resend</button>
            ${currentIsAdmin ? `<button type="button" class="secondary void-btn" data-id="${link.id}" data-name="${escapeHtml(link.customerName || 'this link')}" title="Remove a stale/incorrect link from the hub">Void</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tableWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Customer</th>
          <th>Type</th>
          <th>Amount</th>
          <th>Status</th>
          <th>Last Sent</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  tableWrap.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => copyLink(btn));
  });
  tableWrap.querySelectorAll('.resend-btn').forEach((btn) => {
    btn.addEventListener('click', () => resendLink(btn));
  });
  tableWrap.querySelectorAll('.void-btn').forEach((btn) => {
    btn.addEventListener('click', () => voidLink(btn));
  });
}

async function copyLink(btn) {
  const url = btn.getAttribute('data-url');
  const original = btn.textContent;
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = 'Copied';
  } catch (err) {
    btn.textContent = 'Copy failed';
  }
  setTimeout(() => { btn.textContent = original; }, 1500);
}

async function resendLink(btn) {
  const id = btn.getAttribute('data-id');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Sending…';
  hubError.textContent = '';

  try {
    const res = await fetch(`/api/links/${id}/resend`, {
      method: 'POST',
      headers: { 'X-Hub-Session': getSessionToken() },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Could not resend.');
    }
    btn.textContent = 'Sent!';
    await loadAndRender();
  } catch (err) {
    hubError.textContent = err.message;
    btn.textContent = original;
    btn.disabled = false;
  }
}

// Admin-only: pulls a stale/incorrect payment link record out of the hub
// entirely (e.g. one generated before financing terms were finalized that
// never actually reflected a real request sent to the homeowner). This
// only hides the record here — it has no effect on the underlying Stripe
// Checkout Session, which was already either used or abandoned.
async function voidLink(btn) {
  const id = btn.getAttribute('data-id');
  const name = btn.getAttribute('data-name') || 'this link';
  const confirmed = await showConfirmModal({
    title: 'Void this payment link?',
    message: `Remove ${name}'s payment link from the hub? This won't cancel or affect the actual Stripe checkout page if it was already sent — it just clears this stale record out of view here.`,
    confirmLabel: 'Void link',
    danger: true,
  });
  if (!confirmed) return;

  hubError.textContent = '';
  invoicesError.textContent = '';
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Voiding…';

  try {
    const res = await fetch(`/api/links/${id}/void`, {
      method: 'POST',
      headers: { 'X-Hub-Session': getSessionToken() },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not void link.');
    allLinks = allLinks.filter((l) => l.id !== id);
    renderTable();
    renderInvoicesTable();
  } catch (err) {
    hubError.textContent = err.message;
    btn.disabled = false;
    btn.textContent = original;
  }
}

refreshButton.addEventListener('click', loadAndRender);
searchInput.addEventListener('input', renderTable);

// --- Generate Payment Link ---
//
// Lets a logged-in person pick one of THEIR jobs (same visibility rule as
// the sent-links list above — Sales Rep/Office/Manager column match) and
// turn it into a payment link, pre-filled from the Monday board's Email,
// Customer Phone, and Total Cost columns instead of re-typing everything
// intake.html would ask for. Generating a link here calls the exact same
// POST /api/links + /api/send-homeowner-email endpoints intake.js uses,
// so it shows up on the Sent Links list the same way.

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
attachCommaFormatting(genTotalCostField);

async function openGenerateView() {
  generateError.textContent = '';
  generateSuccess.textContent = '';
  selectedJob = null;
  jobFormStep.style.display = 'none';
  jobPickerStep.style.display = 'block';
  showGenerate();

  if (!myJobsLoaded) {
    jobPickerList.innerHTML = '<div class="job-picker-empty">Loading your jobs…</div>';
    try {
      const res = await fetch('/api/hub/my-jobs', { headers: { 'X-Hub-Session': getSessionToken() } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load your jobs.');
      myJobs = data.jobs || [];
      myJobsLoaded = true;
    } catch (err) {
      jobPickerList.innerHTML = `<div class="job-picker-empty">${escapeHtml(err.message)}</div>`;
      return;
    }
  }
  renderJobPicker();
}

function renderJobPicker() {
  const query = jobSearchInput.value.trim().toLowerCase();
  const jobs = myJobs.filter((j) => !query || `${j.name} ${j.address}`.toLowerCase().includes(query));

  if (jobs.length === 0) {
    jobPickerList.innerHTML = `<div class="job-picker-empty">${
      myJobs.length === 0
        ? 'No jobs on the Monday board are attached to your name yet.'
        : 'No jobs match your search.'
    }</div>`;
    return;
  }

  jobPickerList.innerHTML = jobs.map((j, i) => `
    <div class="job-picker-row" data-index="${myJobs.indexOf(j)}">
      <div class="cust-name">${escapeHtml(j.name || '(no name)')}</div>
      <div class="cust-sub">${escapeHtml(j.address || '')}</div>
    </div>
  `).join('');

  jobPickerList.querySelectorAll('.job-picker-row').forEach((row) => {
    row.addEventListener('click', () => selectJob(myJobs[Number(row.getAttribute('data-index'))]));
  });
}

function selectJob(job) {
  selectedJob = job;
  generateError.textContent = '';
  generateSuccess.textContent = '';
  genLastRecordedFingerprint = null;

  selectedJobName.textContent = job.name || '(no name)';
  selectedJobAddress.textContent = job.address || '';
  genEmailField.value = job.email || '';
  genPhoneField.value = job.phone || '';
  genTotalCostField.value = job.totalCostCents ? formatNumberWithCommas((job.totalCostCents / 100).toFixed(2)) : '';
  genLinkBlock.style.display = 'none';

  setGenType('deposit');
  jobPickerStep.style.display = 'none';
  jobFormStep.style.display = 'block';
}

function setGenType(type) {
  genType = type;
  genTypeDepositBtn.classList.toggle('active', type === 'deposit');
  genTypeBalanceBtn.classList.toggle('active', type === 'balance');
  genAmountDueCaption.textContent = type === 'deposit' ? 'Amount due (20%)' : 'Amount due (80%)';
  recomputeGen();
}
genTypeDepositBtn.addEventListener('click', () => setGenType('deposit'));
genTypeBalanceBtn.addEventListener('click', () => setGenType('balance'));

function currentGenAmountCents() {
  const total = parseFloat((genTotalCostField.value || '').replace(/,/g, ''));
  if (!total || total <= 0) return 0;
  const rate = genType === 'deposit' ? 0.2 : 0.8;
  return Math.round(total * rate * 100);
}

function recomputeGen() {
  const cents = currentGenAmountCents();
  genAmountDueValue.textContent = fmtMoney(cents);

  const email = genEmailField.value.trim();
  const ready = !!selectedJob && cents > 0;
  genContinueButton.disabled = !ready;
  genSendEmailButton.disabled = !ready || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (ready) {
    genGeneratedLinkField.value = buildGenCheckoutUrl();
    genLinkBlock.style.display = 'block';
  } else {
    genLinkBlock.style.display = 'none';
  }
}
genTotalCostField.addEventListener('input', recomputeGen);
genEmailField.addEventListener('input', recomputeGen);

function buildGenCheckoutUrl() {
  const cents = currentGenAmountCents();
  const dollars = (cents / 100).toFixed(2);
  const out = new URLSearchParams();
  out.set('type', genType);
  out.set('amount', dollars);
  if (selectedJob && selectedJob.name) out.set('name', selectedJob.name);
  if (genEmailField.value.trim()) out.set('email', genEmailField.value.trim());
  if (genPhoneField.value.trim()) out.set('phone', genPhoneField.value.trim());
  if (selectedJob && selectedJob.address) out.set('address', selectedJob.address);
  return `${window.location.origin}/checkout.html?${out.toString()}`;
}

function genFingerprint() {
  return JSON.stringify([
    selectedJob && selectedJob.name,
    selectedJob && selectedJob.address,
    genEmailField.value.trim(),
    genPhoneField.value.trim(),
    genType,
    currentGenAmountCents(),
  ]);
}

async function recordGenLinkIfNeeded() {
  const fingerprint = genFingerprint();
  if (fingerprint === genLastRecordedFingerprint) return;
  genLastRecordedFingerprint = fingerprint;
  try {
    const cents = currentGenAmountCents();
    await fetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: selectedJob ? selectedJob.name : '',
        customerEmail: genEmailField.value.trim(),
        customerPhone: genPhoneField.value.trim(),
        jobAddress: selectedJob ? selectedJob.address : '',
        type: genType,
        amount: (cents / 100).toFixed(2),
        checkoutUrl: buildGenCheckoutUrl(),
      }),
    });
  } catch (err) {
    console.warn('Could not record this link (the link itself still works fine):', err);
  }
}

genContinueButton.addEventListener('click', async () => {
  if (genContinueButton.disabled) return;
  await recordGenLinkIfNeeded();
  window.open(buildGenCheckoutUrl(), '_blank');
});

genSendEmailButton.addEventListener('click', async () => {
  if (genSendEmailButton.disabled) return;
  generateError.textContent = '';
  generateSuccess.textContent = '';
  const original = genSendEmailButton.textContent;
  genSendEmailButton.textContent = 'Sending…';
  genSendEmailButton.disabled = true;

  recordGenLinkIfNeeded(); // fire-and-forget, runs alongside the email send below

  try {
    const cents = currentGenAmountCents();
    const response = await fetch('/api/send-homeowner-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: selectedJob ? selectedJob.name : '',
        customerEmail: genEmailField.value.trim(),
        jobAddress: selectedJob ? selectedJob.address : '',
        type: genType,
        amount: (cents / 100).toFixed(2),
        checkoutUrl: buildGenCheckoutUrl(),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Something went wrong sending the email.');
    generateSuccess.textContent = `Sent to ${genEmailField.value.trim()}.`;
  } catch (err) {
    generateError.textContent = 'Could not send email (' + err.message + '). You can still copy the link above.';
  } finally {
    genSendEmailButton.textContent = original;
    recomputeGen();
  }
});

genCopyLinkButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(genGeneratedLinkField.value);
    const original = genCopyLinkButton.textContent;
    genCopyLinkButton.textContent = 'Copied';
    setTimeout(() => { genCopyLinkButton.textContent = original; }, 1500);
  } catch (err) {
    genGeneratedLinkField.select();
    generateError.textContent = 'Could not copy automatically — link is selected, use Cmd/Ctrl+C.';
  }
});

generateLinkButton.addEventListener('click', openGenerateView);
jobSearchInput.addEventListener('input', renderJobPicker);
changeJobButton.addEventListener('click', () => {
  jobFormStep.style.display = 'none';
  jobPickerStep.style.display = 'block';
});
backToListButton.addEventListener('click', () => {
  jobFormStep.style.display = 'none';
  jobPickerStep.style.display = 'block';
});
backToHubButton.addEventListener('click', () => {
  showHub();
});

// --- Change PIN (self-service, anyone) ---

changePinToggleButton.addEventListener('click', () => {
  const showing = changePinPanel.style.display === 'block';
  changePinPanel.style.display = showing ? 'none' : 'block';
  changePinError.textContent = '';
  changePinSuccess.textContent = '';
  currentPinField.value = '';
  newPinField.value = '';
  confirmNewPinField.value = '';
  if (!showing) currentPinField.focusFirstBox();
});

cancelChangePinButton.addEventListener('click', () => {
  changePinPanel.style.display = 'none';
});
cancelChangePinButtonTop.addEventListener('click', () => {
  changePinPanel.style.display = 'none';
});

savePinButton.addEventListener('click', async () => {
  changePinError.textContent = '';
  changePinSuccess.textContent = '';

  const currentPin = currentPinField.value.trim();
  const newPin = newPinField.value.trim();
  const confirmPin = confirmNewPinField.value.trim();

  if (!currentPin) {
    changePinError.textContent = 'Enter your current PIN.';
    return;
  }
  if (!/^\d{4}$/.test(newPin)) {
    changePinError.textContent = 'New PIN must be 4 digits.';
    return;
  }
  if (newPin !== confirmPin) {
    changePinError.textContent = 'New PINs don’t match.';
    newPinField.value = '';
    confirmNewPinField.value = '';
    newPinField.focusFirstBox();
    return;
  }

  savePinButton.disabled = true;
  savePinButton.textContent = 'Saving…';

  try {
    const res = await fetch('/api/hub/change-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Session': getSessionToken() },
      body: JSON.stringify({ currentPin, newPin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not change PIN.');

    setSessionToken(data.sessionToken); // rotated server-side; keep this tab logged in
    changePinSuccess.textContent = 'PIN updated.';
    currentPinField.value = '';
    newPinField.value = '';
    confirmNewPinField.value = '';
  } catch (err) {
    // Almost always means the current PIN was wrong — clear it and put
    // the cursor back at box 1 so retyping doesn't need a manual click.
    changePinError.textContent = err.message;
    currentPinField.value = '';
    currentPinField.focusFirstBox();
  } finally {
    savePinButton.disabled = false;
    savePinButton.textContent = 'Save New PIN';
  }
});

// --- Admin panel ---

adminButton.addEventListener('click', () => {
  showAdmin();
  fetchAdminUsers();
});

backToHubFromAdminButton.addEventListener('click', () => {
  showHub();
});

async function fetchAdminUsers() {
  adminUsersError.textContent = '';
  adminUsersTableWrap.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const res = await fetch('/api/admin/users', { headers: { 'X-Hub-Session': getSessionToken() } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load users.');
    adminUsers = data.users || [];
    renderAdminUsers();
  } catch (err) {
    adminUsersTableWrap.innerHTML = '';
    adminUsersError.textContent = err.message;
  }
}

function renderAdminUsers() {
  if (adminUsers.length === 0) {
    adminUsersTableWrap.innerHTML = '<div class="empty-state">No hub accounts yet.</div>';
    return;
  }

  const rows = adminUsers.map((u) => {
    const name = `${u.firstName} ${u.lastName}`;
    return `
      <tr data-id="${u.id}">
        <td><div class="cust-name">${escapeHtml(name)}</div></td>
        <td>${u.isAdmin ? '<span class="badge admin">Admin</span>' : '<span class="badge staff">Staff</span>'}</td>
        <td>${fmtDate(u.createdAt)}</td>
        <td>
          <div class="row-actions">
            <button type="button" class="secondary reset-pin-btn" data-id="${u.id}" data-name="${escapeHtml(name)}">Reset PIN</button>
            <button type="button" class="secondary toggle-admin-btn" data-id="${u.id}" data-admin="${u.isAdmin ? '1' : '0'}">${u.isAdmin ? 'Remove Admin' : 'Make Admin'}</button>
            <button type="button" class="secondary delete-user-btn" data-id="${u.id}" data-name="${escapeHtml(name)}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  adminUsersTableWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Role</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  adminUsersTableWrap.querySelectorAll('.reset-pin-btn').forEach((btn) => {
    btn.addEventListener('click', () => openResetPinPanel(btn.getAttribute('data-id'), btn.getAttribute('data-name')));
  });
  adminUsersTableWrap.querySelectorAll('.toggle-admin-btn').forEach((btn) => {
    btn.addEventListener('click', () => toggleAdmin(btn));
  });
  adminUsersTableWrap.querySelectorAll('.delete-user-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteUser(btn.getAttribute('data-id'), btn.getAttribute('data-name')));
  });
}

function openResetPinPanel(userId, name) {
  resetPinTargetUserId = userId;
  resetPinTargetName.textContent = name;
  resetPinField.value = '';
  resetPinError.textContent = '';
  resetPinSuccess.textContent = '';
  resetPinPanel.style.display = 'block';
  resetPinPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  resetPinField.focusFirstBox();
}

cancelResetPinButton.addEventListener('click', () => {
  resetPinPanel.style.display = 'none';
  resetPinTargetUserId = null;
});

confirmResetPinButton.addEventListener('click', async () => {
  const newPin = resetPinField.value.trim();
  if (!/^\d{4}$/.test(newPin)) {
    resetPinError.textContent = 'New PIN must be 4 digits.';
    return;
  }

  confirmResetPinButton.disabled = true;
  confirmResetPinButton.textContent = 'Resetting…';
  resetPinError.textContent = '';

  try {
    const res = await fetch(`/api/admin/users/${resetPinTargetUserId}/reset-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Session': getSessionToken() },
      body: JSON.stringify({ newPin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not reset PIN.');
    resetPinSuccess.textContent = 'PIN reset — they can log in with the new PIN now.';
    resetPinField.value = '';
  } catch (err) {
    resetPinError.textContent = err.message;
  } finally {
    confirmResetPinButton.disabled = false;
    confirmResetPinButton.textContent = 'Reset PIN';
  }
});

async function toggleAdmin(btn) {
  const userId = btn.getAttribute('data-id');
  const currentlyAdmin = btn.getAttribute('data-admin') === '1';
  adminUsersError.textContent = '';
  btn.disabled = true;
  try {
    const res = await fetch(`/api/admin/users/${userId}/toggle-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Session': getSessionToken() },
      body: JSON.stringify({ isAdmin: !currentlyAdmin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not update admin access.');
    await fetchAdminUsers();
  } catch (err) {
    adminUsersError.textContent = err.message;
    btn.disabled = false;
  }
}

async function deleteUser(userId, name) {
  const confirmed = await showConfirmModal({
    title: 'Delete this account?',
    message: `Delete the hub account for ${name}? They'll need to create a new account (with a new PIN) if they need access again.`,
    confirmLabel: 'Delete account',
    danger: true,
  });
  if (!confirmed) {
    return;
  }
  adminUsersError.textContent = '';
  try {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'X-Hub-Session': getSessionToken() },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not delete user.');
    await fetchAdminUsers();
  } catch (err) {
    adminUsersError.textContent = err.message;
  }
}

createUserButton.addEventListener('click', async () => {
  createUserError.textContent = '';
  createUserSuccess.textContent = '';

  const firstName = newUserFirstNameField.value.trim();
  const lastName = newUserLastNameField.value.trim();
  const pin = newUserPinField.value.trim();
  const wantsAdmin = newUserIsAdminCheckbox.checked;

  if (!firstName || !lastName) {
    createUserError.textContent = 'Enter a first and last name.';
    return;
  }
  if (!/^\d{4}$/.test(pin)) {
    createUserError.textContent = 'PIN must be 4 digits.';
    return;
  }

  createUserButton.disabled = true;
  createUserButton.textContent = 'Creating…';

  try {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Session': getSessionToken() },
      body: JSON.stringify({ firstName, lastName, pin, isAdmin: wantsAdmin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not create user.');

    createUserSuccess.textContent = `Created ${firstName} ${lastName}. Give them their starting PIN — they can change it themselves any time from the hub.`;
    newUserFirstNameField.value = '';
    newUserLastNameField.value = '';
    newUserPinField.value = '';
    newUserIsAdminCheckbox.checked = false;
    await fetchAdminUsers();
  } catch (err) {
    createUserError.textContent = err.message;
  } finally {
    createUserButton.disabled = false;
    createUserButton.textContent = 'Create User';
  }
});

// --- Invoices ---
//
// Pulls Stripe invoices via GET /api/invoices, scoped server-side the same
// way Sent Links are (admins see everything, everyone else only sees
// invoices for jobs they're attached to on the Monday board). "Send" only
// appears for invoices still in "draft" or "open" — it finalizes (if
// needed) and emails the invoice directly, same end result as clicking
// "Finalize and send" in the Stripe dashboard.

invoicesNavButton.addEventListener('click', () => {
  showInvoices();
  fetchInvoices();
});

backToHubFromInvoicesButton.addEventListener('click', () => {
  showHub();
});

invoicesSearchInput.addEventListener('input', renderInvoicesTable);

async function fetchInvoices() {
  invoicesError.textContent = '';
  invoicesTableWrap.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const res = await fetch('/api/invoices', { headers: { 'X-Hub-Session': getSessionToken() } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load invoices.');
    allInvoices = data.invoices || [];
    invoicesLoaded = true;
    invoicesCountNote.textContent = data.isAdmin
      ? `Showing all ${allInvoices.length} invoice${allInvoices.length === 1 ? '' : 's'}.`
      : `Showing ${allInvoices.length} invoice${allInvoices.length === 1 ? '' : 's'} for jobs you're attached to.`;
    renderInvoicesTable();
  } catch (err) {
    invoicesTableWrap.innerHTML = '';
    invoicesError.textContent = err.message;
  }
}

// Two rows, same 4 columns (Drafts / Sent, unpaid / Processing / Paid):
// top row is how many invoices are in that state, bottom row is the $
// total for that exact same set, so each column reads top-to-bottom as
// "how many, how much" instead of a separate one-off "Outstanding" pill.
function renderInvoicesSummary(invoices) {
  const draft = invoices.filter((i) => i.status === 'draft');
  const processing = invoices.filter((i) => i.paymentProcessing);
  // "Sent, unpaid" excludes ones already processing a payment — otherwise
  // the same invoice would silently double-count across both columns,
  // and staff would still read it as "nothing's happened yet."
  const open = invoices.filter((i) => i.status === 'open' && !i.paymentProcessing);
  const paid = invoices.filter((i) => i.status === 'paid');

  const draftCents = draft.reduce((sum, i) => sum + (i.totalCents || 0), 0);
  const openCents = open.reduce((sum, i) => sum + (i.amountDueCents || 0), 0);
  const processingCents = processing.reduce((sum, i) => sum + (i.amountDueCents || 0), 0);
  const paidCents = paid.reduce((sum, i) => sum + (i.amountPaidCents || i.totalCents || 0), 0);

  const icon = (path) => `<span class="pill-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span>`;
  const iconDraft = icon('<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>');
  const iconClock = icon('<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path>');
  const iconProcessing = icon('<path d="M21 12a9 9 0 1 1-3-6.7"></path><path d="M21 3v6h-6"></path>');
  const iconCheck = icon('<circle cx="12" cy="12" r="9"></circle><path d="m8.5 12.5 2.5 2.5 5-5"></path>');
  const iconMoney = icon('<rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="3"></circle>');

  invoicesSummaryStrip.innerHTML = `
    <div class="summary-pill"><span class="pill-icon">${iconDraft}</span><div><strong>${draft.length}</strong>Drafts</div></div>
    <div class="summary-pill icon-unpaid">${iconClock}<div><strong>${open.length}</strong>Sent, unpaid</div></div>
    <div class="summary-pill icon-processing">${iconProcessing}<div><strong>${processing.length}</strong>Processing</div></div>
    <div class="summary-pill icon-paid">${iconCheck}<div><strong>${paid.length}</strong>Paid</div></div>
    <div class="summary-pill money"><span class="pill-icon">${iconMoney}</span><div><strong>${fmtMoney(draftCents)}</strong>Draft value</div></div>
    <div class="summary-pill money icon-unpaid">${iconMoney}<div><strong>${fmtMoney(openCents)}</strong>Unpaid value</div></div>
    <div class="summary-pill money icon-processing">${iconMoney}<div><strong>${fmtMoney(processingCents)}</strong>Processing value</div></div>
    <div class="summary-pill money icon-paid">${iconMoney}<div><strong>${fmtMoney(paidCents)}</strong>Paid value</div></div>
  `;
}

function matchesInvoiceSearch(invoice, query) {
  if (!query) return true;
  const haystack = `${invoice.customerName} ${invoice.jobName || ''} ${invoice.jobAddress || ''}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

const INVOICE_STATUS_LABELS = {
  draft: 'Draft',
  open: 'Sent',
  paid: 'Paid',
  uncollectible: 'Uncollectible',
  void: 'Void',
};

// invoice.status alone can't tell "nobody has done anything yet" apart
// from "the customer already submitted payment and it's just waiting
// to clear" (e.g. a multi-day ACH bank debit) — both look like "open"/
// "Sent". The server flags the latter as paymentProcessing so we can
// show a distinct "Processing" badge and stop offering Resend on it.
function invoiceStatusInfo(invoice) {
  if (invoice.paymentProcessing) {
    return { label: 'Processing', badgeClass: 'processing' };
  }
  return { label: INVOICE_STATUS_LABELS[invoice.status] || invoice.status, badgeClass: invoice.status };
}

// --- Combined search across Payment Links + Invoices ---
//
// Typing a name/address in EITHER the Sent Links search box or the
// Invoices search box searches both data sets at once and shows one
// merged table (each row tagged "Payment Link" or "Invoice"), so nobody
// has to repeat the same search in two different places. An empty
// query falls back to each view's normal, single-source table.

function combinedSearchResults(query) {
  const matchedLinks = allLinks
    .filter((l) => matchesSearch(l, query))
    .map((l) => ({ source: 'link', date: l.lastSentAt, item: l }));
  const matchedInvoices = allInvoices
    .filter((i) => matchesInvoiceSearch(i, query))
    .map((i) => ({ source: 'invoice', date: i.created, item: i }));
  return [...matchedLinks, ...matchedInvoices].sort(
    (a, b) => new Date(b.date || 0) - new Date(a.date || 0)
  );
}

function renderCombinedRow(entry) {
  if (entry.source === 'link') {
    const link = entry.item;
    const typeLabel = link.type === 'deposit' ? '20% Deposit' : '80% Balance';
    const statusBadge = link.paid
      ? '<span class="badge paid">Paid</span>'
      : '<span class="badge unpaid">Unpaid</span>';
    const canResend = !!link.customerEmail;
    return `
      <tr data-id="${link.id}" data-source="link">
        <td>
          <div class="cust-name">${escapeHtml(link.customerName || '(no name)')}</div>
          <div class="cust-sub">${escapeHtml(link.jobAddress || '')}</div>
          <div class="cust-sub">${escapeHtml(link.customerEmail || '')}${link.customerPhone ? ' · ' + escapeHtml(link.customerPhone) : ''}</div>
        </td>
        <td><span class="source-tag">Payment Link</span></td>
        <td><span class="badge ${link.type}">${typeLabel}</span></td>
        <td>${fmtMoney(link.amountCents)}</td>
        <td>${statusBadge}</td>
        <td>${fmtDate(link.lastSentAt)}</td>
        <td>
          <div class="row-actions">
            <button type="button" class="secondary copy-btn" data-url="${escapeHtml(link.checkoutUrl)}">Copy Link</button>
            <button type="button" class="secondary resend-btn" data-id="${link.id}" ${canResend ? '' : 'disabled title="No email on file"'}>Resend</button>
            ${currentIsAdmin ? `<button type="button" class="secondary void-btn" data-id="${link.id}" data-name="${escapeHtml(link.customerName || 'this link')}" title="Remove a stale/incorrect link from the hub">Void</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }

  const invoice = entry.item;
  const { label: statusLabel, badgeClass } = invoiceStatusInfo(invoice);
  const statusBadge = `<span class="badge ${badgeClass}">${statusLabel}</span>`;
  const typeBadge = invoice.type
    ? `<span class="badge ${invoice.type}">${invoice.type === 'deposit' ? '20% Deposit' : '80% Balance'}</span>`
    : '—';
  const hostedUrl = invoice.hostedInvoiceUrl;
  const editUrl = invoice.dashboardUrl;
  const canSend = !invoice.paymentProcessing && (invoice.status === 'draft' || invoice.status === 'open');
  const sendLabel = invoice.paymentProcessing
    ? 'Processing'
    : invoice.status === 'draft' ? 'Send' : invoice.status === 'open' ? 'Resend' : 'Sent';
  const sendTitle = invoice.paymentProcessing
    ? 'Payment already submitted and clearing — no need to resend.'
    : '';

  return `
    <tr data-id="${invoice.id}" data-source="invoice">
      <td>
        <div class="cust-name">${escapeHtml(invoice.customerName || invoice.customerEmail || '(no name)')}</div>
        <div class="cust-sub">${escapeHtml(invoice.jobAddress || '')}</div>
        <div class="cust-sub">${escapeHtml(invoice.customerEmail || '')}${invoice.number ? ' · ' + escapeHtml(invoice.number) : ''}</div>
      </td>
      <td><span class="source-tag">Invoice</span></td>
      <td>${typeBadge}</td>
      <td>${fmtMoney(invoice.totalCents)}</td>
      <td>${statusBadge}</td>
      <td>${fmtDate(invoice.created)}</td>
      <td>
        <div class="row-actions invoice-actions">
          ${hostedUrl ? `<a class="icon-link-btn" href="${escapeHtml(hostedUrl)}" target="_blank" rel="noopener" title="View invoice"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></a>` : ''}
          ${editUrl ? `<a class="icon-link-btn" href="${escapeHtml(editUrl)}" target="_blank" rel="noopener" title="Edit in Stripe"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>` : ''}
          <button type="button" class="secondary send-invoice-btn" data-id="${invoice.id}" ${canSend ? '' : 'disabled'} ${sendTitle ? `title="${escapeHtml(sendTitle)}"` : ''}>${sendLabel}</button>
        </div>
      </td>
    </tr>
  `;
}

function renderCombinedTable(container, query) {
  const results = combinedSearchResults(query);

  if (results.length === 0) {
    container.innerHTML = `<div class="empty-state">No payment links or invoices match "${escapeHtml(query)}".</div>`;
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Customer</th>
          <th>Source</th>
          <th>Type</th>
          <th>Amount</th>
          <th>Status</th>
          <th>Date</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${results.map(renderCombinedRow).join('')}</tbody>
    </table>
  `;

  container.querySelectorAll('.copy-btn').forEach((btn) => btn.addEventListener('click', () => copyLink(btn)));
  container.querySelectorAll('.resend-btn').forEach((btn) => btn.addEventListener('click', () => resendLink(btn)));
  container.querySelectorAll('.void-btn').forEach((btn) => btn.addEventListener('click', () => voidLink(btn)));
  container.querySelectorAll('.send-invoice-btn').forEach((btn) => btn.addEventListener('click', () => sendInvoiceFromHub(btn)));
}

function renderInvoicesTable() {
  const query = invoicesSearchInput.value.trim();

  renderInvoicesSummary(allInvoices);

  // A non-empty search now cross-references Sent Links too, so the same
  // name only has to be typed once — see renderCombinedTable above.
  if (query) {
    renderCombinedTable(invoicesTableWrap, query);
    return;
  }

  const invoices = allInvoices;

  if (invoices.length === 0) {
    invoicesTableWrap.innerHTML = `<div class="empty-state">No invoices found for your jobs yet.</div>`;
    return;
  }

  const rows = invoices.map((invoice) => {
    const { label: statusLabel, badgeClass } = invoiceStatusInfo(invoice);
    const statusBadge = `<span class="badge ${badgeClass}">${statusLabel}</span>`;
    const typeBadge = invoice.type
      ? `<span class="badge ${invoice.type}">${invoice.type === 'deposit' ? '20% Deposit' : '80% Balance'}</span>`
      : '—';
    const hostedUrl = invoice.hostedInvoiceUrl;
    const editUrl = invoice.dashboardUrl;
    const canSend = !invoice.paymentProcessing && (invoice.status === 'draft' || invoice.status === 'open');
    const sendLabel = invoice.paymentProcessing
      ? 'Processing'
      : invoice.status === 'draft' ? 'Send' : invoice.status === 'open' ? 'Resend' : 'Sent';
    const sendTitle = invoice.paymentProcessing
      ? 'Payment already submitted and clearing — no need to resend.'
      : '';

    return `
      <tr data-id="${invoice.id}">
        <td>
          <div class="cust-name">${escapeHtml(invoice.customerName || invoice.customerEmail || '(no name)')}</div>
          <div class="cust-sub">${escapeHtml(invoice.jobAddress || '')}</div>
          <div class="cust-sub">${escapeHtml(invoice.customerEmail || '')}${invoice.number ? ' · ' + escapeHtml(invoice.number) : ''}</div>
        </td>
        <td>${typeBadge}</td>
        <td>${fmtMoney(invoice.totalCents)}</td>
        <td>${statusBadge}</td>
        <td>${fmtDate(invoice.created)}</td>
        <td>
          <div class="row-actions invoice-actions">
            ${hostedUrl ? `<a class="icon-link-btn" href="${escapeHtml(hostedUrl)}" target="_blank" rel="noopener" title="View invoice"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></a>` : ''}
            ${editUrl ? `<a class="icon-link-btn" href="${escapeHtml(editUrl)}" target="_blank" rel="noopener" title="Edit in Stripe"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>` : ''}
            <button type="button" class="secondary send-invoice-btn" data-id="${invoice.id}" ${canSend ? '' : 'disabled'} ${sendTitle ? `title="${escapeHtml(sendTitle)}"` : ''}>${sendLabel}</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  invoicesTableWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Customer</th>
          <th>Type</th>
          <th>Amount</th>
          <th>Status</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  invoicesTableWrap.querySelectorAll('.send-invoice-btn').forEach((btn) => {
    btn.addEventListener('click', () => sendInvoiceFromHub(btn));
  });
}

async function sendInvoiceFromHub(btn) {
  const id = btn.getAttribute('data-id');
  const invoice = allInvoices.find((i) => i.id === id);
  if (!invoice) return;

  const label = invoice.customerName || invoice.customerEmail || 'this customer';
  const verb = invoice.status === 'open' ? 're-send' : 'send';
  const confirmed = await showConfirmModal({
    title: verb === 'send' ? 'Send this invoice?' : 'Re-send this invoice?',
    message: `${verb === 'send' ? 'Send' : 'Re-send'} this invoice (${fmtMoney(invoice.totalCents)}) to ${label} now? This emails them a real payment request.`,
    confirmLabel: verb === 'send' ? 'Send invoice' : 'Re-send invoice',
  });
  if (!confirmed) {
    return;
  }

  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Sending…';
  invoicesError.textContent = '';

  try {
    const res = await fetch(`/api/invoices/${id}/send`, {
      method: 'POST',
      headers: { 'X-Hub-Session': getSessionToken() },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not send invoice.');
    await fetchInvoices();
  } catch (err) {
    invoicesError.textContent = err.message;
    btn.disabled = false;
    btn.textContent = original;
  }
}

// --- boot ---

if (getSessionToken()) {
  loadAndRender();
} else {
  initLogin();
}
