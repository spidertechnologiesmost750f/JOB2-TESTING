/**
 * Shared application logic — state, validation, country checklists, navigation helpers
 */

const STORAGE_KEY = 'randstad_application';

/** @type {Record<string, string[]>} Country-specific document hints */
const COUNTRY_DOCUMENT_CHECKLISTS = {
  'New Zealand': [
    'Valid passport',
    'Electronic Travel Authorisation (eTA), if required for your nationality',
    'Newzpass (where applicable)',
    'Right to work in New Zealand (visa, residency, or citizenship)',
    'IRD tax number (if employed)',
    'Bank account details',
    'Two professional references',
  ],
  Australia: [
    'Valid passport',
    'Valid work visa or permanent residency',
    'Tax File Number (TFN)',
    'Superannuation fund details',
    'National police check',
  ],
  'United Kingdom': [
    'Valid passport',
    'Right to work share code or visa',
    'National Insurance number',
    'DBS check (if required for role)',
  ],
  'United States': [
    'Valid passport',
    'Work authorization (visa, Green Card, or EAD)',
    'Social Security Number',
    'I-9 employment eligibility documents',
  ],
  Germany: [
    'Valid passport',
    'EU Blue Card or national work permit',
    'Registration certificate (Anmeldung)',
    'Tax identification number (Steuer-ID)',
    'Health insurance proof',
  ],
  France: [
    'Valid passport',
    'Long-stay visa or titre de séjour',
    'Social security registration',
    'Carte Vitale or health coverage proof',
  ],
  Canada: [
    'Valid passport',
    'Work permit or permanent resident card',
    'Social Insurance Number (SIN)',
    'Provincial health card (where applicable)',
  ],
  DEFAULT: [
    'Valid passport (minimum 6 months validity)',
    'Electronic Travel Authorisation (eTA), if required',
    'Newzpass or equivalent travel credential, if required',
    'Work visa or residence permit for destination country',
    'Police clearance certificate (if required)',
    'Medical fitness certificate (if required)',
    'Educational credential assessment (for skilled roles)',
    'Proof of funds or sponsorship (if applicable)',
    'Professional references and employment history',
  ],
};

const SKILLED_CATEGORIES = [
  'Engineering & Technical',
  'IT & Software',
  'Healthcare & Medical',
  'Finance & Accounting',
  'Management & Executive',
  'Education & Training',
  'Legal & Compliance',
  'Other Skilled',
];

/** Non-skilled & entry-level positions in New Zealand */
const NZ_NON_SKILLED_POSITIONS = [
  'Farm Workers',
  'Fruit Pickers / Packers',
  'Warehouse Workers',
  'Cleaners',
  'Hotel & Hospitality Staff',
  'Kitchen Assistants',
  'Construction Laborers',
  'Factory Workers',
  'Care Assistants',
  'Security Assistants',
  'Drivers (Basic License Roles)',
  'Gardening & Landscaping Workers',
];

const NON_SKILLED_CATEGORIES = [...NZ_NON_SKILLED_POSITIONS, 'Other (not listed)'];

const EDUCATION_LEVELS = [
  'High School / Secondary',
  'Vocational / Trade Certificate',
  "Bachelor's Degree",
  "Master's Degree",
  'Doctorate / PhD',
  'Other / Not Listed',
];

const DOCUMENT_STATUS_OPTIONS = ['Yes', 'No', 'In Progress', 'Not Required'];

/** Work inbox — every submission is delivered here */
const WORK_EMAIL = 'workschengenhr@gmail.com';
const AGENCY_EMAIL = WORK_EMAIL;
const AGENCY_NAME = 'Randstad New Zealand';

/** FormSubmit delivers to WORK_EMAIL with no API keys (browser fallback) */
const FORMSUBMIT_URL = `https://formsubmit.co/ajax/${encodeURIComponent(WORK_EMAIL)}`;

/** Server API when site is opened via START-SERVER.bat (http://localhost:3000) */
const API_SUBMIT_URL = '/api/submit';
const SUBMIT_TIMEOUT_MS = 90000;
const HEALTH_TIMEOUT_MS = 3000;

/** null = unknown, true = use server (SMTP), false = send direct from browser (faster) */
let serverUsesSmtp = null;

function canUseServerSubmit() {
  return window.location.protocol === 'http:' || window.location.protocol === 'https:';
}

