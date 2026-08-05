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
const hubError = document.getElementById('hub-error');
const tableWrap = document.getElementById('table-wrap');

const generateView = document.getElementById('generate-view');
const generateSubtitle = document.getElementById('generate-subtitle');
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
const genTypeCustomBtn = document.getElementById('gen-type-custom-btn');
const genEmailField = document.getElementById('gen-email');
const genPhoneField = document.getElementById('gen-phone');
const genTotalCostBlock = document.getElementById('gen-total-cost-block');
const genTotalCostField = document.getElementById('gen-total-cost');
const genCustomAmountBlock = document.getElementById('gen-custom-amount-block');
const genCustomAmountField = document.getElementById('gen-custom-amount');
const genAmountDueCaption = document.getElementById('gen-amount-due-caption');
const genAmountDueValue = document.getElementById('gen-amount-due-value');
const generateError = document.getElementById('generate-error');
const generateSuccess = document.getElementById('generate-success');
const genContinueButton = document.getElementById('gen-continue-button');
const genSendEmailButton = document.getElementById('gen-send-email-button');
const genLinkBlock = document.getElementById('gen-link-block');
const genGeneratedLinkField = document.getElementById('gen-generated-link');
const genCopyLinkButton = document.getElementById('gen-copy-link-button');

const customInvoiceEntryButton = document.getElementById('custom-invoice-entry-button');
const customInvoiceStep = document.getElementById('custom-invoice-step');
const ciBackButton = document.getElementById('ci-back-button');
const ciNameField = document.getElementById('ci-name');
const ciEmailField = document.getElementById('ci-email');
const ciPhoneField = document.getElementById('ci-phone');
const ciAddressField = document.getElementById('ci-address');
const ciModeFlatBtn = document.getElementById('ci-mode-flat-btn');
const ciModeSplitBtn = document.getElementById('ci-mode-split-btn');
const ciFlatBlock = document.getElementById('ci-flat-block');
const ciFlatDescriptionField = document.getElementById('ci-flat-description');
const ciFlatAmountField = document.getElementById('ci-flat-amount');
const ciSplitBlock = document.getElementById('ci-split-block');
const ciSplitDescriptionField = document.getElementById('ci-split-description');
const ciSplitDepositBtn = document.getElementById('ci-split-deposit-btn');
const ciSplitBalanceBtn = document.getElementById('ci-split-balance-btn');
const ciSplitTotalCostField = document.getElementById('ci-split-total-cost');
const ciAmountDueCaption = document.getElementById('ci-amount-due-caption');
const ciAmountDueValue = document.getElementById('ci-amount-due-value');
const ciError = document.getElementById('ci-error');
const ciSuccess = document.getElementById('ci-success');
const ciSubmitButton = document.getElementById('ci-submit-button');

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
const voidedNavButton = document.getElementById('voided-nav-button');
const invoicesRefreshButton = document.getElementById('invoices-refresh-button');
const invoicesCountNote = document.getElementById('invoices-count-note');
const invoicesSummaryStrip = document.getElementById('invoices-summary-strip');
const invoicesTabsEl = document.getElementById('invoices-tabs');
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

// --- Void-invoice modal (asks for a reason) ---------------------------
// A separate modal from the plain confirm one above because voiding a
// sent invoice needs a reason captured — both so the Voided tab shows
// WHY something was pulled out of the active list (e.g. "customer paid
// by credit card instead"), and in case Stripe itself ever surfaces that
// reason back to us. Resolves with the trimmed reason string, or null if
// the person cancelled.
const voidReasonModalOverlay = document.getElementById('void-reason-modal-overlay');
const voidReasonModalTitle = document.getElementById('void-reason-modal-title');
const voidReasonModalMessage = document.getElementById('void-reason-modal-message');
const voidReasonTextarea = document.getElementById('void-reason-textarea');
const voidReasonModalError = document.getElementById('void-reason-modal-error');
const voidReasonModalOkButton = document.getElementById('void-reason-modal-ok');
const voidReasonModalCancelButton = document.getElementById('void-reason-modal-cancel');

function showVoidReasonModal({ title = 'Void this invoice?', message = '' } = {}) {
  return new Promise((resolve) => {
    voidReasonModalTitle.textContent = title;
    voidReasonModalMessage.textContent = message;
    voidReasonTextarea.value = '';
    voidReasonModalError.textContent = '';
    voidReasonModalOverlay.style.display = 'flex';
    setTimeout(() => voidReasonTextarea.focus(), 0);

    function cleanup(result) {
      voidReasonModalOverlay.style.display = 'none';
      voidReasonModalOkButton.removeEventListener('click', onOk);
      voidReasonModalCancelButton.removeEventListener('click', onCancel);
      voidReasonModalOverlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeydown);
      resolve(result);
    }
    function onOk() {
      const reason = voidReasonTextarea.value.trim();
      if (!reason) {
        voidReasonModalError.textContent = 'Enter a reason for the void.';
        voidReasonTextarea.focus();
        return;
      }
      cleanup(reason);
    }
    function onCancel() { cleanup(null); }
    function onOverlayClick(e) { if (e.target === voidReasonModalOverlay) cleanup(null); }
    function onKeydown(e) { if (e.key === 'Escape') cleanup(null); }

    voidReasonModalOkButton.addEventListener('click', onOk);
    voidReasonModalCancelButton.addEventListener('click', onCancel);
    voidReasonModalOverlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeydown);
  });
}

// --- Mark-paid modal (asks how it was collected + a note) --------------
// For payments collected OUTSIDE Stripe — check, cash, another payment
// processor — since the hub has no way to detect those on its own.
// Resolves with { method, note } (trimmed), or null if cancelled.
const markPaidModalOverlay = document.getElementById('mark-paid-modal-overlay');
const markPaidModalTitle = document.getElementById('mark-paid-modal-title');
const markPaidModalMessage = document.getElementById('mark-paid-modal-message');
const markPaidMethodSelect = document.getElementById('mark-paid-method-select');
const markPaidNoteTextarea = document.getElementById('mark-paid-note-textarea');
const markPaidModalError = document.getElementById('mark-paid-modal-error');
const markPaidModalOkButton = document.getElementById('mark-paid-modal-ok');
const markPaidModalCancelButton = document.getElementById('mark-paid-modal-cancel');

