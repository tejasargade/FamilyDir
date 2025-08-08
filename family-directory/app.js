// Family Contact Directory - Vanilla JS
// Storage keys
const STORAGE_KEYS = {
  passcodeHash: 'family_dir_passcode_hash',
  members: 'family_dir_members_v1',
  settings: 'family_dir_settings_v1'
};

// Utilities
const q = (sel, root = document) => root.querySelector(sel);
const qa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const nowIso = () => new Date().toISOString();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Simple hash for passcode (NOT cryptographically strong but better than plain text)
async function hashString(input) {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}

function readLocal(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writeLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function removeLocal(key) { localStorage.removeItem(key); }

function showToast(message, timeout = 2200) {
  const toast = q('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), timeout);
}

function setMenuOpen(open) {
  const menu = q('.menu');
  if (!menu) return;
  if (open) menu.classList.add('open'); else menu.classList.remove('open');
}

// App State
const state = {
  unlocked: false,
  members: [],
  filteredMembers: [],
  search: '',
  cameraStream: null,
};

// Init
document.addEventListener('DOMContentLoaded', () => {
  wireAuth();
  wireUI();
  loadSettings();
  render();
});

function loadSettings() {
  const settings = readLocal(STORAGE_KEYS.settings, { storageMode: 'local', apiBase: '' });
  q('#storage-mode').value = settings.storageMode || 'local';
  q('#api-base').value = settings.apiBase || '';
}

function saveSettings() {
  const storageMode = q('#storage-mode').value;
  const apiBase = q('#api-base').value.trim();
  writeLocal(STORAGE_KEYS.settings, { storageMode, apiBase });
}

// Auth logic
function wireAuth() {
  const hasPasscode = !!localStorage.getItem(STORAGE_KEYS.passcodeHash);
  const authScreen = q('#auth-screen');
  const setupForm = q('#setup-passcode-form');
  const unlockForm = q('#unlock-form');
  const desc = q('#auth-description');

  if (hasPasscode) {
    // Show unlock form
    setupForm.classList.add('hidden');
    unlockForm.classList.remove('hidden');
    desc.textContent = 'Enter the shared family passcode to unlock your directory.';
  } else {
    // Show setup form
    setupForm.classList.remove('hidden');
    unlockForm.classList.add('hidden');
    desc.textContent = 'Set a shared family passcode to secure your directory.';
  }

  setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = q('#setup-passcode-input').value.trim();
    const b = q('#setup-passcode-confirm').value.trim();
    if (a.length < 4) return showToast('Passcode must be at least 4 digits');
    if (a !== b) return showToast('Passcodes do not match');
    const hash = await hashString(a);
    localStorage.setItem(STORAGE_KEYS.passcodeHash, hash);
    state.unlocked = true;
    loadMembers();
    authScreen.classList.remove('visible');
    showToast('Passcode set. Welcome!');
  });

  unlockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = q('#unlock-passcode-input').value.trim();
    const hash = await hashString(input);
    const saved = localStorage.getItem(STORAGE_KEYS.passcodeHash);
    if (hash === saved) {
      state.unlocked = true;
      loadMembers();
      authScreen.classList.remove('visible');
      showToast('Unlocked');
    } else {
      showToast('Incorrect passcode');
    }
  });

  q('#reset-passcode-btn').addEventListener('click', () => {
    if (!confirm('Reset will CLEAR all local data (members + passcode). Continue?')) return;
    removeLocal(STORAGE_KEYS.members);
    removeLocal(STORAGE_KEYS.passcodeHash);
    removeLocal(STORAGE_KEYS.settings);
    location.reload();
  });
}

function lockApp() {
  state.unlocked = false;
  q('#auth-screen').classList.add('visible');
  q('#unlock-passcode-input').value = '';
}

function loadMembers() {
  state.members = readLocal(STORAGE_KEYS.members, []);
  applySearch();
}

function saveMembers() {
  writeLocal(STORAGE_KEYS.members, state.members);
}