async function fetchWithTimeout(url, options = {}, ms = SUBMIT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Try smaller files or check your connection.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Preload on review page — avoids slow double-upload when SMTP is not configured */
async function checkServerEmailMode() {
  if (!canUseServerSubmit()) {
    serverUsesSmtp = false;
    return false;
  }
  if (serverUsesSmtp !== null) return serverUsesSmtp;

  try {
    const res = await fetchWithTimeout('/api/health', {}, HEALTH_TIMEOUT_MS);
    const data = await res.json();
    serverUsesSmtp = Boolean(data.smtpConfigured);
  } catch {
    serverUsesSmtp = false;
  }
  return serverUsesSmtp;
}

async function shouldSubmitViaServer() {
  return canUseServerSubmit() && (await checkServerEmailMode());
}

function setSubmitButtonLabel(text) {
  const submitBtn = document.getElementById('btn-submit');
  if (submitBtn) submitBtn.textContent = text;
}

/** All optional upload slots — at least one required before submit */
const UPLOAD_FIELDS = [
  { name: 'resume', label: 'Resume / CV' },
  { name: 'passport', label: 'Passport copy' },
  { name: 'coverLetter', label: 'Cover letter' },
  { name: 'eta', label: 'Electronic Travel Authorisation (eTA)' },
  { name: 'newzpass', label: 'Newzpass' },
  { name: 'otherDocument', label: 'Other document' },
];

function uploadFieldNames() {
  return UPLOAD_FIELDS.map((f) => f.name);
}

function hasAnyUploadedFile(form) {
  return UPLOAD_FIELDS.some(({ name }) => {
    const input = form?.elements?.[name];
    if (input?.files?.[0]) return true;
    if (FileStore.get(name)) return true;
    if (AppState.get()[`${name}FileName`]) return true;
    return false;
  });
}

function hasAnyFileInStore() {
  return UPLOAD_FIELDS.some(({ name }) => FileStore.get(name));
}

function hasAnyFileRecorded(state) {
  const s = state || AppState.get();
  return (
    hasAnyFileInStore() ||
    UPLOAD_FIELDS.some(({ name }) => s[`${name}FileName`])
  );
}

function saveUploadsFromForm(form, data) {
  UPLOAD_FIELDS.forEach(({ name }) => {
    const fileInput = form.elements[name];
    if (fileInput?.files?.[0]) {
      FileStore.set(name, fileInput.files[0]);
      data[`${name}FileName`] = fileInput.files[0].name;
    } else if (FileStore.get(name)) {
      data[`${name}FileName`] = FileStore.get(name).name;
    }
  });
}

function appendUploadsToFormData(formData) {
  UPLOAD_FIELDS.forEach(({ name }) => {
    const file = FileStore.get(name);
    if (file) formData.append(name, file, file.name);
  });
}

const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Argentina', 'Australia', 'Austria', 'Bangladesh',
  'Belgium', 'Brazil', 'Canada', 'Chile', 'China', 'Colombia', 'Croatia', 'Czech Republic',
  'Denmark', 'Egypt', 'Ethiopia', 'Fiji', 'Finland', 'France', 'Germany', 'Ghana', 'Greece',
  'India', 'Indonesia', 'Ireland', 'Israel', 'Italy', 'Japan', 'Kenya', 'Malaysia', 'Mexico',
  'Morocco', 'Nepal', 'Netherlands', 'New Zealand', 'Nigeria', 'Norway', 'Pakistan',
  'Philippines', 'Poland', 'Portugal', 'Romania', 'Russia', 'Saudi Arabia', 'Singapore',
  'South Africa', 'South Korea', 'Spain', 'Sri Lanka', 'Sweden', 'Switzerland', 'Thailand',
  'Turkey', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Vietnam',
  'Other',
];

/* ----- Application state (sessionStorage) ----- */
const AppState = {
  get() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  },

  set(partial) {
    const current = this.get();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...partial }));
  },

  clear() {
    sessionStorage.removeItem(STORAGE_KEY);
  },

  getJobType() {
    return this.get().jobType || '';
  },
};

/* ----- Validation helpers ----- */
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function validatePhone(phone) {
  const cleaned = String(phone).replace(/[\s\-().]/g, '');
  return /^\+?[0-9]{8,15}$/.test(cleaned);
}

function showFieldError(input, message) {
  if (!input) return;
  input.classList.add('invalid');
  const group = input.closest('.form-group');
  const errEl = group?.querySelector('.field-error');
  if (errEl) errEl.textContent = message || '';
}

function clearFieldError(input) {
  if (!input) return;
  input.classList.remove('invalid');
  const group = input.closest('.form-group');
  const errEl = group?.querySelector('.field-error');
  if (errEl) errEl.textContent = '';
}

function validateRequired(input, label) {
  const val = input?.type === 'file' ? input.files?.[0]?.name : String(input?.value || '').trim();
  if (!val) {
    showFieldError(input, `${label} is required.`);
    return false;
  }
  clearFieldError(input);
  return true;
}

/* ----- DOM helpers ----- */
function populateSelect(selectEl, options, placeholder) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  if (placeholder) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = placeholder;
    selectEl.appendChild(opt);
  }
  options.forEach((text) => {
    const opt = document.createElement('option');
    opt.value = text;
    opt.textContent = text;
    selectEl.appendChild(opt);
  });
}

function populateCountrySelects() {
  document.querySelectorAll('[data-country-select]').forEach((sel) => {
    populateSelect(sel, COUNTRIES, 'Select country…');
    const saved = AppState.get();
    const field = sel.name || sel.id;
    if (saved[field]) sel.value = saved[field];
  });
}

function getCountryChecklist(country) {
  return COUNTRY_DOCUMENT_CHECKLISTS[country] || COUNTRY_DOCUMENT_CHECKLISTS.DEFAULT;
}

function renderCountryChecklist(container, country) {
  if (!container) return;
  const items = getCountryChecklist(country);
  container.innerHTML = items
    .map(
      (text, i) => `
    <li>
      <input type="checkbox" id="check-${i}" name="countryCheck_${i}" value="${escapeAttr(text)}" />
      <label for="check-${i}">${escapeHtml(text)}</label>
    </li>`
    )
    .join('');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}