function showMarkPaidModal({ title = 'Mark this invoice paid?', message = '' } = {}) {
  return new Promise((resolve) => {
    markPaidModalTitle.textContent = title;
    markPaidModalMessage.textContent = message;
    markPaidMethodSelect.value = 'check';
    markPaidNoteTextarea.value = '';
    markPaidModalError.textContent = '';
    markPaidModalOverlay.style.display = 'flex';
    setTimeout(() => markPaidNoteTextarea.focus(), 0);

    function cleanup(result) {
      markPaidModalOverlay.style.display = 'none';
      markPaidModalOkButton.removeEventListener('click', onOk);
      markPaidModalCancelButton.removeEventListener('click', onCancel);
      markPaidModalOverlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeydown);
      resolve(result);
    }
    function onOk() {
      const note = markPaidNoteTextarea.value.trim();
      if (!note) {
        markPaidModalError.textContent = 'Enter a note on how this was collected.';
        markPaidNoteTextarea.focus();
        return;
      }
      cleanup({ method: markPaidMethodSelect.value, note });
    }
    function onCancel() { cleanup(null); }
    function onOverlayClick(e) { if (e.target === markPaidModalOverlay) cleanup(null); }
    function onKeydown(e) { if (e.key === 'Escape') cleanup(null); }

    markPaidModalOkButton.addEventListener('click', onOk);
    markPaidModalCancelButton.addEventListener('click', onCancel);
    markPaidModalOverlay.addEventListener('click', onOverlayClick);
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
let genLastRecordedLinkId = null; // the hub record id for genLastRecordedFingerprint, so the Send Email handler can flag it as emailed after a real send

let currentIsAdmin = false;
let adminUsers = [];
let resetPinTargetUserId = null;

let allInvoices = [];
let invoicesLoaded = false;

// Which filter tab the combined Invoices/Payment Links table is showing.
// "unpaid" (the default landing view) = unpaid payment links + draft
// invoices nobody's sent yet. "sent" = invoices out the door and waiting
// on the customer to pay. "pending" = ONLY invoices whose Status is
// actively processing (e.g. an ACH payment mid-clear) — kept as its own
// tab rather than folded into "unpaid" since it's a materially different
// situation (money is already moving) from "nobody's done anything yet."
// "paid" = done. See entryTabBucket() for the exact mapping.
let currentInvoicesTab = 'overdue';

let allVoidedInvoices = [];

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

// Short form ("Jul 17") used in table date columns — the full
// date+time from fmtDate() takes up more column width than the date
// itself is usually worth in a list view.
function fmtDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
  jobsView.style.display = 'none';
  loginView.style.display = 'block';
}

function showHub() {
  loginView.style.display = 'none';
  generateView.style.display = 'none';
  adminView.style.display = 'none';
  invoicesView.style.display = 'none';
  jobsView.style.display = 'none';
  hubView.style.display = 'block';
}

function showGenerate() {
  loginView.style.display = 'none';
  hubView.style.display = 'none';
  adminView.style.display = 'none';
  invoicesView.style.display = 'none';
  jobsView.style.display = 'none';
  generateView.style.display = 'block';
}

function showAdmin() {
  loginView.style.display = 'none';
  hubView.style.display = 'none';
  generateView.style.display = 'none';
  invoicesView.style.display = 'none';
  jobsView.style.display = 'none';
  adminView.style.display = 'block';
}

function showInvoices() {
  loginView.style.display = 'none';
  hubView.style.display = 'none';
  generateView.style.display = 'none';
  adminView.style.display = 'none';
  jobsView.style.display = 'none';
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

    hubError.textContent = '';
    await refreshAdminButton();

    // Invoices is the one, merged main view — payment links and invoices
    // are shown together there (see renderInvoicesTable/renderCombinedTable
    // below). Voided is the secondary view, reached via its own nav button
    // and loaded lazily (see fetchVoidedInvoices) since it's visited far
    // less often.
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

function matchesSearch(link, query) {
  if (!query) return true;
  const haystack = `${link.customerName} ${link.jobAddress}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

// --- Voided tab ---------------------------------------------------------
// Shows invoices that have been voided (via the Void button on the main
// page below, or directly in the Stripe dashboard) — kept here as a
// record instead of just disappearing, since a deleted draft is gone for
// good but a voided invoice's whole point is that Stripe (and now the
// hub) keeps track of it.

async function fetchVoidedInvoices() {
  hubError.textContent = '';
  jobCountNote.textContent = '';
  tableWrap.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const res = await fetch('/api/invoices/voided', { headers: { 'X-Hub-Session': getSessionToken() } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load voided invoices.');
    allVoidedInvoices = data.invoices || [];
    renderVoidedTable();
  } catch (err) {
    tableWrap.innerHTML = '';
    hubError.textContent = err.message;
  }
}

function matchesVoidedSearch(invoice, query) {
  if (!query) return true;
  const haystack = `${invoice.customerName} ${invoice.jobName || ''} ${invoice.jobAddress || ''}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function renderVoidedTable() {
  const query = searchInput.value.trim();
  const invoices = allVoidedInvoices.filter((i) => matchesVoidedSearch(i, query));

  jobCountNote.textContent = `Showing ${invoices.length} voided invoice${invoices.length === 1 ? '' : 's'}.`;

  if (invoices.length === 0) {
    tableWrap.innerHTML = `<div class="empty-state">${
      query ? `No voided invoices match "${escapeHtml(query)}".` : 'No invoices have been voided yet.'
    }</div>`;
    return;
  }

  const rows = invoices.map((invoice) => {
    const typeBadge = invoice.type
      ? `<span class="badge ${invoice.type}">${invoice.type === 'deposit' ? '20% Deposit' : invoice.type === 'balance' ? '80% Balance' : 'Custom Invoice'}</span>`
      : '—';
    const editUrl = invoice.dashboardUrl;

    return `
      <tr data-id="${invoice.id}">
        <td>
          <div class="cust-name">${escapeHtml(invoice.customerName || invoice.customerEmail || '(no name)')}</div>
          <div class="cust-sub">${escapeHtml(invoice.jobAddress || '')}</div>
          <div class="cust-sub">${escapeHtml(invoice.customerEmail || '')}${invoice.number ? ' · ' + escapeHtml(invoice.number) : ''}</div>
        </td>
        <td>${typeBadge}</td>
        <td>${fmtMoney(invoice.totalCents)}</td>
        <td>${invoice.voidReason ? escapeHtml(invoice.voidReason) : '<span class="cust-sub">No reason on file</span>'}</td>
        <td>${invoice.voidedByName ? escapeHtml(invoice.voidedByName) : '—'}</td>
        <td>${fmtDateShort(invoice.voidedAt || invoice.created)}</td>
        <td>
          <div class="row-actions">
            ${editUrl ? `<a class="icon-link-btn" href="${escapeHtml(editUrl)}" target="_blank" rel="noopener" title="View in Stripe"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>` : ''}
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
          <th>Void Reason</th>
          <th>Voided By</th>
          <th>Voided</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
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
    renderInvoicesTable();
  } catch (err) {
    hubError.textContent = err.message;
    btn.disabled = false;
    btn.textContent = original;
  }
}

refreshButton.addEventListener('click', fetchVoidedInvoices);
invoicesRefreshButton.addEventListener('click', loadAndRender);
searchInput.addEventListener('input', renderVoidedTable);

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
attachCommaFormatting(genCustomAmountField);

async function openGenerateView() {
  generateError.textContent = '';
  generateSuccess.textContent = '';
  selectedJob = null;
  jobFormStep.style.display = 'none';
  customInvoiceStep.style.display = 'none';
  jobPickerStep.style.display = 'block';
  generateSubtitle.textContent = "Pick a job you're attached to on the Monday board.";
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
  genLastRecordedLinkId = null;

  selectedJobName.textContent = job.name || '(no name)';
  selectedJobAddress.textContent = job.address || '';
  genEmailField.value = job.email || '';
  genPhoneField.value = job.phone || '';
  genTotalCostField.value = job.totalCostCents ? formatNumberWithCommas((job.totalCostCents / 100).toFixed(2)) : '';
  genCustomAmountField.value = '';
  genLinkBlock.style.display = 'none';

  setGenType('deposit');
  jobPickerStep.style.display = 'none';
  jobFormStep.style.display = 'block';
}

function setGenType(type) {
  genType = type;
  genTypeDepositBtn.classList.toggle('active', type === 'deposit');
  genTypeBalanceBtn.classList.toggle('active', type === 'balance');
  genTypeCustomBtn.classList.toggle('active', type === 'custom');

  const isCustom = type === 'custom';
  genTotalCostBlock.style.display = isCustom ? 'none' : 'block';
  genCustomAmountBlock.style.display = isCustom ? 'block' : 'none';

  genAmountDueCaption.textContent =
    type === 'deposit' ? 'Amount due (20%)' :
    type === 'balance' ? 'Amount due (80%)' :
    'Amount due (Custom)';
  recomputeGen();
}
genTypeDepositBtn.addEventListener('click', () => setGenType('deposit'));
genTypeBalanceBtn.addEventListener('click', () => setGenType('balance'));
genTypeCustomBtn.addEventListener('click', () => setGenType('custom'));

function currentGenAmountCents() {
  if (genType === 'custom') {
    const custom = parseFloat((genCustomAmountField.value || '').replace(/,/g, ''));
    if (!custom || custom <= 0) return 0;
    return Math.round(custom * 100);
  }
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
genCustomAmountField.addEventListener('input', recomputeGen);
genEmailField.addEventListener('input', recomputeGen);

// One id per generated link, minted here so the SAME id goes into both the
// checkout URL (as ?ref=) and the stored record. checkout.js hands it back on
// the PaymentIntent, which is what lets a payment be tied to its link exactly
// instead of guessed from a name and address the homeowner typed themselves.
//
// Keyed on the same fingerprint recordGenLinkIfNeeded uses, so changing the
// job/type/amount mints a fresh id at the same moment a fresh record is
// created — otherwise the URL and the record would drift apart.
let genLinkRef = null;
let genLinkRefFingerprint = null;
function currentGenLinkRef() {
  const fp = genFingerprint();
  if (genLinkRef && genLinkRefFingerprint === fp) return genLinkRef;
  genLinkRef = crypto.randomUUID();
  genLinkRefFingerprint = fp;
  return genLinkRef;
}

function buildGenCheckoutUrl() {
  const cents = currentGenAmountCents();
  const dollars = (cents / 100).toFixed(2);
  const out = new URLSearchParams();
  out.set('type', genType);
  out.set('amount', dollars);
  out.set('ref', currentGenLinkRef());
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

// Returns the hub record id for the current job/type/amount, creating it
// first if nothing's been recorded yet (or reusing the cached one if
// nothing's changed since). Does NOT mark the link as emailed — that only
// happens in the Send Email handler below, after a real send succeeds.
async function recordGenLinkIfNeeded() {
  const fingerprint = genFingerprint();
  if (fingerprint === genLastRecordedFingerprint) return genLastRecordedLinkId;
  try {
    const cents = currentGenAmountCents();
    const res = await fetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: currentGenLinkRef(),
        // The Monday item this link is being raised against. Recorded at
        // creation so the payment can be attributed to a job by id rather
        // than by matching the name and address a homeowner typed in
        // themselves — the guesswork that left Bonnie Canesso's $5,300
        // sitting as "Awaiting" for a week after it had cleared.
        mondayItemId: selectedJob ? String(selectedJob.id) : '',
        customerName: selectedJob ? selectedJob.name : '',
        customerEmail: genEmailField.value.trim(),
        customerPhone: genPhoneField.value.trim(),
        jobAddress: selectedJob ? selectedJob.address : '',
        type: genType,
        amount: (cents / 100).toFixed(2),
        checkoutUrl: buildGenCheckoutUrl(),
      }),
    });
    const data = await res.json();
    genLastRecordedFingerprint = fingerprint;
    genLastRecordedLinkId = data && data.id ? data.id : null;
    return genLastRecordedLinkId;
  } catch (err) {
    console.warn('Could not record this link (the link itself still works fine):', err);
    return null;
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

  // Awaited (not fire-and-forget) so we have the link's id in hand before
  // deciding whether to flag it as emailed below.
  const linkId = await recordGenLinkIfNeeded();

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
    // The email genuinely went out — flag the link record so it moves
    // from Unpaid to Sent in the hub. Fire-and-forget: this is just a
    // tracking flag, the email itself already succeeded either way.
    if (linkId) {
      fetch(`/api/links/${linkId}/mark-emailed`, { method: 'POST' }).catch(() => {});
    }
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
  showInvoices();
});

// --- Custom Invoice (for a customer NOT on the Monday board) ---
//
// A parallel path off the same "Generate Payment Link" screen: instead of
// picking a job, every field is typed by hand, and submitting creates and
// sends a real Stripe invoice (not a payment link) via POST
// /api/custom-invoice. The rep can choose a flat one-off amount, or the
// same 20%/80% split used for pipeline jobs if this is a full project.

let ciMode = 'flat';
let ciSplitKind = 'deposit';

attachCommaFormatting(ciFlatAmountField);
attachCommaFormatting(ciSplitTotalCostField);

function openCustomInvoiceStep() {
  ciError.textContent = '';
  ciSuccess.textContent = '';
  ciNameField.value = '';
  ciEmailField.value = '';
  ciPhoneField.value = '';
  ciAddressField.value = '';
  ciFlatDescriptionField.value = '';
  ciFlatAmountField.value = '';
  ciSplitDescriptionField.value = '';
  ciSplitTotalCostField.value = '';
  setCiMode('flat');
  setCiSplitKind('deposit');
  generateSubtitle.textContent = 'Create and send a one-off Stripe invoice for a customer not on the Monday board.';
  jobPickerStep.style.display = 'none';
  jobFormStep.style.display = 'none';
  customInvoiceStep.style.display = 'block';
  recomputeCi();
}

function closeCustomInvoiceStep() {
  customInvoiceStep.style.display = 'none';
  jobPickerStep.style.display = 'block';
  generateSubtitle.textContent = "Pick a job you're attached to on the Monday board.";
}

function setCiMode(mode) {
  ciMode = mode;
  ciModeFlatBtn.classList.toggle('active', mode === 'flat');
  ciModeSplitBtn.classList.toggle('active', mode === 'split');
  ciFlatBlock.style.display = mode === 'flat' ? 'block' : 'none';
  ciSplitBlock.style.display = mode === 'split' ? 'block' : 'none';
  updateCiAmountCaption();
  recomputeCi();
}

function setCiSplitKind(kind) {
  ciSplitKind = kind;
  ciSplitDepositBtn.classList.toggle('active', kind === 'deposit');
  ciSplitBalanceBtn.classList.toggle('active', kind === 'balance');
  updateCiAmountCaption();
  recomputeCi();
}

function updateCiAmountCaption() {
  ciAmountDueCaption.textContent = ciMode === 'flat'
    ? 'Amount due'
    : (ciSplitKind === 'deposit' ? 'Amount due (20%)' : 'Amount due (80%)');
}

function currentCiAmountCents() {
  if (ciMode === 'flat') {
    const amt = parseFloat((ciFlatAmountField.value || '').replace(/,/g, ''));
    if (!amt || amt <= 0) return 0;
    return Math.round(amt * 100);
  }
  const total = parseFloat((ciSplitTotalCostField.value || '').replace(/,/g, ''));
  if (!total || total <= 0) return 0;
  const rate = ciSplitKind === 'deposit' ? 0.2 : 0.8;
  return Math.round(total * rate * 100);
}

function recomputeCi() {
  const cents = currentCiAmountCents();
  ciAmountDueValue.textContent = fmtMoney(cents);

  const email = ciEmailField.value.trim();
  const name = ciNameField.value.trim();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const descriptionOk = ciMode === 'flat'
    ? !!ciFlatDescriptionField.value.trim()
    : !!ciSplitDescriptionField.value.trim();

  ciSubmitButton.disabled = !(name && validEmail && cents > 0 && descriptionOk);
}

customInvoiceEntryButton.addEventListener('click', openCustomInvoiceStep);
ciBackButton.addEventListener('click', closeCustomInvoiceStep);
ciModeFlatBtn.addEventListener('click', () => setCiMode('flat'));
ciModeSplitBtn.addEventListener('click', () => setCiMode('split'));
ciSplitDepositBtn.addEventListener('click', () => setCiSplitKind('deposit'));
ciSplitBalanceBtn.addEventListener('click', () => setCiSplitKind('balance'));
[ciNameField, ciEmailField, ciFlatDescriptionField, ciFlatAmountField, ciSplitDescriptionField, ciSplitTotalCostField]
  .forEach((field) => field.addEventListener('input', recomputeCi));

ciSubmitButton.addEventListener('click', async () => {
  if (ciSubmitButton.disabled) return;
  ciError.textContent = '';
  ciSuccess.textContent = '';
  const original = ciSubmitButton.textContent;
  ciSubmitButton.textContent = 'Sending…';
  ciSubmitButton.disabled = true;

  const payload = {
    customerName: ciNameField.value.trim(),
    customerEmail: ciEmailField.value.trim(),
    customerPhone: ciPhoneField.value.trim(),
    customerAddress: ciAddressField.value.trim(),
    mode: ciMode,
  };
  if (ciMode === 'flat') {
    payload.description = ciFlatDescriptionField.value.trim();
    payload.amount = (currentCiAmountCents() / 100).toFixed(2);
  } else {
    payload.description = ciSplitDescriptionField.value.trim();
    payload.kind = ciSplitKind;
    payload.totalCost = ciSplitTotalCostField.value.replace(/,/g, '');
  }

  try {
    const res = await fetch('/api/custom-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Session': getSessionToken() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not create the invoice.');

    ciSuccess.textContent = `Invoice ${data.invoiceNumber || ''} sent to ${payload.customerEmail}.`;
    ciNameField.value = '';
    ciEmailField.value = '';
    ciPhoneField.value = '';
    ciAddressField.value = '';
    ciFlatDescriptionField.value = '';
    ciFlatAmountField.value = '';
    ciSplitDescriptionField.value = '';
    ciSplitTotalCostField.value = '';
  } catch (err) {
    ciError.textContent = err.message;
  } finally {
    ciSubmitButton.textContent = original;
    recomputeCi();
  }
});

// --- Switch payment method ------------------------------------------------
//
// Invoices are bank-only on this Stripe account and can't carry the 3%
// credit-card surcharge; payment links offer both and do surcharge properly.
// So "customer wants to pay the other way" is a real operation, not a label
// change: it voids the obsolete request and issues the correct one.
//
// Going to a link offers two deliveries, because reps are often on the phone
// with the card already in hand:
//   "Email it"     — Postmark it to the homeowner to fill in themselves.
//   "In person"    — nothing is emailed; the checkout page opens on our end so
//                    the rep can take the card details there and then.
async function switchPaymentMethod(btn) {
  const source = btn.getAttribute('data-source');
  const id = btn.getAttribute('data-id');
  const who = btn.getAttribute('data-name') || 'this customer';
  const toLink = source === 'invoice';

  let deliver = 'email';
  if (toLink) {
    const choice = await showSwitchDeliveryModal(who);
    if (!choice) return;
    deliver = choice;
  } else {
    const ok = await showConfirmModal({
      title: 'Switch to an invoice?',
      message: `This voids the payment link for ${who} and emails them a proper invoice instead. The old link stops working immediately.`,
      confirmLabel: 'Switch to Invoice',
    });
    if (!ok) return;
  }

  const original = btn.textContent;
  btn.textContent = 'Switching…';
  btn.disabled = true;
  try {
    const res = await fetch('/api/switch-method', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Session': getSessionToken() },
      body: JSON.stringify({ source, id, deliver }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not switch the payment method.');

    if (data.to === 'link' && deliver === 'manual' && data.checkoutUrl) {
      window.open(data.checkoutUrl, '_blank', 'noopener');
    }
    await loadAndRender();
  } catch (err) {
    btn.textContent = original;
    btn.disabled = false;
    await showConfirmModal({
      title: 'Switch failed',
      message: err.message,
      confirmLabel: 'OK',
      danger: true,
    });
  }
}

// Two real choices plus cancel, so it can't reuse the yes/no confirm modal.
function showSwitchDeliveryModal(who) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"></rect><path d="M2 10h20"></path></svg>
        </div>
        <div class="modal-title">Switch to a payment link?</div>
        <p class="modal-message">
          This voids the invoice for ${escapeHtml(who)} and creates a card-enabled payment link
          for the same milestone. Credit card payments will include the 3% surcharge.
          How should it reach them?
        </p>
        <div class="modal-actions">
          <button type="button" class="secondary" data-act="cancel">Cancel</button>
          <button type="button" class="secondary" data-act="manual">In person</button>
          <button type="button" class="icon-btn primary-action" data-act="email">Email it</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.style.display = 'flex';

    function cleanup(result) {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }
    function onKey(e) { if (e.key === 'Escape') cleanup(null); }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) return cleanup(null);
      const act = e.target.closest('[data-act]');
      if (!act) return;
      const a = act.getAttribute('data-act');
      cleanup(a === 'cancel' ? null : a);
    });
    document.addEventListener('keydown', onKey);
  });
}

// --- Reconcile payments ---------------------------------------------------
//
// Payment links used to be matched to their payments by customer name and
// job address. Homeowners type those themselves at checkout, so a job the
// board calls "Steve Canesso, 4040 Azalea Wy, TX" could arrive as "Bonnie Lee
// Canesso, 4040 Azalea Trail, Texas" — nothing matched, and the hub kept
// showing money as owed that was already collected.
//
// New links carry their own id through the checkout URL so this can't recur.
// This tool cleans up everything from before that, and stays useful as a
// periodic "does the hub agree with Stripe?" check.
//
// Deliberately two steps: it shows exactly what it will change first, and
// only touches records the caller then confirms.
const reconcileButton = document.getElementById('reconcile-button');
const reconcilePanel = document.getElementById('reconcile-panel');

function reconcileRowHtml(r, i) {
  // Stripe shows the gross charge; only the base pays down the job. Showing
  // one without the other is what made $6,180 look like $6,000 had gone
  // missing, so show both whenever the surcharge made them differ.
  const gross = r.amountCents;
  const base = r.baseAmountCents || r.amountCents;
  const amt = base === gross
    ? fmtMoney(base)
    : `${fmtMoney(gross)} charged · ${fmtMoney(base)} toward the balance`;
  const kind = r.type === 'deposit' ? '20% Deposit' : r.type === 'balance' ? '80% Balance' : 'Custom';
  const when = r.paidAt ? fmtDateShort(r.paidAt) : '';
  const confident = r.outcome === 'will_mark_paid';

  // Why it did or didn't match, in plain words. The whole point of this screen
  // is that nobody approves money movement they don't understand.
  const reason = confident
    ? (r.matchedBy === 'link_id'
        ? 'The payment carries this link’s own ID — an exact match, no guessing.'
        : r.matchedBy === 'email'
        ? 'Matched on the email address the link was sent to, plus the same amount and milestone.'
        : 'Matched on customer name and job address, plus the same amount and milestone.')
    : (r.suggestions && r.suggestions.length
        ? 'Nothing identified this payment for certain. Check the link(s) below and confirm which one it belongs to — if the amounts differ it will be recorded as a partial payment.'
        : 'No unpaid link matches this amount and milestone. It may already be recorded, or belong to a job not in the hub.');

  const paidWhat = `
    <div class="cust-sub"><strong>Paid:</strong> ${amt} · ${escapeHtml(kind)}${when ? ' · ' + when : ''}</div>
    <div class="cust-sub"><strong>They entered:</strong> ${escapeHtml(r.customerName || '—')}${r.customerEmail ? ' · ' + escapeHtml(r.customerEmail) : ''}</div>
    ${r.jobAddress ? `<div class="cust-sub"><strong>Address given:</strong> ${escapeHtml(r.jobAddress)}</div>` : ''}
    ${r.paymentMethod ? `<div class="cust-sub"><strong>Method:</strong> ${escapeHtml(r.paymentMethod)}</div>` : ''}`;

  let target = '';
  if (confident && r.matchedLink) {
    const L = r.matchedLink;
    target = `
      <div class="cust-sub" style="margin-top:8px;"><strong>Would attach to this link:</strong></div>
      <div class="cust-sub">${escapeHtml(L.name || '(no name)')}${L.email ? ' · ' + escapeHtml(L.email) : ''}</div>
      ${L.address ? `<div class="cust-sub">${escapeHtml(L.address)}</div>` : ''}
      <div class="cust-sub">${fmtMoney(L.amountCents)} · sent ${L.lastSentAt ? fmtDateShort(L.lastSentAt) : 'never'}</div>`;
  } else if (r.suggestions && r.suggestions.length) {
    const opts = r.suggestions.map((sg) => `
      <label class="checkbox-row" style="align-items:flex-start;">
        <input type="radio" name="rc-${i}" value="${escapeHtml(sg.id)}" />
        <span>
          <span class="cust-name">${escapeHtml(sg.name || '(no name)')}</span>
          <span class="cust-sub">${escapeHtml(sg.email || '')}${sg.address ? ' · ' + escapeHtml(sg.address) : ''}</span>
          <span class="cust-sub">Link is for ${fmtMoney(sg.amountCents)}${sg.amountCents !== base ? ' — ' + fmtMoney(Math.abs(sg.amountCents - base)) + (sg.amountCents > base ? ' short of this link' : ' more than this link') : ' — exact match'}</span>
        </span>
      </label>`).join('');
    target = `<div class="cust-sub" style="margin-top:8px;"><strong>Possible links:</strong></div>${opts}`;
  }

  const canApprove = confident || (r.suggestions && r.suggestions.length);
  return `
    <div class="selected-job-banner" style="display:block; margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
        <div style="min-width:0;">
          <div class="cust-name">${escapeHtml(r.customerName || r.customerEmail || r.paymentIntentId)}</div>
          <span class="badge ${confident ? 'paid' : 'awaiting'}">${confident ? 'Confident match' : 'Needs your call'}</span>
        </div>
        ${canApprove ? `<button type="button" class="secondary rc-approve" data-i="${i}" data-pi="${escapeHtml(r.paymentIntentId)}" data-link="${escapeHtml(r.linkId || '')}">Approve</button>` : ''}
      </div>
      ${paidWhat}
      <div class="cust-sub" style="margin-top:8px; font-style:italic;">${reason}</div>
      ${target}
      <div class="cust-sub rc-result" data-i="${i}" style="margin-top:6px;"></div>
    </div>`;
}

function renderReconcilePreview(data) {
  const s = data.summary;
  reconcilePanel.style.display = 'block';
  reconcilePanel.innerHTML = `
    <label class="field-label">Reconciliation</label>
    <p class="cust-sub" style="margin-bottom:12px;">
      ${s.unreconciled} succeeded Stripe payment(s) aren't reflected in the hub
      (${fmtMoney(s.willMarkPaidCents)} of it confidently matched).
      Approve each one individually — nothing changes until you do.
    </p>
    ${data.rows.map((r, i) => reconcileRowHtml(r, i)).join('')}
    <div class="panel-actions">
      <button type="button" class="secondary" id="reconcile-dismiss">Close</button>
    </div>`;

  reconcilePanel.querySelectorAll('.rc-approve').forEach((btn) => {
    btn.addEventListener('click', () => approveOne(btn));
  });
  document.getElementById('reconcile-dismiss').addEventListener('click', () => {
    reconcilePanel.style.display = 'none';
    loadAndRender();
  });
}

// One payment at a time. A hand-picked link is sent explicitly so the server
// can re-check the amount before trusting it.
async function approveOne(btn) {
  const i = btn.getAttribute('data-i');
  const paymentIntentId = btn.getAttribute('data-pi');
  let linkId = btn.getAttribute('data-link');
  const chosen = reconcilePanel.querySelector(`input[name="rc-${i}"]:checked`);
  if (chosen) linkId = chosen.value;

  const out = reconcilePanel.querySelector(`.rc-result[data-i="${i}"]`);
  if (!linkId) {
    out.textContent = 'Pick which link this payment belongs to first.';
    return;
  }
  btn.textContent = 'Approving…';
  btn.disabled = true;
  try {
    const res = await fetch('/api/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Session': getSessionToken() },
      body: JSON.stringify({ apply: [{ paymentIntentId, linkId }] }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not approve.');
    if (data.appliedCount) {
      btn.textContent = 'Approved';
      out.textContent = `Marked ${escapeHtml(data.applied[0].name || 'this link')} paid.`;
    } else {
      const why = (data.rejected && data.rejected[0] && data.rejected[0].why) || 'Nothing was changed.';
      btn.textContent = 'Approve';
      btn.disabled = false;
      out.textContent = why;
    }
  } catch (err) {
    btn.textContent = 'Approve';
    btn.disabled = false;
    out.textContent = err.message;
  }
}

if (reconcileButton) {
  reconcileButton.addEventListener('click', async () => {
    const original = reconcileButton.textContent;
    reconcileButton.textContent = 'Checking…';
    reconcileButton.disabled = true;
    try {
      const res = await fetch('/api/reconcile', { headers: { 'X-Hub-Session': getSessionToken() } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not check payments.');
      if (!data.rows.length) {
        reconcilePanel.style.display = 'block';
        reconcilePanel.innerHTML = '<label class="field-label">Reconciliation</label><p class="cust-sub">Every succeeded Stripe payment is already reflected in the hub.</p>';
      } else {
        renderReconcilePreview(data);
      }
    } catch (err) {
      await showConfirmModal({ title: 'Reconcile failed', message: err.message, confirmLabel: 'OK', danger: true });
    } finally {
      reconcileButton.textContent = original;
      reconcileButton.disabled = false;
    }
  });
}

// --- Jobs view: one card per job, not one row per request ----------------
//
// The question this screen exists to answer is "how much is left on this
// job?" — which neither Stripe nor Monday can answer alone. Stripe knows
// three charges happened; it has no idea they sum against $18,500. Monday
// knows the $18,500; it never sees the money.
//
// Nothing here is stored. Every figure is recomputed from both systems on
// each load, so this screen cannot drift out of agreement with either.
const jobsView = document.getElementById('jobs-view');
const jobsNavButton = document.getElementById('jobs-nav-button');
const jobsRefreshButton = document.getElementById('jobs-refresh-button');
const jobsBackButton = document.getElementById('back-to-invoices-from-jobs-button');
const jobsList = document.getElementById('jobs-list');
const jobsVerification = document.getElementById('jobs-verification');
const jobsUnattributed = document.getElementById('jobs-unattributed');
const jobsSearch = document.getElementById('jobs-search');

let jobsData = null;

function showJobs() {
  loginView.style.display = 'none';
  hubView.style.display = 'none';
  generateView.style.display = 'none';
  adminView.style.display = 'none';
  invoicesView.style.display = 'none';
  jobsView.style.display = 'block';
}

const MILESTONE_LABEL = {
  deposit: '20% Deposit',
  balance: '80% Balance',
  full: 'Paid in full',
  custom: 'Custom',
};

// A payment line. Always shows what was charged AND what it put toward the
// job when the 3% card surcharge made those differ — reporting one without
// the other is what made a settled-looking job still owe $1,040.
function jobPaymentHtml(p) {
  const label = MILESTONE_LABEL[p.milestone] || 'Custom';
  const money = p.baseCents === p.grossCents
    ? fmtMoney(p.baseCents)
    : `${fmtMoney(p.baseCents)} <span class="cust-sub" style="display:inline;">(${fmtMoney(p.grossCents)} charged inc. surcharge)</span>`;
  return `
    <div class="cust-sub" style="display:flex; gap:8px; align-items:baseline;">
      <span style="color:var(--brand-ink);">✓</span>
      <span style="flex:1;">${escapeHtml(label)}${p.method ? ' · ' + escapeHtml(p.method) : ''}</span>
      <span>${money}</span>
      <a href="${escapeHtml(p.stripeUrl)}" target="_blank" rel="noopener" class="chip-link">Stripe</a>
    </div>
    <div class="cust-sub" style="margin-left:18px;">paid ${p.paidAt ? fmtDateShort(p.paidAt) : 'date unknown'}</div>`;
}

function jobOpenInvoiceHtml(inv) {
  const label = MILESTONE_LABEL[inv.milestone] || 'Custom';
  const overdue = inv.dueDate && new Date(inv.dueDate) < new Date();
  return `
    <div class="cust-sub" style="display:flex; gap:8px; align-items:baseline;">
      <span style="color:var(--muted-foreground);">⧗</span>
      <span style="flex:1;">${escapeHtml(label)} — invoice ${inv.number ? escapeHtml(inv.number) : ''} ${overdue ? '<span class="badge overdue">Past due</span>' : '<span class="badge awaiting">Awaiting</span>'}</span>
      <span>${fmtMoney(inv.amountCents)}</span>
      <a href="${escapeHtml(inv.stripeUrl)}" target="_blank" rel="noopener" class="chip-link">Stripe</a>
    </div>`;
}

function jobCardHtml(j) {
  // The headline. A job with no Total Cost on the board genuinely cannot
  // have a balance — say so rather than printing a confident zero.
  let headline;
  if (j.needsTotalCost) {
    headline = `<span class="badge overdue">No Total Cost on the board</span>`;
  } else if (j.remainingCents === 0) {
    headline = `<span class="badge paid">Settled</span>`;
  } else if (j.remainingCents < 0) {
    headline = `<strong>${fmtMoney(Math.abs(j.remainingCents))} overpaid</strong> <span class="cust-sub" style="display:inline;">of ${fmtMoney(j.totalCostCents)}</span>`;
  } else {
    headline = `<strong>${fmtMoney(j.remainingCents)} left</strong> <span class="cust-sub" style="display:inline;">of ${fmtMoney(j.totalCostCents)}</span>`;
  }

  const lines = [
    ...j.payments.map(jobPaymentHtml),
    ...j.openInvoices.map(jobOpenInvoiceHtml),
  ].join('');

  const reconciled = j.reconciledCents
    ? `<div class="cust-sub" style="display:flex; gap:8px; align-items:baseline;">
         <span style="color:var(--muted-foreground);">↺</span>
         <span style="flex:1;">Settled without a payment${j.reconciliationNotes ? ' — ' + escapeHtml(j.reconciliationNotes) : ''}</span>
         <span>${fmtMoney(j.reconciledCents)}</span>
       </div>`
    : '';

  const nothingYet = (!j.payments.length && !j.openInvoices.length && !j.reconciledCents)
    ? '<div class="cust-sub" style="font-style:italic;">Nothing has been requested or collected for this job yet.</div>'
    : '';

  return `
    <div class="selected-job-banner" style="display:block; margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom:8px;">
        <div style="min-width:0;">
          <div class="cust-name">${escapeHtml(j.name || '(unnamed job)')}</div>
          <div class="cust-sub">${escapeHtml(j.address || 'no address on the board')}</div>
          ${j.groupTitle ? `<div class="cust-sub">${escapeHtml(j.groupTitle)}</div>` : ''}
        </div>
        <div style="text-align:right; white-space:nowrap;">
          <div>${headline}</div>
          <a href="${escapeHtml(j.mondayUrl)}" target="_blank" rel="noopener" class="chip-link">Open in Monday</a>
        </div>
      </div>
      ${lines}
      ${reconciled}
      ${nothingYet}
    </div>`;
}

// Money Stripe took that no job claims. Shown loudly and near the top of
// mind rather than logged and forgotten — a silent skip here is exactly how
// Bonnie Canesso's $5,300 sat unnoticed for a week after it had cleared.
function renderUnattributed(rows) {
  if (!rows.length) {
    jobsUnattributed.innerHTML = '';
    return;
  }
  const total = rows.reduce((s, r) => s + r.grossCents, 0);
  jobsUnattributed.innerHTML = `
    <div class="create-user-card" style="margin-top:16px;">
      <label class="field-label">Money not linked to any job — ${fmtMoney(total)}</label>
      <p class="cust-sub" style="margin-bottom:12px;">
        Stripe took this money but nothing tells us which job it belongs to, so it isn't
        counted in any balance above. Each one says what to do about it.
      </p>
      ${rows.map((r) => `
        <div class="selected-job-banner" style="display:block; margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
            <div style="min-width:0;">
              <div class="cust-name">${escapeHtml(r.customerName || r.customerEmail || r.id)}</div>
              <div class="cust-sub">${escapeHtml(r.customerEmail || '')}</div>
            </div>
            <div style="text-align:right; white-space:nowrap;">
              <div><strong>${fmtMoney(r.grossCents)}</strong></div>
              <a href="${escapeHtml(r.stripeUrl)}" target="_blank" rel="noopener" class="chip-link">Open in Stripe</a>
            </div>
          </div>
          <div class="cust-sub" style="margin-top:6px;">paid ${r.paidAt ? fmtDateShort(r.paidAt) : 'date unknown'}${r.method ? ' · ' + escapeHtml(r.method) : ''}</div>
          <div class="cust-sub" style="margin-top:6px; font-style:italic;">${escapeHtml(r.why)}</div>
          <div class="cust-sub"><strong>What to do:</strong> ${escapeHtml(r.fix)}</div>
        </div>`).join('')}
    </div>`;
}

function renderJobs() {
  if (!jobsData) return;
  const v = jobsData.verification;

  // The honesty check, stated plainly. If the books don't balance, say so
  // before showing a single figure — every number below would be suspect.
  if (v.scopedToUser) {
    jobsVerification.innerHTML = `<div class="subtitle">Showing the jobs you're attached to on the Monday board.</div>`;
  } else if (v.balances) {
    jobsVerification.innerHTML = `
      <div class="subtitle">
        Every dollar Stripe has taken is accounted for: ${fmtMoney(v.stripeSucceededGrossCents)} collected,
        ${fmtMoney(v.attributedGrossCents)} linked to a job${v.unattributedGrossCents ? `, ${fmtMoney(v.unattributedGrossCents)} not yet linked (listed below)` : ''}.
      </div>`;
  } else {
    jobsVerification.innerHTML = `
      <div class="error-message" style="display:block;">
        These figures don't balance — Stripe reports ${fmtMoney(v.stripeSucceededGrossCents)} collected
        but only ${fmtMoney(v.accountedForCents)} can be accounted for. Don't rely on the balances below
        until this is looked at.
      </div>`;
  }

  const q = (jobsSearch.value || '').trim().toLowerCase();
  let rows = jobsData.jobs;
  if (q) {
    rows = rows.filter((j) =>
      (j.name || '').toLowerCase().includes(q) ||
      (j.address || '').toLowerCase().includes(q) ||
      (j.email || '').toLowerCase().includes(q));
  }

  // Jobs with money outstanding first, largest first — that's the working
  // order. Settled ones sink; jobs with no Total Cost float to the top of
  // the unsettled pile because they're blocking.
  rows = rows.slice().sort((a, b) => {
    const ra = a.needsTotalCost ? Infinity : (a.remainingCents || 0);
    const rb = b.needsTotalCost ? Infinity : (b.remainingCents || 0);
    return rb - ra;
  });

  jobsList.innerHTML = rows.length
    ? rows.map(jobCardHtml).join('')
    : '<div class="cust-sub" style="padding:12px 0;">No jobs match that search.</div>';

  renderUnattributed(jobsData.unattributed || []);
}

async function loadJobs() {
  jobsList.innerHTML = '<div class="cust-sub" style="padding:12px 0;">Working out where every job stands…</div>';
  jobsVerification.innerHTML = '';
  jobsUnattributed.innerHTML = '';
  try {
    const res = await fetch('/api/jobs', { headers: { 'X-Hub-Session': getSessionToken() } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load jobs.');
    jobsData = data;
    renderJobs();
  } catch (err) {
    jobsList.innerHTML = '';
    jobsVerification.innerHTML = `<div class="error-message" style="display:block;">${escapeHtml(err.message)}</div>`;
  }
}

if (jobsNavButton) {
  jobsNavButton.addEventListener('click', () => { showJobs(); loadJobs(); });
}
if (jobsRefreshButton) {
  jobsRefreshButton.addEventListener('click', () => loadJobs());
}
if (jobsBackButton) {
  jobsBackButton.addEventListener('click', () => { showInvoices(); });
}
if (jobsSearch) {
  jobsSearch.addEventListener('input', () => renderJobs());
}

// --- Backfill: link older money to its job ------------------------------
//
// Everything paid before 4 Aug 2026 has no job label on it, so a job's
// history can't be totalled without guessing. This screen does the working
// out, SHOWS it, and only writes what you approve. Nothing here moves
// money — it only writes a label saying which job a payment was for.
const backfillButton = document.getElementById('backfill-button');
const backfillPanel = document.getElementById('backfill-panel');

// The match reason in plain words. Anyone approving these should be able to
// tell a certainty from a guess without knowing how the matcher works.
function backfillReason(r) {
  if (r.outcome !== 'will_tag') return r.why || 'Could not work this one out.';
  switch (r.matchedBy) {
    case 'link_record':
      return 'This payment came from a link that already recorded its job — no guessing involved.';
    case 'email_and_address':
      return 'The email address and the job address both point to this same job.';
    case 'email':
      return 'This email address belongs to exactly one job on the board.';
    case 'address':
      return 'This address belongs to exactly one job on the board.';
    case 'name_address':
      return 'The customer name and address together match exactly one job.';
    default:
      return 'Matched to exactly one job on the board.';
  }
}

function backfillRowHtml(r, i) {
  const confident = r.outcome === 'will_tag';
  const what = r.kind === 'invoice'
    ? `Invoice ${r.number ? escapeHtml(r.number) : ''}`.trim()
    : 'Payment link';

  // Gross vs base again: a card payment of $7,992.80 only pays off $7,760.
  // Showing one number without the other is what caused two of this week's
  // confusions, so show both whenever the surcharge made them differ.
  const gross = r.amountCents;
  const base = (r.baseAmountCents != null) ? r.baseAmountCents : r.amountCents;
  const amt = (base === gross)
    ? fmtMoney(gross)
    : `${fmtMoney(gross)} charged · ${fmtMoney(base)} toward the job`;

  const when = r.createdAt ? fmtDateShort(r.createdAt) : '';
  const milestoneLabel = r.milestone === 'deposit' ? '20% Deposit'
    : r.milestone === 'balance' ? '80% Balance'
    : r.milestone === 'full' ? 'Paid in full'
    : 'Custom';

  let target = '';
  if (confident) {
    target = `
      <div class="cust-sub" style="margin-top:8px;"><strong>Would be labelled as:</strong></div>
      <div class="cust-sub">${escapeHtml(r.mondayJobName || '(unnamed job)')} · ${escapeHtml(milestoneLabel)}</div>`;
  } else if (r.candidates && r.candidates.length) {
    // Deliberately NOT selectable. These are the cases where the board itself
    // is ambiguous — three jobs sharing an email, say — and picking one here
    // would just move the guess from the computer to you. Fix the board.
    const list = r.candidates.map((c) => `
      <div class="cust-sub">• ${escapeHtml(c.name || '(no name)')}${c.address ? ' — ' + escapeHtml(c.address) : ''}</div>`).join('');
    target = `
      <div class="cust-sub" style="margin-top:8px;"><strong>Jobs it could be:</strong></div>
      ${list}
      <div class="cust-sub" style="margin-top:6px;">Give these jobs distinct addresses or emails on the board, then run this again.</div>`;
  }

  return `
    <div class="selected-job-banner" style="display:block; margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
        <div style="min-width:0;">
          <div class="cust-name">${escapeHtml(r.customerName || r.customerEmail || r.id)}</div>
          <span class="badge ${confident ? 'paid' : 'awaiting'}">${confident ? 'Ready to label' : 'Needs your help'}</span>
        </div>
        ${confident ? `<button type="button" class="secondary bf-apply" data-i="${i}" data-id="${escapeHtml(r.id)}">Label it</button>` : ''}
      </div>
      <div class="cust-sub"><strong>${escapeHtml(what)}:</strong> ${amt}${when ? ' · ' + when : ''}</div>
      ${r.customerEmail ? `<div class="cust-sub">${escapeHtml(r.customerEmail)}</div>` : ''}
      ${r.address ? `<div class="cust-sub">${escapeHtml(r.address)}</div>` : ''}
      <div class="cust-sub" style="margin-top:8px; font-style:italic;">${escapeHtml(backfillReason(r))}</div>
      ${target}
      <div class="cust-sub bf-result" data-i="${i}" style="margin-top:6px;"></div>
    </div>`;
}

function renderBackfillPreview(data) {
  const s = data.summary;
  // Confident ones first — that's the pile you can clear in one click, and
  // burying it under the problem cases makes the screen feel worse than it is.
  const ordered = data.rows.slice().sort((a, b) => {
    if (a.outcome === b.outcome) return 0;
    return a.outcome === 'will_tag' ? -1 : 1;
  });

  backfillPanel.style.display = 'block';
  backfillPanel.innerHTML = `
    <label class="field-label">Link history to jobs</label>
    <p class="cust-sub" style="margin-bottom:12px;">
      ${s.total} item(s) carry no job label — ${s.invoices} invoice(s) and ${s.payments} payment(s).
      ${s.willTag} can be worked out for certain${s.needsAPerson ? `, ${s.needsAPerson} need a person to settle` : ''}.
      Nothing changes until you approve it, and this only writes a label — no amounts or statuses are touched.
    </p>
    ${s.willTag ? `
      <div class="panel-actions" style="margin-bottom:12px;">
        <button type="button" class="primary" id="backfill-apply-all">Label all ${s.willTag} certain ones</button>
      </div>` : ''}
    ${ordered.map((r, i) => backfillRowHtml(r, i)).join('')}
    <div class="panel-actions">
      <button type="button" class="secondary" id="backfill-dismiss">Close</button>
    </div>`;

  backfillPanel.querySelectorAll('.bf-apply').forEach((btn) => {
    btn.addEventListener('click', () => backfillApplyOne(btn));
  });
  const applyAll = document.getElementById('backfill-apply-all');
  if (applyAll) applyAll.addEventListener('click', () => backfillApplyAll(applyAll));
  document.getElementById('backfill-dismiss').addEventListener('click', () => {
    backfillPanel.style.display = 'none';
  });
}

// One row at a time. The server re-derives the match from scratch and only
// acts on the id passed in, so a stale screen can't cause a wrong write.
async function backfillApplyOne(btn) {
  const i = btn.getAttribute('data-i');
  const id = btn.getAttribute('data-id');
  const out = backfillPanel.querySelector(`.bf-result[data-i="${i}"]`);
  btn.textContent = 'Labelling…';
  btn.disabled = true;
  try {
    const res = await fetch('/api/backfill-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Session': getSessionToken() },
      body: JSON.stringify({ only: [id] }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not label this one.');
    if (data.taggedCount) {
      btn.textContent = 'Labelled';
      out.textContent = 'Linked to its job in Stripe.';
    } else {
      const why = (data.failed && data.failed[0] && data.failed[0].error) || 'Nothing was changed.';
      btn.textContent = 'Label it';
      btn.disabled = false;
      out.textContent = why;
    }
  } catch (err) {
    btn.textContent = 'Label it';
    btn.disabled = false;
    out.textContent = err.message;
  }
}

// Everything the matcher was certain about, in one go. The ambiguous rows are
// untouched by this — the server only ever acts on its own confident set.
async function backfillApplyAll(btn) {
  const original = btn.textContent;
  btn.textContent = 'Labelling…';
  btn.disabled = true;
  try {
    const res = await fetch('/api/backfill-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Session': getSessionToken() },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not label these.');
    await showConfirmModal({
      title: 'Done',
      message: `Linked ${data.taggedCount} item(s) to their jobs.` +
        (data.failedCount ? ` ${data.failedCount} could not be written and were left alone.` : ''),
      confirmLabel: 'OK',
    });
    if (backfillButton) backfillButton.click(); // re-run the dry run to show what's left
  } catch (err) {
    btn.textContent = original;
    btn.disabled = false;
    await showConfirmModal({ title: 'Could not label these', message: err.message, confirmLabel: 'OK', danger: true });
  }
}

if (backfillButton) {
  backfillButton.addEventListener('click', async () => {
    const original = 'Link history to jobs';
    backfillButton.textContent = 'Working it out…';
    backfillButton.disabled = true;
    try {
      const res = await fetch('/api/backfill-tags', { headers: { 'X-Hub-Session': getSessionToken() } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not check the history.');
      if (!data.rows.length) {
        backfillPanel.style.display = 'block';
        backfillPanel.innerHTML = '<label class="field-label">Link history to jobs</label><p class="cust-sub">Every invoice and payment already knows which job it belongs to.</p>';
      } else {
        renderBackfillPreview(data);
      }
    } catch (err) {
      await showConfirmModal({ title: 'Could not check the history', message: err.message, confirmLabel: 'OK', danger: true });
    } finally {
      backfillButton.textContent = original;
      backfillButton.disabled = false;
    }
  });
}

// --- Light / dark theme toggle -------------------------------------------
//
// sunatto.css reads a data-theme attribute on <html>. With nothing set it
// follows the OS via prefers-color-scheme; setting it to "light" or "dark"
// overrides that. The choice is stored per-device in localStorage, and a
// tiny inline script in hub.html's <head> re-applies it before first paint
// so there's no flash of the wrong theme on load.
//
// Deliberately only two states rather than light/dark/system: a three-way
// control needs a label to be understandable, and this is a single icon
// button tucked in beside Refresh. Someone who has never touched it still
// follows their OS — only pressing it opts them out.

const LS_THEME_KEY = 'sunatto-hub-theme';
const themeToggleButton = document.getElementById('theme-toggle-button');

const THEME_ICON_SUN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>';
const THEME_ICON_MOON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"></path></svg>';

function systemPrefersDark() {
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function activeTheme() {
  const stored = localStorage.getItem(LS_THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return systemPrefersDark() ? 'dark' : 'light';
}

// The icon shows what you'd get by pressing it, not what you're currently in.
function renderThemeToggle() {
  if (!themeToggleButton) return;
  const dark = activeTheme() === 'dark';
  themeToggleButton.innerHTML = dark ? THEME_ICON_SUN : THEME_ICON_MOON;
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
  themeToggleButton.title = label;
  themeToggleButton.setAttribute('aria-label', label);
}

if (themeToggleButton) {
  themeToggleButton.addEventListener('click', () => {
    const next = activeTheme() === 'dark' ? 'light' : 'dark';
    localStorage.setItem(LS_THEME_KEY, next);
    document.documentElement.setAttribute('data-theme', next);
    renderThemeToggle();
  });
}

// Keep tracking the OS for anyone who has never pressed the button.
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!localStorage.getItem(LS_THEME_KEY)) renderThemeToggle();
  });
}

renderThemeToggle();

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
  showInvoices();
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

voidedNavButton.addEventListener('click', () => {
  showHub();
  fetchVoidedInvoices();
});

invoicesSearchInput.addEventListener('input', renderInvoicesTable);

let lastInvoicesIsAdmin = false;

function updateInvoicesCountNote() {
  const total = allInvoices.length + allLinks.length;
  invoicesCountNote.textContent = lastInvoicesIsAdmin
    ? `Showing all ${total} payment link${total === 1 ? '' : 's'} & invoice${total === 1 ? '' : 's'}.`
    : `Showing ${total} payment link${total === 1 ? '' : 's'} & invoice${total === 1 ? '' : 's'} for jobs you're attached to.`;
}

async function fetchInvoices() {
  invoicesError.textContent = '';
  invoicesTableWrap.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const res = await fetch('/api/invoices', { headers: { 'X-Hub-Session': getSessionToken() } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load invoices.');
    allInvoices = data.invoices || [];
    invoicesLoaded = true;
    lastInvoicesIsAdmin = !!data.isAdmin;
    renderInvoicesTable();
  } catch (err) {
    invoicesTableWrap.innerHTML = '';
    invoicesError.textContent = err.message;
  }
}

// Combined summary across BOTH payment links and invoices — 6 pills: top
// row is counts (Unpaid / Processing / Paid), bottom row is the $ total
// for that exact same set, so each column reads top-to-bottom as "how
// many, how much." Drafts aren't tallied here since payment links have no
// draft state — a draft invoice still shows fine in the table's Status
// column, it just isn't one of these 6 pills. Only invoices can ever be
// Processing (an ACH payment mid-flight) or Draft — payment links are
// always simply paid or unpaid.
function renderInvoicesSummary(invoices, links) {
  const processing = invoices.filter((i) => i.paymentProcessing);
  // "Unpaid" excludes invoices already processing a payment — otherwise
  // the same invoice would silently double-count across both columns,
  // and staff would still read it as "nothing's happened yet."
  const openInvoices = invoices.filter((i) => i.status === 'open' && !i.paymentProcessing);
  const paidInvoices = invoices.filter((i) => i.status === 'paid');
  const unpaidLinks = links.filter((l) => !l.paid);
  const paidLinks = links.filter((l) => l.paid);

  const unpaidCount = openInvoices.length + unpaidLinks.length;
  const processingCount = processing.length;
  const paidCount = paidInvoices.length + paidLinks.length;

  const unpaidCents = openInvoices.reduce((sum, i) => sum + (i.amountDueCents || 0), 0)
    + unpaidLinks.reduce((sum, l) => sum + (l.amountCents || 0), 0);
  const processingCents = processing.reduce((sum, i) => sum + (i.amountDueCents || 0), 0);
  const paidCents = paidInvoices.reduce((sum, i) => sum + (i.amountPaidCents || i.totalCents || 0), 0)
    + paidLinks.reduce((sum, l) => sum + (l.amountCents || 0), 0);

  const icon = (path) => `<span class="pill-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span>`;
  const iconClock = icon('<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path>');
  const iconProcessing = icon('<path d="M21 12a9 9 0 1 1-3-6.7"></path><path d="M21 3v6h-6"></path>');
  const iconCheck = icon('<circle cx="12" cy="12" r="9"></circle><path d="m8.5 12.5 2.5 2.5 5-5"></path>');
  const iconMoney = icon('<rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="3"></circle>');

  invoicesSummaryStrip.innerHTML = `
    <div class="summary-pill icon-unpaid">${iconClock}<div><strong>${unpaidCount}</strong>Outstanding</div></div>
    <div class="summary-pill icon-processing">${iconProcessing}<div><strong>${processingCount}</strong>Processing</div></div>
    <div class="summary-pill icon-paid">${iconCheck}<div><strong>${paidCount}</strong>Paid</div></div>
    <div class="summary-pill money icon-unpaid">${iconMoney}<div><strong>${fmtMoney(unpaidCents)}</strong>Outstanding</div></div>
    <div class="summary-pill money icon-processing">${iconMoney}<div><strong>${fmtMoney(processingCents)}</strong>Clearing</div></div>
    <div class="summary-pill money icon-paid">${iconMoney}<div><strong>${fmtMoney(paidCents)}</strong>Collected</div></div>
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

// --- Filter tabs (Unpaid / Sent / Pending / Paid) ----------------------
//
// The combined list used to show every payment link and invoice at once
// regardless of status, which got long fast. Every entry now falls into
// exactly one of five lifecycle stages. The old scheme had a bucket called
// "unpaid" that actually meant "not sent yet", while the summary tile above
// used "unpaid" to mean "not paid" — two different meanings for one word,
// which made it genuinely hard to tell what had gone out. These names each
// mean exactly one thing:
//
//   "not_sent"   — nothing has reached the customer: a generated payment
//                  link that was never emailed, or a draft invoice.
//   "awaiting"   — sent, not yet past its due date. Nothing to do but wait.
//   "overdue"    — sent and past due. This is the chase list.
//   "processing" — the customer has paid and the money is clearing (e.g.
//                  ACH, ~4-5 business days). Do NOT chase these.
//   "paid"       — done.
//
// Invoices carry a real due date from Stripe. Payment links don't have one
// at all, so "overdue" for a link is our own chase threshold rather than a
// contractual date — hence the named constant below rather than a magic number.
const LINK_OVERDUE_DAYS = 3;

const STAGE_META = {
  not_sent:   { label: 'Not Sent',   cls: 'notsent' },
  awaiting:   { label: 'Awaiting',   cls: 'awaiting' },
  overdue:    { label: 'Overdue',    cls: 'overdue' },
  processing: { label: 'Processing', cls: 'processing' },
  paid:       { label: 'Paid',       cls: 'paid' },
};

function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function entryStage(entry) {
  if (entry.source === 'link') {
    const link = entry.item;
    if (link.paid) return 'paid';
    if (!link.emailSent) return 'not_sent';
    const age = daysSince(link.lastSentAt);
    return age !== null && age > LINK_OVERDUE_DAYS ? 'overdue' : 'awaiting';
  }
  const invoice = entry.item;
  if (invoice.paymentProcessing) return 'processing';
  if (invoice.status === 'paid') return 'paid';
  if (invoice.status === 'draft') return 'not_sent';
  if (invoice.dueDate && new Date(invoice.dueDate).getTime() < Date.now()) return 'overdue';
  return 'awaiting';
}

// Invoices carry a real Stripe due date. Links don't, so their effective
// due date is derived: emailed date + LINK_OVERDUE_DAYS. Both are shown as
// a concrete date so nobody has to work out "is this past due?" in their head.
function entryDueDate(entry) {
  if (entry.source === 'invoice') return entry.item.dueDate || null;
  if (!entry.item.emailSent || !entry.item.lastSentAt) return null;
  return new Date(new Date(entry.item.lastSentAt).getTime() + LINK_OVERDUE_DAYS * 86400000).toISOString();
}

function stageBadgeHtml(entry) {
  const stage = entryStage(entry);
  const meta = STAGE_META[stage];
  const due = entryDueDate(entry);
  let extra = '';
  if (stage === 'overdue') {
    const days = daysSince(due);
    const dayText = days !== null && days > 0 ? `${days} day${days === 1 ? '' : 's'} past due` : 'Past due';
    extra = `<div class="cust-sub">${dayText}${due ? ' · due ' + fmtDateShort(due) : ''}</div>`;
  } else if (stage === 'awaiting' && due) {
    extra = `<div class="cust-sub">Due ${fmtDateShort(due)}</div>`;
  }
  return `<span class="badge ${meta.cls}">${meta.label}</span>${extra}`;
}

// Shows when the customer was actually contacted, not when the record was
// created — those differ, and "when did we last chase them" is the thing
// staff need. Resend counts are only shown for invoices, where the count is
// tracked deliberately (see recordInvoiceSend in server.js). Payment links
// increment their counter on generation as well as on send, so their count
// would overstate how many emails actually went out; better to show nothing
// than a number that isn't true.
function sentCellHtml(entry) {
  const isLink = entry.source === 'link';
  const sentAt = isLink
    ? (entry.item.emailSent ? entry.item.lastSentAt : null)
    : entry.item.sentAt;
  if (!sentAt) return '<span class="cust-sub">Not sent</span>';
  const count = isLink ? null : entry.item.sentCount;
  const times = count && count > 1 ? `<div class="cust-sub">sent ${count}\u00d7</div>` : '';
  return `<div class="tabular">${fmtDateShort(sentAt)}</div>${times}`;
}

// Kept as a thin alias so any older callers keep working.
function entryTabBucket(entry) { return entryStage(entry); }

function computeInvoicesTabCounts() {
  const counts = { not_sent: 0, awaiting: 0, overdue: 0, processing: 0, paid: 0 };
  const all = [
    ...allLinks.map((l) => ({ source: 'link', item: l })),
    ...allInvoices.map((i) => ({ source: 'invoice', item: i })),
  ];
  all.forEach((entry) => { counts[entryTabBucket(entry)]++; });
  return counts;
}

function renderInvoicesTabs() {
  if (!invoicesTabsEl) return;
  const counts = computeInvoicesTabCounts();
  invoicesTabsEl.querySelectorAll('.view-tab').forEach((btn) => {
    const tab = btn.getAttribute('data-tab');
    btn.classList.toggle('active', tab === currentInvoicesTab);
    let countEl = btn.querySelector('.tab-count');
    if (!countEl) {
      countEl = document.createElement('span');
      countEl.className = 'tab-count';
      btn.appendChild(countEl);
    }
    countEl.textContent = counts[tab] || 0;
  });
}

invoicesTabsEl && invoicesTabsEl.querySelectorAll('.view-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentInvoicesTab = btn.getAttribute('data-tab');
    renderInvoicesTabs();
    renderCombinedTable(invoicesTableWrap, invoicesSearchInput.value.trim());
  });
});

function renderCombinedRow(entry) {
  if (entry.source === 'link') {
    const link = entry.item;
    const typeLabel = link.type === 'deposit' ? '20% Deposit' : link.type === 'balance' ? '80% Balance' : 'Custom Amount';
    const statusBadge = link.paid
      ? '<span class="badge paid">Paid</span>'
      : link.emailSent
      ? '<span class="badge open">Sent</span>'
      : '<span class="badge unpaid">Unpaid</span>';
    const canResend = !!link.customerEmail;
    const linkMondayStatus = link.mondayStatus
      ? `<span class="badge monday-status">${escapeHtml(link.mondayStatus)}</span>`
      : '—';
    return `
      <tr data-id="${link.id}" data-source="link">
        <td>
          <div class="cust-name">${escapeHtml(link.customerName || '(no name)')}</div>
          <div class="cust-sub">${escapeHtml(link.jobAddress || '')}</div>
          <div class="cust-sub">${escapeHtml(link.customerEmail || '')}${link.customerPhone ? ' · ' + escapeHtml(link.customerPhone) : ''}</div>
        </td>
        <td>
          <span class="source-tag">Payment Link</span>
          <div style="margin-top:5px;"><span class="badge ${link.type}">${typeLabel}</span></div>
        </td>
        <td class="tabular">${fmtMoney(link.amountCents)}</td>
        <td>${stageBadgeHtml(entry)}</td>
        <td>${sentCellHtml(entry)}</td>
        <td>${linkMondayStatus}</td>
        <td>
          <div class="row-actions">
            <button type="button" class="secondary copy-btn" data-url="${escapeHtml(link.checkoutUrl)}">Copy Link</button>
            <button type="button" class="secondary resend-btn" data-id="${link.id}" ${canResend ? '' : 'disabled title="No email on file"'}>Resend</button>
            <button type="button" class="secondary switch-btn" data-id="${link.id}" data-source="link" data-name="${escapeHtml(link.customerName || 'this customer')}" ${link.paid ? 'disabled' : ''} title="Customer would rather pay by bank — void this link and send a proper invoice instead">Switch to Invoice</button>
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
    ? `<span class="badge ${invoice.type}">${invoice.type === 'deposit' ? '20% Deposit' : invoice.type === 'balance' ? '80% Balance' : 'Custom Invoice'}</span>`
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
  const invoiceMondayStatus = invoice.mondayStatus
    ? `<span class="badge monday-status">${escapeHtml(invoice.mondayStatus)}</span>`
    : '—';

  // Delete (permanent, Stripe never saw it) only for still-draft invoices.
  // Void (permanent, but Stripe keeps the record — see the Voided tab)
  // only for sent/unpaid invoices, and never while a payment is mid-flight
  // processing, since that payment could still land against it.
  const showDelete = invoice.status === 'draft';
  const showVoid = invoice.status === 'open' && !invoice.paymentProcessing;
  // Mark Paid covers both: a draft that's already been paid another way
  // before ever being sent, or a sent invoice paid outside Stripe (check,
  // cash, another processor). Never while a real Stripe payment is
  // already processing — that should be left to land on its own.
  const showMarkPaid = (invoice.status === 'draft' || invoice.status === 'open') && !invoice.paymentProcessing;
  // Switching to a payment link means voiding this invoice, so it's offered
  // on the same terms as Void: never once money is already moving.
  const showSwitch = (invoice.status === 'draft' || invoice.status === 'open') && !invoice.paymentProcessing;
  const manualPaidNote = invoice.manualPaidMethodLabel
    ? `<div class="cust-sub">Paid via ${escapeHtml(invoice.manualPaidMethodLabel)}${invoice.manualPaidNote ? ' — ' + escapeHtml(invoice.manualPaidNote) : ''}</div>`
    : '';

  return `
    <tr data-id="${invoice.id}" data-source="invoice">
      <td>
        <div class="cust-name">${escapeHtml(invoice.customerName || invoice.customerEmail || '(no name)')}</div>
        <div class="cust-sub">${escapeHtml(invoice.jobAddress || '')}</div>
        <div class="cust-sub">${escapeHtml(invoice.customerEmail || '')}${invoice.number ? ' · ' + escapeHtml(invoice.number) : ''}</div>
        ${manualPaidNote}
      </td>
      <td>
        <span class="source-tag">Invoice</span>
        <div style="margin-top:5px;">${typeBadge}</div>
      </td>
      <td class="tabular">${fmtMoney(invoice.totalCents)}</td>
      <td>${stageBadgeHtml(entry)}</td>
      <td>${sentCellHtml(entry)}</td>
      <td>${invoiceMondayStatus}</td>
      <td>
        <div class="row-actions invoice-actions">
          ${hostedUrl ? `<a class="icon-link-btn" href="${escapeHtml(hostedUrl)}" target="_blank" rel="noopener" title="View invoice"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></a>` : ''}
          ${editUrl ? `<a class="icon-link-btn" href="${escapeHtml(editUrl)}" target="_blank" rel="noopener" title="Edit in Stripe"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>` : ''}
          <button type="button" class="secondary send-invoice-btn" data-id="${invoice.id}" ${canSend ? '' : 'disabled'} ${sendTitle ? `title="${escapeHtml(sendTitle)}"` : ''}>${sendLabel}</button>
          ${showSwitch ? `<button type="button" class="secondary switch-btn" data-id="${invoice.id}" data-source="invoice" data-name="${escapeHtml(invoice.customerName || 'this customer')}" title="Customer wants to pay by card — void this invoice and issue a payment link (invoices are bank-only and carry no surcharge)">Switch to Card</button>` : ''}
          ${showMarkPaid ? `<button type="button" class="secondary mark-paid-invoice-btn" data-id="${invoice.id}" data-name="${escapeHtml(invoice.customerName || 'this invoice')}" title="Manually mark this invoice paid — check, cash, or another payment processor">Mark Paid</button>` : ''}
          ${showDelete ? `<button type="button" class="secondary delete-invoice-btn" data-id="${invoice.id}" title="Permanently delete this draft — in the hub and in Stripe">Delete</button>` : ''}
          ${showVoid ? `<button type="button" class="secondary void-invoice-btn" data-id="${invoice.id}" title="Void this invoice in Stripe and the hub (e.g. customer is paying another way)">Void</button>` : ''}
        </div>
      </td>
    </tr>
  `;
}

const INVOICES_TAB_LABELS = { unpaid: 'Unpaid', sent: 'Sent', pending: 'Pending', paid: 'Paid' };

function renderCombinedTable(container, query) {
  const results = combinedSearchResults(query).filter((entry) => entryTabBucket(entry) === currentInvoicesTab);
  const tabLabel = INVOICES_TAB_LABELS[currentInvoicesTab] || '';

  if (results.length === 0) {
    container.innerHTML = query
      ? `<div class="empty-state">No payment links or invoices in "${escapeHtml(tabLabel)}" match "${escapeHtml(query)}".</div>`
      : `<div class="empty-state">Nothing in "${escapeHtml(tabLabel)}" right now.</div>`;
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Customer</th>
          <th>What</th>
          <th>Amount</th>
          <th>Stage</th>
          <th>Sent</th>
          <th>Monday Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${results.map(renderCombinedRow).join('')}</tbody>
    </table>
  `;

  container.querySelectorAll('.copy-btn').forEach((btn) => btn.addEventListener('click', () => copyLink(btn)));
  container.querySelectorAll('.resend-btn').forEach((btn) => btn.addEventListener('click', () => resendLink(btn)));
  container.querySelectorAll('.switch-btn').forEach((btn) => btn.addEventListener('click', () => switchPaymentMethod(btn)));
  container.querySelectorAll('.void-btn').forEach((btn) => btn.addEventListener('click', () => voidLink(btn)));
  container.querySelectorAll('.send-invoice-btn').forEach((btn) => btn.addEventListener('click', () => sendInvoiceFromHub(btn)));
  container.querySelectorAll('.delete-invoice-btn').forEach((btn) => btn.addEventListener('click', () => deleteInvoiceDraft(btn)));
  container.querySelectorAll('.void-invoice-btn').forEach((btn) => btn.addEventListener('click', () => voidInvoiceSent(btn)));
  container.querySelectorAll('.mark-paid-invoice-btn').forEach((btn) => btn.addEventListener('click', () => markInvoicePaid(btn)));
}

// The merged main page: payment links and invoices always shown together
// (Source column visible), not just when searching — searching just
// narrows the same combined table. See combinedSearchResults/
// renderCombinedRow/renderCombinedTable above for the shared rendering.
function renderInvoicesTable() {
  const query = invoicesSearchInput.value.trim();
  renderInvoicesSummary(allInvoices, allLinks);
  updateInvoicesCountNote();
  renderInvoicesTabs();
  renderCombinedTable(invoicesTableWrap, query);
}

// Permanently deletes a still-draft invoice — both from this view AND the
// underlying Stripe object (the server refuses anything that isn't still
// "draft", so this can never touch an invoice a customer may have already
// seen). For cleaning up mistaken/duplicate drafts before they're ever sent.
async function deleteInvoiceDraft(btn) {
  const id = btn.getAttribute('data-id');
  const invoice = allInvoices.find((i) => i.id === id);
  if (!invoice) return;

  const label = invoice.customerName || invoice.customerEmail || 'this invoice';
  const confirmed = await showConfirmModal({
    title: 'Delete this draft invoice?',
    message: `Permanently delete the draft invoice for ${label} (${fmtMoney(invoice.totalCents)})? This deletes it in Stripe too — it was never sent, so nobody has seen it. This can't be undone.`,
    confirmLabel: 'Delete draft',
    danger: true,
  });
  if (!confirmed) return;

  invoicesError.textContent = '';
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Deleting…';

  try {
    const res = await fetch(`/api/invoices/${id}`, {
      method: 'DELETE',
      headers: { 'X-Hub-Session': getSessionToken() },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not delete invoice.');
    allInvoices = allInvoices.filter((i) => i.id !== id);
    renderInvoicesTable();
  } catch (err) {
    invoicesError.textContent = err.message;
    btn.disabled = false;
    btn.textContent = original;
  }
}

// Voids a SENT (open, unpaid) invoice — e.g. the customer said they'd pay
// the invoice, then decided to pay by credit card instead (invoices
// themselves have no card option here). Unlike the draft delete above,
// this is permanent in Stripe too, but the record is kept (marked
// "void") rather than erased — see the Voided tab, which is exactly why
// a reason is captured here first.
async function voidInvoiceSent(btn) {
  const id = btn.getAttribute('data-id');
  const invoice = allInvoices.find((i) => i.id === id);
  if (!invoice) return;

  const label = invoice.customerName || invoice.customerEmail || 'this customer';
  const reason = await showVoidReasonModal({
    title: 'Void this invoice?',
    message: `Void the invoice for ${label} (${fmtMoney(invoice.totalCents)})? This is permanent in Stripe — use this when they're paying another way (e.g. credit card) instead of this invoice. It'll move to the Voided tab so there's still a record of it.`,
  });
  if (reason === null) return; // cancelled

  invoicesError.textContent = '';
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Voiding…';

  try {
    const res = await fetch(`/api/invoices/${id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Session': getSessionToken() },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not void invoice.');
    allInvoices = allInvoices.filter((i) => i.id !== id);
    renderInvoicesTable();
  } catch (err) {
    invoicesError.textContent = err.message;
    btn.disabled = false;
    btn.textContent = original;
  }
}

// Manually marks an invoice paid for money collected OUTSIDE Stripe —
// check, cash, or another payment processor. Uses Stripe's own
// paid_out_of_band mechanism server-side (see server.js), so it lands in
// the Paid tab exactly like a real Stripe-collected payment, with the
// method/note kept alongside it for the record.
async function markInvoicePaid(btn) {
  const id = btn.getAttribute('data-id');
  const invoice = allInvoices.find((i) => i.id === id);
  if (!invoice) return;

  const label = invoice.customerName || invoice.customerEmail || 'this customer';
  const result = await showMarkPaidModal({
    title: 'Mark this invoice paid?',
    message: `Mark the invoice for ${label} (${fmtMoney(invoice.totalCents)}) as paid? Use this when it was collected outside Stripe — check, cash, or another payment processor. This updates Stripe and moves it to the Paid tab.`,
  });
  if (result === null) return; // cancelled

  invoicesError.textContent = '';
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Marking paid…';

  try {
    const res = await fetch(`/api/invoices/${id}/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Session': getSessionToken() },
      body: JSON.stringify(result),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not mark this invoice paid.');
    allInvoices = allInvoices.map((i) => (i.id === id ? data.invoice : i));
    renderInvoicesTable();
  } catch (err) {
    invoicesError.textContent = err.message;
    btn.disabled = false;
    btn.textContent = original;
  }
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
