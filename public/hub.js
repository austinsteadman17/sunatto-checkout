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
const searchInput = document.getElementById('search-input');
const summaryStrip = document.getElementById('summary-strip');
const hubError = document.getElementById('hub-error');
const tableWrap = document.getElementById('table-wrap');

let allLinks = [];
let pendingName = { firstName: '', lastName: '' }; // held between the name step and the pin steps

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
  loginView.style.display = 'block';
}

function showHub() {
  loginView.style.display = 'none';
  hubView.style.display = 'block';
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

async function loadAndRender() {
  try {
    const data = await fetchLinks();
    allLinks = data.links || [];

    const remembered = getRememberedUser();
    currentUserName.textContent = remembered ? `${remembered.firstName} ${remembered.lastName}` : '';
    jobCountNote.textContent = data.jobCount
      ? `Showing links for the ${data.jobCount} job${data.jobCount === 1 ? '' : 's'} you're attached to on the Monday board.`
      : 'No jobs on the Monday board are attached to your name yet — once you’re added as Sales Rep, Office, or Manager on a job, its links will show up here.';

    hubError.textContent = '';
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

  summaryStrip.innerHTML = `
    <div class="summary-pill"><strong>${links.length}</strong>Links sent</div>
    <div class="summary-pill"><strong>${paid.length}</strong>Paid</div>
    <div class="summary-pill"><strong>${unpaid.length}</strong>Unpaid</div>
    <div class="summary-pill"><strong>${fmtMoney(collected)}</strong>Collected</div>
    <div class="summary-pill"><strong>${fmtMoney(outstanding)}</strong>Outstanding</div>
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

// --- boot ---

if (getSessionToken()) {
  loadAndRender();
} else {
  initLogin();
}