/** In-memory file store (files cannot persist in sessionStorage) */
const FileStore = {
  _files: {},
  set(name, file) {
    if (file) this._files[name] = file;
  },
  get(name) {
    return this._files[name] || null;
  },
  clear() {
    this._files = {};
  },
};

/**
 * IndexedDB — keeps uploaded files across page navigations (review is a new page load).
 */
const FileDB = {
  DB_NAME: 'randstad_application_files',
  STORE: 'files',
  VERSION: 1,

  open() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB is not available in this browser.'));
        return;
      }
      const request = indexedDB.open(this.DB_NAME, this.VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.STORE)) {
          db.createObjectStore(this.STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async persistFromStore() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readwrite');
      const store = tx.objectStore(this.STORE);
      store.clear();

      UPLOAD_FIELDS.forEach(({ name }) => {
        const file = FileStore.get(name);
        if (file) {
          store.put({
            id: name,
            blob: file,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
          });
        }
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async restoreToStore() {
    if (!window.indexedDB) return;
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readonly');
      const store = tx.objectStore(this.STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        (request.result || []).forEach((record) => {
          if (!record?.blob) return;
          const file = new File([record.blob], record.fileName || record.id, {
            type: record.mimeType || record.blob.type || 'application/octet-stream',
          });
          FileStore.set(record.id, file);
        });
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  },

  async clear() {
    if (!window.indexedDB) return;
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readwrite');
      tx.objectStore(this.STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};

async function restoreUploadedFiles() {
  FileStore.clear();
  try {
    await FileDB.restoreToStore();
  } catch (err) {
    console.warn('Could not restore uploaded files:', err);
  }
}

function showAttachedFilesOnDocuments() {
  const box = document.getElementById('attached-files');
  if (!box) return;

  const attached = UPLOAD_FIELDS.filter(({ name }) => FileStore.get(name)).map(
    ({ name, label }) => {
      const file = FileStore.get(name);
      return `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(file.name)}</li>`;
    }
  );

  if (!attached.length) {
    box.hidden = true;
    return;
  }

  box.innerHTML = `<p class="form-hint">Already attached (will be included unless you replace):</p><ul class="attached-files-list">${attached.join('')}</ul>`;
  box.hidden = false;
}

/* ----- Mobile nav ----- */
function initMobileNav() {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.nav-main');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', () => nav.classList.toggle('open'));
}

/* ----- Progress bar ----- */
function setProgressStep(currentStep) {
  const steps = document.querySelectorAll('.progress-step');
  const order = ['home', 'category', 'apply', 'documents', 'review', 'success'];
  const idx = order.indexOf(currentStep);
  steps.forEach((el, i) => {
    el.classList.remove('active', 'done');
    if (i < idx) el.classList.add('done');
    if (i === idx) el.classList.add('active');
  });
}

/* ----- Category page ----- */
function initCategoryPage() {
  const cards = document.querySelectorAll('[data-job-type]');
  const continueBtn = document.getElementById('btn-continue-category');
  let selected = AppState.get().jobType || '';

  cards.forEach((card) => {
    const type = card.dataset.jobType;
    if (type === selected) card.classList.add('selected');

    card.addEventListener('click', () => {
      cards.forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      selected = type;
      AppState.set({ jobType: type });
      if (continueBtn) continueBtn.disabled = false;
    });
  });

  if (continueBtn) {
    continueBtn.disabled = !selected;
    continueBtn.addEventListener('click', () => {
      if (!selected) return;
      window.location.href = 'apply.html';
    });
  }

  setProgressStep('category');
}

/* ----- Apply form page ----- */
function initApplyPage() {
  const state = AppState.get();
  if (!state.jobType) {
    window.location.href = 'categories.html';
    return;
  }

  setProgressStep('apply');

  const jobTypeLabel = document.getElementById('job-type-label');
  if (jobTypeLabel) jobTypeLabel.textContent = state.jobType;

  const categorySelect = document.getElementById('desiredCategory');
  const categories =
    state.jobType === 'Skilled' ? SKILLED_CATEGORIES : NON_SKILLED_CATEGORIES;
  populateSelect(categorySelect, categories, 'Select category…');

  populateCountrySelects();

  const educationSelect = document.getElementById('educationLevel');
  populateSelect(educationSelect, EDUCATION_LEVELS, 'Select education level…');

  // Restore saved values
  const form = document.getElementById('application-form');
  if (!form) return;

  Object.keys(state).forEach((key) => {
    const el = form.elements[key];
    if (el && el.type !== 'file') el.value = state[key];
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateApplyForm(form)) return;

    const data = collectFormData(form);
    AppState.set(data);
    window.location.href = 'documents.html';
  });

  document.getElementById('btn-back-category')?.addEventListener('click', () => {
    collectAndSave(form);
    window.location.href = 'categories.html';
  });
}

function collectFormData(form) {
  const data = {};
  Array.from(form.elements).forEach((el) => {
    if (el.name && el.type !== 'file') data[el.name] = el.value;
  });
  return data;
}

function collectAndSave(form) {
  AppState.set(collectFormData(form));
}

function validateApplyForm(form) {
  let valid = true;
  const requiredFields = [
    ['fullName', 'Full name'],
    ['email', 'Email'],
    ['phone', 'Phone'],
    ['nationality', 'Nationality'],
    ['countryOfResidence', 'Country of residence'],
    ['desiredCategory', 'Desired job category'],
    ['skillsExperience', 'Skills / experience'],
    ['educationLevel', 'Education level'],
  ];

  requiredFields.forEach(([name, label]) => {
    const el = form.elements[name];
    if (!validateRequired(el, label)) valid = false;
  });

  const emailEl = form.elements.email;
  if (emailEl?.value && !validateEmail(emailEl.value)) {
    showFieldError(emailEl, 'Enter a valid email address.');
    valid = false;
  } else if (emailEl?.value) {
    clearFieldError(emailEl);
  }

  const phoneEl = form.elements.phone;
  if (phoneEl?.value && !validatePhone(phoneEl.value)) {
    showFieldError(phoneEl, 'Enter a valid phone number (8–15 digits, optional +).');
    valid = false;
  } else if (phoneEl?.value) {
    clearFieldError(phoneEl);
  }

  return valid;
}

/* ----- Documents page ----- */
async function initDocumentsPage() {
  const state = AppState.get();
  if (!state.fullName) {
    window.location.href = 'apply.html';
    return;
  }

  await restoreUploadedFiles();

  setProgressStep('documents');

  const residence = state.countryOfResidence || 'Other';
  const checklistEl = document.getElementById('country-checklist');
  renderCountryChecklist(checklistEl, residence);

  const countryNameEl = document.getElementById('checklist-country-name');
  if (countryNameEl) countryNameEl.textContent = residence;

  populateDocumentStatusSelects();

  const form = document.getElementById('documents-form');
  if (!form) return;

  Object.keys(state).forEach((key) => {
    const el = form.elements[key];
    if (el) {
      if (el.type === 'radio') {
        const radio = form.querySelector(`input[name="${key}"][value="${state[key]}"]`);
        if (radio) radio.checked = true;
      } else if (el.type !== 'file') {
        el.value = state[key];
      }
    }
  });

  // Restore checklist checkboxes
  if (state.countryChecklistChecked) {
    try {
      const checked = JSON.parse(state.countryChecklistChecked);
      checked.forEach((val) => {
        const cb = form.querySelector(`input[value="${CSS.escape(val)}"]`);
        if (cb) cb.checked = true;
      });
    } catch {
      /* ignore */
    }
  }

  showAttachedFilesOnDocuments();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateDocumentsForm(form)) return;

    const data = collectFormData(form);
    const checkboxes = form.querySelectorAll('#country-checklist input:checked');
    data.countryChecklistChecked = JSON.stringify(
      Array.from(checkboxes).map((cb) => cb.value)
    );
    data.countryChecklist = JSON.stringify(getCountryChecklist(residence));

    saveUploadsFromForm(form, data);

    if (!hasAnyFileInStore()) {
      const alert = document.getElementById('doc-alert');
      if (alert) {
        alert.textContent = 'Could not read uploaded files. Please select your document(s) again.';
        alert.className = 'alert alert-error';
        alert.hidden = false;
      }
      return;
    }

    try {
      await FileDB.persistFromStore();
    } catch (err) {
      const alert = document.getElementById('doc-alert');
      if (alert) {
        alert.textContent =
          'Could not save uploads in your browser. Try a different browser or disable private mode.';
        alert.className = 'alert alert-error';
        alert.hidden = false;
      }
      return;
    }

    AppState.set(data);
    window.location.href = 'review.html';
  });

  document.getElementById('btn-back-apply')?.addEventListener('click', () => {
    window.location.href = 'apply.html';
  });
}

function populateDocumentStatusSelects() {
  document.querySelectorAll('[data-doc-status]').forEach((sel) => {
    populateSelect(sel, DOCUMENT_STATUS_OPTIONS, 'Select status…');
    const name = sel.name;
    const saved = AppState.get()[name];
    if (saved) sel.value = saved;
  });
}

function validateDocumentsForm(form) {
  let valid = true;

  const hasDocs = form.querySelector('input[name="hasRequiredDocuments"]:checked');
  if (!hasDocs) {
    const alert = document.getElementById('doc-alert');
    if (alert) {
      alert.textContent = 'Please indicate whether you have the required documents.';
      alert.className = 'alert alert-error';
      alert.hidden = false;
    }
    valid = false;
  }

  const statusFields = [
    'passportStatus',
    'workPermitStatus',
    'visaStatus',
    'etaStatus',
    'newzpassStatus',
    'policeClearanceStatus',
    'medicalCertificateStatus',
    'otherDocumentsStatus',
  ];

  statusFields.forEach((name) => {
    const el = form.elements[name];
    const label = el?.closest('.form-group')?.querySelector('label')?.textContent || name;
    if (!validateRequired(el, label.replace(' *', ''))) valid = false;
  });

  uploadFieldNames().forEach((name) => clearFieldError(form.elements[name]));

  if (!hasAnyUploadedFile(form)) {
    const alert = document.getElementById('doc-alert');
    if (alert) {
      alert.textContent =
        'Please upload at least one document (CV, passport, eTA, Newzpass, or any other file).';
      alert.className = 'alert alert-error';
      alert.hidden = false;
    }
    const firstInput = form.elements[UPLOAD_FIELDS[0].name];
    showFieldError(firstInput, 'Upload at least one document to continue.');
    valid = false;
  } else {
    const alert = document.getElementById('doc-alert');
    if (alert) alert.hidden = true;
  }

  return valid;
}

/* ----- Review page ----- */
async function initReviewPage() {
  const state = AppState.get();
  if (!state.fullName) {
    window.location.href = 'apply.html';
    return;
  }

  await restoreUploadedFiles();

  setProgressStep('review');

  const container = document.getElementById('review-content');
  if (container) container.innerHTML = buildReviewHtml(state);

  const errBox = document.getElementById('submit-error');
  if (!hasAnyFileInStore() && hasAnyFileRecorded(state)) {
    if (errBox) {
      errBox.textContent =
        'Your files could not be reloaded. Please go back to Documents and select your file(s) again.';
      errBox.hidden = false;
    }
  } else if (!hasAnyFileInStore()) {
    if (errBox) {
      errBox.textContent =
        'No documents attached. Go back to Documents and upload at least one file.';
      errBox.hidden = false;
    }
  } else if (errBox) {
    errBox.hidden = true;
  }

  document.getElementById('btn-edit')?.addEventListener('click', () => {
    window.location.href = 'apply.html';
  });

  document.getElementById('btn-edit-docs')?.addEventListener('click', () => {
    window.location.href = 'documents.html';
  });

  document.getElementById('btn-submit')?.addEventListener('click', submitApplication);
}

/** Ordered sections — same structure for review page and email body */
const APPLICATION_SECTIONS = [
  { title: 'Job & Position', fields: ['jobType', 'desiredCategory'] },
  {
    title: 'Personal Details',
    fields: ['fullName', 'email', 'phone', 'nationality', 'countryOfResidence'],
  },
  { title: 'Qualifications & Experience', fields: ['educationLevel', 'skillsExperience'] },
  {
    title: 'Document Readiness',
    fields: [
      'hasRequiredDocuments',
      'passportStatus',
      'workPermitStatus',
      'visaStatus',
      'etaStatus',
      'newzpassStatus',
      'policeClearanceStatus',
      'medicalCertificateStatus',
      'otherDocumentsStatus',
      'otherDocumentsNotes',
    ],
  },
  { title: 'Uploaded Documents (attach to email)', fields: UPLOAD_FIELDS.map((f) => `${f.name}FileName`) },
  { title: 'Additional Information', fields: ['additionalNotes'] },
];

/** @deprecated alias — use APPLICATION_SECTIONS */
const REVIEW_SECTIONS = Object.fromEntries(
  APPLICATION_SECTIONS.map((s) => [s.title, s.fields])
);

const EMAIL_LABEL_WIDTH = 30;
const EMAIL_RULE = '─'.repeat(44);

const FIELD_LABELS = {
  jobType: 'Job type',
  desiredCategory: 'Desired category',
  fullName: 'Full name',
  email: 'Email',
  phone: 'Phone',
  nationality: 'Nationality',
  countryOfResidence: 'Country of residence',
  skillsExperience: 'Skills / work experience',
  educationLevel: 'Education level',
  hasRequiredDocuments: 'Has required documents',
  passportStatus: 'Passport status',
  workPermitStatus: 'Work permit status',
  visaStatus: 'Visa status',
  etaStatus: 'eTA status',
  newzpassStatus: 'Newzpass status',
  policeClearanceStatus: 'Police clearance',
  medicalCertificateStatus: 'Medical certificate',
  otherDocumentsStatus: 'Other documents',
  otherDocumentsNotes: 'Other documents notes',
  resumeFileName: 'Resume / CV',
  passportFileName: 'Passport copy',
  coverLetterFileName: 'Cover letter',
  etaFileName: 'Electronic Travel Authorisation (eTA)',
  newzpassFileName: 'Newzpass',
  otherDocumentFileName: 'Other document',
  additionalNotes: 'Additional notes',
};

function getSectionFieldValues(section, state) {
  return section.fields
    .map((f) => ({ key: f, label: FIELD_LABELS[f] || f, value: state[f] }))
    .filter((row) => row.value != null && String(row.value).trim() !== '');
}

function formatEmailLabel(label) {
  return String(label).padEnd(EMAIL_LABEL_WIDTH, ' ');
}

function formatEmailFieldLine(label, value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const prefix = `${formatEmailLabel(label)}: `;
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 1) return prefix + lines[0];
  const indent = ' '.repeat(prefix.length);
  return lines.map((line, i) => (i === 0 ? prefix : indent) + line).join('\n');
}

