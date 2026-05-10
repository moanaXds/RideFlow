/* ═══════════════════════════════════════
   RideFlow — Shared API Client & Utilities
   All backend calls go through this file
   ═══════════════════════════════════════ */

const API_BASE = '/api';

// ── Auth token helpers ──────────────────
const Auth = {
  getToken:  ()      => localStorage.getItem('rf_token'),
  getUser:   ()      => JSON.parse(localStorage.getItem('rf_user') || 'null'),
  setSession:(token, user) => {
    localStorage.setItem('rf_token', token);
    localStorage.setItem('rf_user', JSON.stringify(user));
  },
  clear: () => {
    localStorage.removeItem('rf_token');
    localStorage.removeItem('rf_user');
  },
  requireRole: (role) => {
    const user = Auth.getUser();
    if (!user) { window.location.href = '/'; return false; }
    if (role && user.role !== role) {
      window.location.href = `/${user.role === 'admin' ? 'admin' : user.role}`;
      return false;
    }
    return true;
  }
};

// ── Core HTTP client ────────────────────
async function apiFetch(path, options = {}) {
  const token = Auth.getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    Auth.clear();
    window.location.href = '/';
    return;
  }
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

const api = {
  get:    (path)         => apiFetch(path, { method: 'GET' }),
  post:   (path, body)   => apiFetch(path, { method: 'POST',  body: JSON.stringify(body) }),
  patch:  (path, body)   => apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del:    (path)         => apiFetch(path, { method: 'DELETE' }),
};

// ── Toast notifications ─────────────────
function toast(msg, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  container.appendChild(el);
  requestAnimationFrame(() => { requestAnimationFrame(() => el.classList.add('show')); });
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }, duration);
}

// ── Loading state helpers ───────────────
function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn._origHTML = btn.innerHTML;
    btn.innerHTML = '<span class="loader"></span>';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn._origHTML || btn.innerHTML;
    btn.disabled = false;
  }
}

// ── Status badge helper ─────────────────
function statusPill(status) {
  return `<span class="status-pill sp-${status}">${status.replace('_', ' ')}</span>`;
}

// ── Star rating display ─────────────────
function renderStars(rating) {
  const r = parseFloat(rating) || 0;
  const full = Math.floor(r);
  const half = r - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

// ── Format currency ─────────────────────
function fmtMoney(val) {
  return '$' + parseFloat(val || 0).toFixed(2);
}

// ── Format date ─────────────────────────
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

// ── Confirm dialog ──────────────────────
function confirm(msg) {
  return window.confirm(msg);
}

// ── Modal helpers ───────────────────────
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

// Close modals on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// ── Escape key closes modals ────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});