// UI wiring
function wireUI() {
  // Menu
  q('#menu-btn').addEventListener('click', () => setMenuOpen(!q('.menu').classList.contains('open')));
  document.addEventListener('click', (e) => {
    const menu = q('.menu');
    if (!menu.contains(e.target)) setMenuOpen(false);
  });

  // Search
  q('#search-input').addEventListener('input', (e) => { state.search = e.target.value; applySearch(); render(); });
  q('#clear-search').addEventListener('click', () => { q('#search-input').value = ''; state.search = ''; applySearch(); render(); });

  // Add buttons
  q('#add-member-btn').addEventListener('click', () => openMemberModal());
  q('#empty-add-btn').addEventListener('click', () => openMemberModal());
  q('#fab-add').addEventListener('click', () => openMemberModal());

  // Export/Import
  q('#export-json-btn').addEventListener('click', exportJSON);
  q('#export-csv-btn').addEventListener('click', exportCSV);
  q('#import-json-input').addEventListener('change', importJSON);

  // Settings
  q('#settings-btn').addEventListener('click', () => q('#settings-modal').classList.add('visible'));
  q('#settings-close').addEventListener('click', () => q('#settings-modal').classList.remove('visible'));
  q('#change-passcode-btn').addEventListener('click', changePasscode);
  q('#save-storage-settings').addEventListener('click', () => { saveSettings(); showToast('Settings saved'); });

  // Lock
  q('#lock-btn').addEventListener('click', () => { lockApp(); setMenuOpen(false); });

  // Member modal controls
  q('#member-modal-close').addEventListener('click', closeMemberModal);
  q('#cancel-member-btn').addEventListener('click', closeMemberModal);
  q('#member-form').addEventListener('submit', onSubmitMemberForm);

  // Photo input
  q('#photo-input').addEventListener('change', onPhotoFileSelected);

  // Camera controls
  q('#open-camera-btn').addEventListener('click', startCamera);
  q('#capture-btn').addEventListener('click', captureFromCamera);
  q('#close-camera-btn').addEventListener('click', stopCamera);
}

function changePasscode() {
  const a = q('#change-passcode-input').value.trim();
  const b = q('#change-passcode-confirm').value.trim();
  if (!a) return showToast('Enter new passcode');
  if (a.length < 4) return showToast('Passcode must be at least 4 digits');
  if (a !== b) return showToast('Passcodes do not match');
  hashString(a).then(hash => {
    localStorage.setItem(STORAGE_KEYS.passcodeHash, hash);
    q('#change-passcode-input').value = '';
    q('#change-passcode-confirm').value = '';
    showToast('Passcode updated');
  });
}

function openMemberModal(member = null) {
  q('#member-modal-title').textContent = member ? 'Edit Member' : 'Add Member';
  q('#member-id').value = member ? member.id : '';
  q('#full-name').value = member ? member.fullName : '';
  q('#relation').value = member ? member.relation : '';
  q('#mobile').value = member ? member.mobile : '';
  q('#email').value = member ? (member.email || '') : '';
  q('#birthday').value = member ? (member.birthday || '') : '';
  const img = q('#photo-preview');
  img.src = member && member.photoDataUrl ? member.photoDataUrl : '';
  img.style.display = img.src ? 'block' : 'none';
  q('#photo-input').value = '';
  q('#member-modal').classList.add('visible');
}

function closeMemberModal() {
  q('#member-modal').classList.remove('visible');
  stopCamera();
}

function onPhotoFileSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = q('#photo-preview');
    img.src = reader.result;
    img.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    state.cameraStream = stream;
    const video = q('#camera-stream');
    video.srcObject = stream;
    q('#capture-btn').disabled = false;
    q('#close-camera-btn').disabled = false;
  } catch (err) {
    console.error(err);
    showToast('Cannot access camera');
  }
}

function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
  q('#capture-btn').disabled = true;
  q('#close-camera-btn').disabled = true;
}