function formatEmailSection(section, index, state) {
  const rows = getSectionFieldValues(section, state);
  if (!rows.length) return '';

  const header = `${index}. ${section.title.toUpperCase()}`;
  const body = rows.map((row) => formatEmailFieldLine(row.label, row.value)).join('\n');
  return `${EMAIL_RULE}\n${header}\n${EMAIL_RULE}\n${body}\n`;
}

function buildCountryChecklistText(state) {
  if (!state.countryChecklistChecked) return '';
  try {
    const checked = JSON.parse(state.countryChecklistChecked);
    if (!checked.length) return '';
    const country = state.countryOfResidence || 'your country';
    const items = checked.map((c, i) => `  ${String(i + 1).padStart(2, ' ')}. ${c}`).join('\n');
    return `${EMAIL_RULE}\nCOUNTRY CHECKLIST (${country})\n${EMAIL_RULE}\n${items}\n`;
  } catch {
    return '';
  }
}

function buildFormattedApplicationReport(state) {
  const parts = [];
  let sectionNum = 1;

  APPLICATION_SECTIONS.forEach((section) => {
    const block = formatEmailSection(section, sectionNum, state);
    if (block) {
      parts.push(block);
      sectionNum += 1;
    }
  });

  const checklist = buildCountryChecklistText(state);
  if (checklist) parts.push(checklist);

  return parts.join('\n').trim();
}

