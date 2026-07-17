// Payment Links Hub. Lists the payment links intake.js has recorded via
// POST /api/links, filtered down to just the jobs the logged-in person is
// attached to on the "Sunatto Pipeline 2026" Monday board (Sales Rep,
// Office, or Manager column — see server.js's getUserAttachedJobs). Also
// lets them resend a link's email without digging through old texts.
//
// Login is name + PIN, no email/password account system:
//   - First visit on a device: enter first/last name. If that name has
//     never been seen before, create a 4-6 digit PIN. If it has, enter
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
function enhancePinInput(input) {
  if (!input || input.dataset.enhanced) return;
  input.dataset.enhanced = 'true';

  const max = parseInt(input.getAttribute('maxlength') || '6', 10);
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

  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/[^0-9]/g, '').slice(-1);
      box.classList.toggle('filled', !!box.value);
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
      writeThrough();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) {
        boxes[i - 1].focus();
      }
      if (e.key === 'Enter') {
        const card = input.closest('.card');
        const btn = card && card.querySelector('button.primary');
        if (btn && !btn.disabled) btn.click();
      }
    });
    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
      boxes.forEach((b, idx) => { b.value = text[idx] || ''; b.classList.toggle('filled', !!b.value); });
      const nextEmpty = boxes.findIndex((b) => !b.value);
      boxes[nextEmpty === -1 ? boxes.length - 1 : nextEmpty].focus();
      writeThrough();
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

[
  pinLoginField,
  pinCreateField,
  pinConfirmField,
  currentPinField,
  newPinField,
  confirmNewPinField,
  newUserPinField,
  resetPinField,
].forEach(enhancePinInput);

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
  return '$' + ((cents || 0) / 100).toFixed(2);
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
  loginView.style.display = 'block';
}

function showHub() {
  loginView.style.display = 'none';
  generateView.style.display = 'none';
  adminView.style.display = 'none';
  hubView.style.display = 'block';
}

function showGenerate() {
  loginView.style.display = 'none';
  hubView.style.display = 'none';
  adminView.style.display = 'none';
  generateView.style.display = 'block';
}

function showAdmin() {
  loginView.style.display = 'none';
  hubView.style.display = 'none';
  generateView.style.display = 'none';
  adminView.style.display = 'block';
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
    pinLoginField.focus();
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
      pinLoginField.focus();
    } else {
      showStep('pin-create');
      pinCreateField.focus();
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

  if (!/^\d{4,6}$/.test(pin)) {
    loginError.textContent = 'PIN must be 4-6 digits.';
    return;
  }
  if (pin !== confirmPin) {
    loginError.textContent = 'PINs don’t match.';
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
  } finally {
    createPinButton.disabled = false;
    createPinButton.textContent = 'Create Account';
    pinCreateField.value = '';
    pinConfirmField.value = '';
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
    currentUserName.textContent = remembered ? `${remembered.firstName} ${remembered.lastName}` : '';
    jobCountNote.textContent = data.isAdmin
      ? `Showing all ${data.jobCount} job${data.jobCount === 1 ? '' : 's'} on the Monday board (admin access).`
      : data.jobCount
        ? `Showing links for the ${data.jobCount} job${data.jobCount === 1 ? '' : 's'} you're attached to on the Monday board.`
        : 'No jobs on the Monday board are attached to your name yet — once you’re added as Sales Rep, Office, or Manager on a job, its links will show up here.';

    hubError.textContent = '';
    await refreshAdminButton();
    showHub();
    renderTable();
  } catch (err) {
    if (err.message === 'unauthorized') {
      const remembered = getRememberedUser();
      if (remembered && remembered.firstName) {
        pendingName = remembered;
        pinLoginGreeting.textContent = `Welcome back, ${remembered.firstName}. Please log in again.`;
        showLogin();
        showStep('pin-login');
      } else {
        showLogin();
        showStep('name');
      }
    } else {
      showLogin();
      showStep(getRememberedUser() ? 'pin-login' : 'name');
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
  const links = allLinks.filter((l) => matchesSearch(l, query));

  renderSummary(allLinks);

  if (links.length === 0) {
    tableWrap.innerHTML = `<div class="empty-state">${
      allLinks.length === 0
        ? 'No links to show yet for your jobs. They’ll show up here as soon as a rep sends one from the intake page for a job you’re attached to.'
        : 'No links match your search.'
    }</div>`;
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
  if (!showing) currentPinField.focus();
});

cancelChangePinButton.addEventListener('click', () => {
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
  if (!/^\d{4,6}$/.test(newPin)) {
    changePinError.textContent = 'New PIN must be 4-6 digits.';
    return;
  }
  if (newPin !== confirmPin) {
    changePinError.textContent = 'New PINs don’t match.';
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
    changePinError.textContent = err.message;
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
}

cancelResetPinButton.addEventListener('click', () => {
  resetPinPanel.style.display = 'none';
  resetPinTargetUserId = null;
});

confirmResetPinButton.addEventListener('click', async () => {
  const newPin = resetPinField.value.trim();
  if (!/^\d{4,6}$/.test(newPin)) {
    resetPinError.textContent = 'New PIN must be 4-6 digits.';
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
  if (!window.confirm(`Delete the hub account for ${name}? They'll need to create a new account (with a new PIN) if they need access again.`)) {
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
  if (!/^\d{4,6}$/.test(pin)) {
    createUserError.textContent = 'PIN must be 4-6 digits.';
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

// --- boot ---

if (getSessionToken()) {
  loadAndRender();
} else {
  initLogin();
}
