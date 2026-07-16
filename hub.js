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

let allLinks = [];
let pendingName = { firstName: '', lastName: '' }; // held between the name step and the pin steps

let myJobs = [];              // full job list (name/address/email/phone/totalCostCents) for this user
let myJobsLoaded = false;
let selectedJob = null;       // the job currently being turned into a link
let genType = 'deposit';
let genLastRecordedFingerprint = null;

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
  loginView.style.display = 'block';
}

function showHub() {
  loginView.style.display = 'none';
  generateView.style.display = 'none';
  hubView.style.display = 'block';
}

function showGenerate() {
  loginView.style.display = 'none';
  hubView.style.display = 'none';
  generateView.style.display = 'block';
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

// --- boot ---

if (getSessionToken()) {
  loadAndRender();
} else {
  initLogin();
}