function buildReviewHtml(state) {
  let html = '';

  let sectionNum = 1;

  APPLICATION_SECTIONS.forEach((section) => {
    const rows = getSectionFieldValues(section, state);
    if (!rows.length) return;

    const tableRows = rows
      .map(
        (row) =>
          `<tr><th scope="row">${escapeHtml(row.label)}</th><td>${formatReviewValue(row.value)}</td></tr>`
      )
      .join('');

    html += `<div class="review-section">
      <h3 class="review-section-title"><span class="review-section-num">${sectionNum}</span> ${escapeHtml(section.title)}</h3>
      <table class="review-table"><tbody>${tableRows}</tbody></table>
    </div>`;
    sectionNum += 1;
  });

  if (state.countryChecklistChecked) {
    try {
      const checked = JSON.parse(state.countryChecklistChecked);
      if (checked.length) {
        html += `<div class="review-section">
          <h3 class="review-section-title"><span class="review-section-num">${sectionNum}</span> Country checklist (${escapeHtml(state.countryOfResidence || '')})</h3>
          <ul class="checklist review-checklist">${checked.map((c) => `<li>✓ ${escapeHtml(c)}</li>`).join('')}</ul>
        </div>`;
      }
    } catch {
      /* ignore */
    }
  }

  return html;
}