function captureFromCamera() {
  const video = q('#camera-stream');
  if (!video || !video.srcObject) return;
  const canvas = q('#camera-canvas');
  const ctx = canvas.getContext('2d');
  const width = video.videoWidth;
  const height = video.videoHeight;
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(video, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  const img = q('#photo-preview');
  img.src = dataUrl;
  img.style.display = 'block';
}

function onSubmitMemberForm(e) {
  e.preventDefault();
  const id = q('#member-id').value || uid();
  const fullName = q('#full-name').value.trim();
  const relation = q('#relation').value.trim();
  const mobile = q('#mobile').value.trim();
  const email = q('#email').value.trim() || null;
  const birthday = q('#birthday').value || null;
  const photoDataUrl = q('#photo-preview').src || null;

  if (!fullName || !relation || !mobile) return showToast('Please fill required fields');

  const existingIdx = state.members.findIndex(m => m.id === id);
  const member = { id, fullName, relation, mobile, email, birthday, photoDataUrl, updatedAt: nowIso(), createdAt: existingIdx >= 0 ? state.members[existingIdx].createdAt : nowIso() };

  if (existingIdx >= 0) state.members[existingIdx] = member; else state.members.push(member);

  saveMembers();
  applySearch();
  render();
  closeMemberModal();
  showToast(existingIdx >= 0 ? 'Member updated' : 'Member added');
}

function applySearch() {
  const s = (state.search || '').toLowerCase();
  if (!s) { state.filteredMembers = [...state.members]; return; }
  state.filteredMembers = state.members.filter(m =>
    (m.fullName || '').toLowerCase().includes(s) ||
    (m.relation || '').toLowerCase().includes(s)
  );
}

function render() {
  // Empty state
  const empty = q('#empty-state');
  const grid = q('#cards-grid');

  if (!state.unlocked) {
    empty.classList.remove('visible');
    grid.innerHTML = '';
    return;
  }

  if (state.filteredMembers.length === 0) {
    empty.classList.add('visible');
  } else {
    empty.classList.remove('visible');
  }

  grid.innerHTML = '';
  state.filteredMembers
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .forEach(member => {
      const card = document.createElement('article');
      card.className = 'card';

      const img = document.createElement('img');
      img.className = 'avatar';
      img.src = member.photoDataUrl || placeholderAvatar(member.fullName);
      img.alt = `${member.fullName} profile photo`;

      const info = document.createElement('div');
      info.className = 'info';

      const nameEl = document.createElement('h4');
      nameEl.className = 'name';
      nameEl.textContent = member.fullName;

      const meta = document.createElement('div');
      meta.className = 'meta';

      const relationPill = document.createElement('span');
      relationPill.className = 'pill';
      relationPill.textContent = member.relation;

      const mobileSpan = document.createElement('span');
      mobileSpan.textContent = member.mobile;

      const emailSpan = document.createElement('span');
      if (member.email) emailSpan.textContent = member.email;

      const bdaySpan = document.createElement('span');
      if (member.birthday) bdaySpan.textContent = formatBirthday(member.birthday);

      meta.append(relationPill, mobileSpan);
      if (member.email) meta.append(emailSpan);
      if (member.birthday) meta.append(bdaySpan);

      info.append(nameEl, meta);

      const actions = document.createElement('div');
      actions.className = 'actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'btn';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => openMemberModal(member));

      const delBtn = document.createElement('button');
      delBtn.className = 'btn';
      delBtn.style.borderColor = '#3a2631';
      delBtn.style.background = '#2a1820';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => deleteMember(member.id));

      actions.append(editBtn, delBtn);

      card.append(img, info, actions);
      grid.append(card);
    });
}

function deleteMember(id) {
  if (!confirm('Delete this member?')) return;
  const idx = state.members.findIndex(m => m.id === id);
  if (idx >= 0) {
    state.members.splice(idx, 1);
    saveMembers();
    applySearch();
    render();
    showToast('Member deleted');
  }
}

function placeholderAvatar(name) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  // simple svg data url
  const svg = `\n    <svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'>\n      <rect width='100%' height='100%' rx='12' ry='12' fill='#0b1119'/>\n      <text x='50%' y='54%' font-family='Inter, Arial' font-size='22' fill='#8fb3d8' text-anchor='middle'>${initials}</text>\n    </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function formatBirthday(isoDate) {
  try {
    const d = new Date(isoDate + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return isoDate; }
}

// Export / Import
function exportJSON() {
  const data = JSON.stringify(state.members, null, 2);
  downloadFile('family-directory.json', new Blob([data], { type: 'application/json' }));
}

function exportCSV() {
  const headers = ['id','fullName','relation','mobile','email','birthday','createdAt','updatedAt'];
  const rows = state.members.map(m => headers.map(h => csvEscape(m[h] ?? '')));
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadFile('family-directory.csv', new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
}

function csvEscape(val) {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function downloadFile(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function importJSON(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) throw new Error('Invalid JSON');
    // Basic shape validation
    const normalized = arr.map(raw => ({
      id: raw.id || uid(),
      fullName: String(raw.fullName || '').trim(),
      relation: String(raw.relation || '').trim(),
      mobile: String(raw.mobile || '').trim(),
      email: raw.email ? String(raw.email).trim() : null,
      birthday: raw.birthday || null,
      photoDataUrl: raw.photoDataUrl || null,
      createdAt: raw.createdAt || nowIso(),
      updatedAt: nowIso()
    })).filter(m => m.fullName && m.relation && m.mobile);

    state.members = normalized;
    saveMembers();
    applySearch();
    render();
    showToast('Import completed');
    e.target.value = '';
  } catch (err) {
    console.error(err);
    showToast('Import failed');
  }
}