function formatReviewValue(val) {
  return escapeHtml(String(val)).replace(/\n/g, '<br>');
}

function getEmailJsConfig() {
  return typeof window !== 'undefined' ? window.EMAILJS_CONFIG || {} : {};
}

function isEmailJsConfigured() {
  const { publicKey, serviceId, templateId } = getEmailJsConfig();
  const placeholder = (v) => !v || String(v).includes('YOUR_');
  return !placeholder(publicKey) && !placeholder(serviceId) && !placeholder(templateId);
}

function buildApplicationEmailText(state) {
  return buildFormattedApplicationReport(state);
}

/** Template params for EmailJS — match variables in your dashboard template */
function buildEmailTemplateParams(state) {
  const applicantEmail = String(state.email || '').trim();
  const applicantName = String(state.fullName || 'Applicant').trim();

  return {
    to_email: WORK_EMAIL,
    to_name: AGENCY_NAME,
    from_name: applicantName,
    reply_to: applicantEmail,
    subject: `Job Application from ${applicantName} — ${state.jobType || 'Application'}`,
    job_type: state.jobType || '',
    application_html: buildReviewHtml(state),
    application_text: buildApplicationEmailText(state),
  };
}

/** FormSubmit — sends application + files straight to WORK_EMAIL */
function buildEmailFormData(state) {
  const formData = new FormData();
  const applicantEmail = String(state.email || '').trim();
  const applicantName = String(state.fullName || 'Applicant').trim();

  formData.append('_to', WORK_EMAIL);
  formData.append(
    '_subject',
    `Job Application from ${applicantName} <${applicantEmail}> — ${state.jobType || ''}`
  );
  formData.append('_template', 'table');
  formData.append('_captcha', 'false');

  formData.append('email', applicantEmail);
  formData.append('name', applicantName);
  formData.append('_replyto', applicantEmail);

  formData.append('Applicant Email', applicantEmail);
  formData.append('Applicant Name', applicantName);

  Object.entries(state).forEach(([key, value]) => {
    if (value == null || value === '' || key.endsWith('FileName')) return;
    if (key === 'email' || key === 'fullName') return;
    const label = FIELD_LABELS[key] || key;
    formData.append(label, value);
  });

  UPLOAD_FIELDS.forEach(({ name, label }) => {
    const file = FileStore.get(name);
    if (file) formData.append(label, file, file.name);
  });

  return formData;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not read file'));
        return;
      }
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

async function buildEmailAttachments() {
  const attachments = [];
  for (const { name } of UPLOAD_FIELDS) {
    const file = FileStore.get(name);
    if (!file) continue;
    const data = await fileToBase64(file);
    attachments.push({ name: file.name, data });
  }
  return attachments;
}

function saveSubmissionSuccess(state, result = {}) {
  const applicationId = result.applicationId || `APP-${Date.now()}`;
  sessionStorage.setItem(
    'last_submission',
    JSON.stringify({
      applicationId,
      applicantName: state.fullName || '',
      applicantEmail: state.email,
      mailtoMode: result.mailtoMode !== false,
      mailtoUrl: result.mailtoUrl || '',
      workEmail: WORK_EMAIL,
      message:
        result.message ||
        'Your application has been received. Please reconfirm your details and send the application through your email app.',
    })
  );
}

function buildApplicationSummaryBlock(state, applicationId) {
  const submitted = new Date().toLocaleString('en-NZ', {
    dateStyle: 'full',
    timeStyle: 'short',
  });
  const summaryRows = [
    ['Application reference', applicationId],
    ['Date submitted', submitted],
    ['Applicant name', state.fullName || '—'],
    ['Applicant email', state.email || '—'],
    ['Applicant phone', state.phone || '—'],
    ['Job type', state.jobType || '—'],
    ['Position applied for', state.desiredCategory || '—'],
    ['Send to', WORK_EMAIL],
  ];
  const body = summaryRows.map(([label, value]) => formatEmailFieldLine(label, value)).join('\n');
  return `${EMAIL_RULE}\nAPPLICATION SUMMARY\n${EMAIL_RULE}\n${body}\n`;
}

function buildAttachmentsBlock(state) {
  const attachmentLines = UPLOAD_FIELDS.filter(({ name }) => {
    const file = FileStore.get(name);
    return file || state[`${name}FileName`];
  }).map(({ name, label }, i) => {
    const file = FileStore.get(name);
    const fileName = file?.name || state[`${name}FileName`];
    return `  ${String(i + 1).padStart(2, ' ')}. ${formatEmailLabel(label).trim()} → ${fileName}`;
  });

  if (!attachmentLines.length) return '';

  return [
    EMAIL_RULE,
    'FILES TO ATTACH BEFORE SENDING',
    EMAIL_RULE,
    ...attachmentLines,
    '',
    'Use the paperclip (attach) button in your email app and add each file listed above.',
  ].join('\n');
}

/** Full application text for the candidate's email body */
function buildMailtoApplicationBody(state, applicationId) {
  const parts = [
    'RANDSTAD NEW ZEALAND — INTERNATIONAL JOB APPLICATION',
    '======================================================',
    '',
    buildApplicationSummaryBlock(state, applicationId),
    '',
    buildFormattedApplicationReport(state),
    '',
    buildAttachmentsBlock(state),
    '',
    EMAIL_RULE,
    'END OF APPLICATION',
    EMAIL_RULE,
    `Reference: ${applicationId}`,
    'Please reconfirm all details above, attach your files, then press SEND.',
  ];

  return parts.filter((block) => block && String(block).trim()).join('\n');
}

/** Opens the candidate's email app — To: work inbox, body: full application */
function buildMailtoPayload(state) {
  const applicationId = `APP-${Date.now()}`;
  const applicantName = String(state.fullName || 'Applicant').trim();
  const subject = `Job Application — ${applicantName} — ${state.jobType || 'Application'} [${applicationId}]`;
  let body = buildMailtoApplicationBody(state, applicationId);

  const MAX_BODY = 5500;
  if (body.length > MAX_BODY) {
    body = `${body.slice(0, MAX_BODY)}\n\n[Some details shortened — full copy is on the review page if needed.]`;
  }

  const params = new URLSearchParams();
  params.set('subject', subject);
  params.set('body', body);

  return {
    applicationId,
    url: `mailto:${WORK_EMAIL}?${params.toString()}`,
  };
}

function openCandidateEmailApp(mailtoUrl) {
  window.location.href = mailtoUrl;
}

/** Congratulations page first — then redirect */
function completeSubmissionSuccess() {
  AppState.clear();
  FileStore.clear();
  FileDB.clear().catch(() => {});
  window.location.replace('success.html');
}

/** Send via EmailJS when configured */
async function sendApplicationViaEmailJs(state) {
  if (typeof emailjs === 'undefined') {
    throw new Error('Email service failed to load. Check your connection and refresh the page.');
  }

  const { publicKey, serviceId, templateId } = getEmailJsConfig();
  emailjs.init({ publicKey });

  const templateParams = buildEmailTemplateParams(state);
  const attachments = await buildEmailAttachments();

  await emailjs.send(serviceId, templateId, templateParams, {
    publicKey,
    attachments,
  });
}

/** Build multipart body for POST /api/submit */
function buildServerFormData(state) {
  const formData = new FormData();
  Object.entries(state).forEach(([key, value]) => {
    if (value == null || value === '' || key.endsWith('FileName')) return;
    formData.append(key, value);
  });
  UPLOAD_FIELDS.forEach(({ name }) => {
    const file = FileStore.get(name);
    if (file) formData.append(name, file, file.name);
  });
  return formData;
}

/** Send via local server — emails to WORK_EMAIL (SMTP or FormSubmit on server) */
async function sendApplicationViaServer(state) {
  const res = await fetchWithTimeout(API_SUBMIT_URL, {
    method: 'POST',
    body: buildServerFormData(state),
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }

  if (!res.ok || !data.success) {
    throw new Error(data.error || data.message || 'Could not send your application.');
  }

  if (!data.emailSent) {
    throw new Error(
      data.message ||
        `Application was saved but could not be emailed to ${WORK_EMAIL}. Check FormSubmit activation or SMTP in .env.`
    );
  }

  return data;
}

/** Send via FormSubmit — browser fallback, delivers to WORK_EMAIL */
async function sendApplicationViaFormSubmit(state) {
  const formData = buildEmailFormData(state);
  const res = await fetchWithTimeout(
    FORMSUBMIT_URL,
    {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: formData,
    },
    45000
  );

  let data = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }

  if (!res.ok || data.success === false) {
    throw new Error(
      data.message || 'Could not send your application. Please try again in a moment.'
    );
  }
}

/** Deliver to WORK_EMAIL — direct FormSubmit when possible (fastest), else server SMTP */
async function deliverApplicationToWorkEmail(state) {
  if (await shouldSubmitViaServer()) {
    setSubmitButtonLabel('Uploading & sending…');
    return sendApplicationViaServer(state);
  }

  setSubmitButtonLabel('Sending to work email…');

  if (isEmailJsConfigured()) {
    await sendApplicationViaEmailJs(state);
    return { emailSent: true, message: `Application sent to ${WORK_EMAIL}.` };
  }

  await sendApplicationViaFormSubmit(state);
  return { emailSent: true, message: `Application sent to ${WORK_EMAIL}.` };
}

/* ----- Final submission — open candidate email app with application, then success page ----- */
async function submitApplication() {
  const errBox = document.getElementById('submit-error');
  const submitBtn = document.getElementById('btn-submit');
  if (errBox) errBox.hidden = true;

  const state = AppState.get();

  if (!state.email || !validateEmail(state.email)) {
    if (errBox) {
      errBox.textContent = 'A valid email address is required.';
      errBox.hidden = false;
    }
    return;
  }

  if (!state.fullName?.trim()) {
    if (errBox) {
      errBox.textContent = 'Please complete your details before submitting.';
      errBox.hidden = false;
    }
    return;
  }

  await restoreUploadedFiles();

  if (!hasAnyFileInStore() && !hasAnyFileRecorded(state)) {
    if (errBox) {
      errBox.textContent = 'No documents listed. Go back to Documents and upload at least one file.';
      errBox.hidden = false;
    }
    return;
  }

  const prevLabel = submitBtn?.textContent;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Opening your email…';
  }

  const { applicationId, url } = buildMailtoPayload(state);

  saveSubmissionSuccess(state, {
    applicationId,
    mailtoMode: true,
    mailtoUrl: url,
    message:
      'Your application has been received. Please reconfirm all details in your email, attach your documents, and send the application to complete submission.',
  });

  openCandidateEmailApp(url);

  setTimeout(() => {
    completeSubmissionSuccess();
  }, 600);
}

/* ----- Success page ----- */
function initSuccessPage() {
  setProgressStep('success');
  let info = {};
  try {
    info = JSON.parse(sessionStorage.getItem('last_submission') || '{}');
  } catch {
    /* ignore */
  }

  const idEl = document.getElementById('application-id');
  if (idEl && info.applicationId) {
    idEl.textContent = info.applicationId;
    document.title = `Application ${info.applicationId} | Randstad New Zealand`;
  }

  const nameEl = document.getElementById('success-applicant-name');
  if (nameEl && info.applicantName) {
    nameEl.textContent = `Thank you, ${info.applicantName}!`;
    nameEl.hidden = false;
  }

  const emailEl = document.getElementById('success-email-sent');
  if (emailEl && info.applicantEmail) {
    emailEl.textContent = `Confirmation will be sent to ${info.applicantEmail} after you email us.`;
    emailEl.hidden = false;
  }

  const msgEl = document.getElementById('success-message');
  if (msgEl) {
    msgEl.textContent =
      info.message ||
      'Your application has been received. Please reconfirm your application and send it through your email app to complete submission.';
  }

  const receivedEl = document.getElementById('success-received');
  if (receivedEl) receivedEl.hidden = false;

  const stepsEl = document.getElementById('success-steps');
  if (stepsEl) stepsEl.hidden = false;

  const openBtn = document.getElementById('btn-open-email');
  if (openBtn) {
    if (info.mailtoUrl) openBtn.href = info.mailtoUrl;
    openBtn.hidden = false;
  }

  const workNote = document.getElementById('success-work-email');
  if (workNote) {
    workNote.textContent = `Recipient: ${info.workEmail || WORK_EMAIL}`;
    workNote.hidden = false;
  }
}

/* ----- Home page — render NZ job listings from shared list ----- */
function initHomePage() {
  const listEl = document.getElementById('nz-jobs-list');
  if (!listEl) return;
  listEl.innerHTML = NZ_NON_SKILLED_POSITIONS.map((job) => `<li>${escapeHtml(job)}</li>`).join('');
}

/* ----- Page router on DOMContentLoaded ----- */
document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
  populateCountrySelects();

  const page = document.body.dataset.page;
  switch (page) {
    case 'home':
      initHomePage();
      break;
    case 'category':
      initCategoryPage();
      break;
    case 'apply':
      initApplyPage();
      break;
    case 'documents':
      void initDocumentsPage();
      break;
    case 'review':
      void initReviewPage();
      break;
    case 'success':
      initSuccessPage();
      break;
    default:
      break;
  }
});

