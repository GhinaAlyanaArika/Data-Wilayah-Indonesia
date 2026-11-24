/* =========================================================
   Jelajah Wilayah Indonesia
   Public API : https://www.emsifa.com/api-wilayah-indonesia/
   Teknik     : Fetch API + Async/Await + Template Literals
   ========================================================= */

const API_BASES = [
  'https://www.emsifa.com/api-wilayah-indonesia/api',
];

const LEVELS = [
  { key: 'provinces', label: 'Provinsi',   plural: 'Daftar Provinsi',        child: 'Kabupaten/Kota', color: '#ec4899' },
  { key: 'regencies', label: 'Kab/Kota',   plural: 'Daftar Kabupaten/Kota',  child: 'Kecamatan',      color: '#f43f5e' },
  { key: 'districts', label: 'Kecamatan',  plural: 'Daftar Kecamatan',       child: 'Desa/Kelurahan', color: '#d946ef' },
  { key: 'villages',  label: 'Desa/Kel.',  plural: 'Daftar Desa/Kelurahan',  child: null,             color: '#f97316' },
];
const PALETTE = ['#ec4899', '#f43f5e', '#d946ef', '#fb7185', '#f97316', '#a855f7', '#e11d48', '#f472b6'];

/* ---------- STATE ---------- */
const state = {
  level: 0,          // 0 prov, 1 kab/kota, 2 kec, 3 desa
  path: [],          // [{id, name}] pilihan user per jenjang
  data: [],          // data level aktif (mentah dari API)
  keyword: '',
  sort: 'az',
  type: 'all',       // filter kabupaten/kota
  view: 'grid',
  loadId: 0,         // mencegah balapan request
};
const cache = new Map();

/* ---------- ELEMEN ---------- */
const $ = (id) => document.getElementById(id);
const el = {
  grid: $('dataGrid'), table: $('dataTable'),
  loading: $('loadingState'), error: $('errorState'), empty: $('emptyState'),
  errorMsg: $('errorMsg'), emptyMsg: $('emptyMsg'),
  search: $('searchInput'), clear: $('clearSearch'),
  sort: $('sortSelect'), filter: $('filterType'),
  title: $('sectionTitle'), crumb: $('breadcrumb'), info: $('resultInfo'),
  stepper: $('stepper'),
};
const detailModal = new bootstrap.Modal($('detailModal'));
const copyToast = new bootstrap.Toast($('copyToast'), { delay: 2000 });

/* ---------- UTIL ---------- */
const KEEP_UPPER = new Set(['DKI', 'DI', 'II', 'III', 'IV', 'KEP.', 'NTB', 'NTT']);
function titleCase(str = '') {
  return str.toLowerCase().split(' ').map((w) => {
    const up = w.toUpperCase();
    if (KEEP_UPPER.has(up)) return up;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}
function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function formatCode(id) {
  const s = String(id);
  if (s.length <= 2) return s;
  if (s.length <= 4) return `${s.slice(0, 2)}.${s.slice(2)}`;
  if (s.length <= 7) return `${s.slice(0, 2)}.${s.slice(2, 4)}.${s.slice(4)}`;
  return `${s.slice(0, 2)}.${s.slice(2, 4)}.${s.slice(4, 6)}.${s.slice(6)}`;
}
function regType(name) {
  return name.toUpperCase().startsWith('KOTA') ? 'kota' : 'kabupaten';
}
function show(...els) { els.forEach((e) => e.classList.remove('d-none')); }
function hide(...els) { els.forEach((e) => e.classList.add('d-none')); }

/* ---------- FETCH API (async/await) ---------- */
function endpoint(level, parentId) {
  const k = LEVELS[level].key;
  return level === 0 ? `${k}.json` : `${k}/${parentId}.json`;
}

/* Log request: tampil di halaman (alamat, waktu respons, status) */
function setRequestLog({ url, ms, label, ok }) {
  const box = $('requestLog');
  if (!box) return;
  const short = url.replace(/^https?:\/\//, '');
  box.innerHTML = `
    <span class="rl-label">Request:</span>
    <code class="rl-url">GET https://${escapeHtml(short)}</code>
    <span class="rl-ms">· ${ms} ms</span>
    <span class="rl-status ${ok ? 'ok' : 'err'}">· ${escapeHtml(label)}</span>`;
  show(box);
}

async function fetchJson(path) {
  let lastErr;
  for (const base of API_BASES) {
    const url = `${base}/${path}`;
    const t0 = performance.now();
    try {
      const res = await fetch(url);
      const ms = Math.round(performance.now() - t0);
      if (!res.ok) {
        setRequestLog({ url, ms, label: `HTTP ${res.status}`, ok: false });
        throw new Error(`Server membalas status ${res.status}`);
      }
      const data = await res.json();
      setRequestLog({ url, ms, label: `${res.status} OK`, ok: true });
      return data;
    } catch (err) {
      if (err instanceof TypeError) {
        setRequestLog({ url, ms: Math.round(performance.now() - t0), label: 'gagal jaringan', ok: false });
      }
      lastErr = err;
    }
  }
  throw lastErr;
}

async function getRegion(level, parentId) {
  const path = endpoint(level, parentId);
  if (cache.has(path)) {
    setRequestLog({ url: `${API_BASES[0]}/${path}`, ms: 0, label: 'dari cache', ok: true });
    return cache.get(path);
  }
  const data = await fetchJson(path);
  cache.set(path, data);
  return data;
}

/* ---------- LOAD LEVEL ---------- */
async function loadLevel() {
  const myLoad = ++state.loadId;
  const parent = state.path[state.level - 1];
  hide(el.grid, el.table, el.error, el.empty);
  show(el.loading);
  el.info.textContent = '';
  try {
    const data = await getRegion(state.level, parent?.id);
    if (myLoad !== state.loadId) return; // sudah ada request yang lebih baru
    state.data = data;
    hide(el.loading);
    render();
    if (state.level === 0) updateStats(data);
  } catch (err) {
    if (myLoad !== state.loadId) return;
    hide(el.loading);
    el.errorMsg.textContent = `API tidak dapat diakses (${err.message}). Periksa koneksi internet Anda.`;
    show(el.error);
  }
}

/* Statistik hero: jumlah kab & kota dihitung dari seluruh provinsi */
async function updateStats(provinces) {
  $('statProv').textContent = provinces.length;
  try {
    const lists = await Promise.all(provinces.map((p) => getRegion(1, p.id)));
    const all = lists.flat();
    $('statKab').textContent = all.filter((r) => regType(r.name) === 'kabupaten').length;
    $('statKota').textContent = all.filter((r) => regType(r.name) === 'kota').length;
  } catch {
    $('statKab').textContent = '–';
    $('statKota').textContent = '–';
  }
}

/* ---------- FILTER / SORT / SEARCH ---------- */
function getVisibleData() {
  let list = [...state.data];
  if (state.level === 1 && state.type !== 'all') list = list.filter((r) => regType(r.name) === state.type);
  const kw = state.keyword.trim().toLowerCase();
  if (kw) list = list.filter((r) => r.name.toLowerCase().includes(kw) || String(r.id).includes(kw));
  list.sort((a, b) => {
    if (state.sort === 'code') return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    const c = a.name.localeCompare(b.name, 'id');
    return state.sort === 'za' ? -c : c;
  });
  return list;
}

/* ---------- RENDER ---------- */
function render() {
  const lv = LEVELS[state.level];
  el.title.textContent = state.level === 0 ? lv.plural : `${lv.plural} di ${titleCase(state.path[state.level - 1].name)}`;
  renderBreadcrumb();
  renderStepper();
  el.search.placeholder = `Cari ${lv.label.toLowerCase()}...`;
  el.filter.classList.toggle('d-none', state.level !== 1);

  const list = getVisibleData();
  hide(el.empty, el.grid, el.table);

  const total = state.data.length;
  el.info.innerHTML = `Menampilkan <b>${list.length}</b> dari <b>${total}</b> ${lv.label.toLowerCase()}`;

  if (!list.length) {
    el.emptyMsg.textContent = state.keyword
      ? `Tidak ada ${lv.label.toLowerCase()} yang cocok dengan “${state.keyword}”.`
      : `Belum ada data ${lv.label.toLowerCase()}.`;
    show(el.empty);
    return;
  }
  if (state.view === 'grid') { renderGrid(list); show(el.grid); }
  else { renderTable(list); show(el.table); }
}

/* Emoji pengganti inisial */
const EMOJI_SET = [
  ['🏝️', '🌴', '🌋', '🏔️', '🌾', '🏞️', '🌊', '🌅', '🐚', '⛵'],   // provinsi
  ['🌳', '🌾', '🏡', '⛰️', '🌻', '🚜', '🌽', '🦜'],               // kabupaten
  ['🏘️', '🏫', '🌉', '🛕', '⛪', '🕌', '🏥', '🚏'],                // kecamatan
  ['🏡', '🌻', '🌾', '🛖', '🐄', '🌿', '🌺', '🥥'],                // desa
];
const PROVINCE_EMOJI = [
  ['ACEH', '🕌'], ['BALI', '🛕'], ['DKI', '🏙️'], ['YOGYAKARTA', '🏯'], ['PAPUA', '🦜'],
  ['NUSA TENGGARA TIMUR', '🦎'], ['NUSA TENGGARA BARAT', '🏄'], ['MALUKU', '🏝️'],
  ['KALIMANTAN', '🦧'], ['SULAWESI', '⚓'], ['RIAU', '🌊'], ['BANGKA', '🏖️'],
  ['BANTEN', '🌉'], ['GORONTALO', '🐠'], ['SUMATERA', '🐘'], ['LAMPUNG', '🐘'],
  ['JAWA BARAT', '⛰️'], ['JAWA TENGAH', '🌋'], ['JAWA TIMUR', '🌋'], ['JAMBI', '🌴'], ['BENGKULU', '🌺'],
];
function emojiFor(item) {
  const name = item.name.toUpperCase();
  if (state.level === 0) {
    const hit = PROVINCE_EMOJI.find(([k]) => name.includes(k));
    if (hit) return hit[1];
  }
  if (state.level === 1 && regType(item.name) === 'kota') return ['🏙️', '🌆', '🏢', '🚦', '🌇'][Number(item.id) % 5];
  const set = EMOJI_SET[state.level];
  return set[Number(String(item.id).slice(-2)) % set.length];
}
function accentFor(item, i) {
  return state.level === 1 ? (regType(item.name) === 'kota' ? '#d946ef' : '#ec4899') : PALETTE[i % PALETTE.length];
}
function tagFor(item) {
  if (state.level === 1) return regType(item.name) === 'kota' ? 'KOTA' : 'KABUPATEN';
  return LEVELS[state.level].label.toUpperCase();
}

function renderGrid(list) {
  const canDrill = state.level < 3;
  el.grid.innerHTML = list.map((item, i) => {
    const accent = accentFor(item, i);
    return `
      <div class="col-12 col-md-6 col-lg-4 col-xxl-3">
        <div class="wil-card" style="--accent:${accent}; animation-delay:${Math.min(i, 20) * 25}ms"
             data-id="${item.id}" data-action="${canDrill ? 'drill' : 'detail'}" tabindex="0">
          <div class="wil-avatar">${emojiFor(item)}</div>
          <div class="wil-info">
            <p class="wil-name">${escapeHtml(titleCase(item.name))}</p>
            <p class="wil-code"><span class="wil-tag">${tagFor(item)}</span>${formatCode(item.id)}</p>
          </div>
          <div class="wil-actions">
            <button class="icon-btn" data-action="detail" data-id="${item.id}" title="Lihat detail"><i class="bi bi-info-lg"></i></button>
            ${canDrill ? `<button class="icon-btn" data-action="drill" data-id="${item.id}" title="Buka ${LEVELS[state.level].child}"><i class="bi bi-arrow-right"></i></button>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

function renderTable(list) {
  const canDrill = state.level < 3;
  el.table.innerHTML = `
    <div class="table-wrap">
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead><tr><th style="width:60px">No</th><th>Kode</th><th>Nama</th><th>Jenis</th><th class="text-end">Aksi</th></tr></thead>
          <tbody>
            ${list.map((item, i) => `
              <tr data-id="${item.id}" data-action="${canDrill ? 'drill' : 'detail'}">
                <td class="text-secondary">${i + 1}</td>
                <td class="text-secondary">${formatCode(item.id)}</td>
                <td class="fw-semibold"><span class="tbl-emoji">${emojiFor(item)}</span>${escapeHtml(titleCase(item.name))}</td>
                <td><span class="wil-tag" style="--accent:${accentFor(item, i)}">${tagFor(item)}</span></td>
                <td class="text-end">
                  <button class="icon-btn d-inline-grid" data-action="detail" data-id="${item.id}" title="Detail"><i class="bi bi-info-lg"></i></button>
                  ${canDrill ? `<button class="icon-btn d-inline-grid" data-action="drill" data-id="${item.id}" title="Buka"><i class="bi bi-arrow-right"></i></button>` : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderBreadcrumb() {
  const items = [`<li class="breadcrumb-item"><a href="#" data-level="0"><i class="bi bi-house-door-fill"></i> Indonesia</a></li>`];
  state.path.forEach((p, i) => {
    const isLast = i === state.path.length - 1 && state.level === i + 1;
    items.push(isLast
      ? `<li class="breadcrumb-item active">${escapeHtml(titleCase(p.name))}</li>`
      : `<li class="breadcrumb-item"><a href="#" data-level="${i + 1}">${escapeHtml(titleCase(p.name))}</a></li>`);
  });
  el.crumb.innerHTML = items.join('');
}

function renderStepper() {
  el.stepper.querySelectorAll('.step').forEach((btn) => {
    const lv = Number(btn.dataset.level);
    btn.classList.toggle('active', lv === state.level);
    btn.classList.toggle('done', lv < state.level);
    btn.disabled = lv > state.path.length;
  });
}

/* ---------- NAVIGASI ---------- */
function resetControls() {
  state.keyword = '';
  el.search.value = '';
  hide(el.clear);
  state.type = 'all';
  el.filter.value = 'all';
}
function goToLevel(level) {
  state.level = level;
  state.path = state.path.slice(0, level);
  resetControls();
  loadLevel();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function drill(id) {
  const item = state.data.find((d) => String(d.id) === String(id));
  if (!item || state.level >= 3) return;
  state.path = state.path.slice(0, state.level);
  state.path.push({ id: item.id, name: item.name });
  state.level += 1;
  resetControls();
  loadLevel();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- DETAIL (MODAL) ---------- */
const HIER_LABEL = ['Provinsi', 'Kab/Kota', 'Kecamatan', 'Desa/Kel.'];
async function showDetail(id) {
  const item = state.data.find((d) => String(d.id) === String(id));
  if (!item) return;
  const lv = LEVELS[state.level];
  const accent = state.level === 1 ? accentFor(item, 0) : lv.color;
  const chain = [...state.path.slice(0, state.level), { id: item.id, name: item.name }];

  const modalContent = document.querySelector('#detailModal .modal-content');
  modalContent.style.setProperty('--accent', accent);
  $('detailLevel').textContent = state.level === 1 ? (regType(item.name) === 'kota' ? 'Kota' : 'Kabupaten') : lv.label;
  $('detailName').innerHTML = `<span class="detail-emoji">${emojiFor(item)}</span>${escapeHtml(titleCase(item.name))}`;

  const fullAddress = [...chain].reverse().map((c) => titleCase(c.name)).join(', ');
  const hierHtml = chain.map((c, i) => `<span><em>${HIER_LABEL[i]}</em>${escapeHtml(titleCase(c.name))}</span>`).join('');

  $('detailBody').innerHTML = `
    <div class="detail-item"><i class="bi bi-hash"></i><div><small>Kode Wilayah</small><div class="val">${item.id} <span class="text-secondary fw-normal">(${formatCode(item.id)})</span></div></div></div>
    <div class="detail-item"><i class="bi bi-diagram-3"></i><div><small>Hierarki Wilayah</small><div class="hier">${hierHtml}</div></div></div>
    <div class="detail-item"><i class="bi bi-signpost-2"></i><div><small>Alamat Lengkap</small><div class="val">${escapeHtml(fullAddress)}, Indonesia</div></div></div>
    ${lv.child ? `<div class="detail-item"><i class="bi bi-collection"></i><div><small>Jumlah ${lv.child}</small>
        <div class="val" id="childCount"><span class="spinner-border spinner-border-sm"></span> memuat…</div></div></div>` : ''}
  `;

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress + ', Indonesia')}`;
  $('detailFooter').innerHTML = `
    <button class="btn btn-soft" id="copyAddr"><i class="bi bi-clipboard"></i> Salin</button>
    <a class="btn btn-soft" href="${mapsUrl}" target="_blank" rel="noopener"><i class="bi bi-geo-alt"></i> Peta</a>
    ${lv.child ? `<button class="btn btn-primary ms-auto" id="openChild" data-id="${item.id}">Lihat ${lv.child} <i class="bi bi-arrow-right"></i></button>` : ''}
  `;
  $('copyAddr').onclick = async () => {
    try { await navigator.clipboard.writeText(`${fullAddress}, Indonesia`); copyToast.show(); } catch { /* abaikan */ }
  };
  if (lv.child) {
    $('openChild').onclick = () => { detailModal.hide(); drill(item.id); };
  }
  detailModal.show();

  // ambil jumlah anak langsung dari API
  if (lv.child) {
    try {
      const children = await getRegion(state.level + 1, item.id);
      const box = $('childCount');
      if (box) box.textContent = `${children.length} ${lv.child}`;
    } catch {
      const box = $('childCount');
      if (box) box.textContent = 'Gagal memuat jumlah';
    }
  }
}

/* ---------- EVENT ---------- */
function handleListClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const { action, id } = target.dataset;
  if (action === 'detail') { e.stopPropagation(); showDetail(id); }
  else if (action === 'drill') drill(id);
}
el.grid.addEventListener('click', handleListClick);
el.table.addEventListener('click', handleListClick);
el.grid.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleListClick(e);
});

el.search.addEventListener('input', () => {
  state.keyword = el.search.value;
  el.clear.classList.toggle('d-none', !state.keyword);
  if (!el.loading.classList.contains('d-none') || !el.error.classList.contains('d-none')) return;
  render();
});
el.clear.addEventListener('click', () => { el.search.value = ''; state.keyword = ''; hide(el.clear); render(); el.search.focus(); });
el.sort.addEventListener('change', () => { state.sort = el.sort.value; render(); });
el.filter.addEventListener('change', () => { state.type = el.filter.value; render(); });

$('viewGrid').addEventListener('click', () => setView('grid'));
$('viewTable').addEventListener('click', () => setView('table'));
function setView(v) {
  state.view = v;
  $('viewGrid').classList.toggle('active', v === 'grid');
  $('viewTable').classList.toggle('active', v === 'table');
  if (state.data.length) render();
}

el.crumb.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-level]');
  if (!a) return;
  e.preventDefault();
  goToLevel(Number(a.dataset.level));
});
el.stepper.addEventListener('click', (e) => {
  const btn = e.target.closest('.step');
  if (!btn || btn.disabled) return;
  goToLevel(Number(btn.dataset.level));
});
$('brandHome').addEventListener('click', (e) => { e.preventDefault(); goToLevel(0); });
$('retryBtn').addEventListener('click', loadLevel);

/* Tema gelap / terang */
const themeBtn = $('themeToggle');
function applyTheme(t) {
  document.documentElement.setAttribute('data-bs-theme', t);
  themeBtn.innerHTML = t === 'dark' ? '<i class="bi bi-sun-fill"></i>' : '<i class="bi bi-moon-stars-fill"></i>';
  try { localStorage.setItem('wilayah-theme', t); } catch { /* abaikan */ }
}
themeBtn.addEventListener('click', () => {
  applyTheme(document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark');
});
let savedTheme = 'light';
try { savedTheme = localStorage.getItem('wilayah-theme') || 'light'; } catch { /* abaikan */ }
applyTheme(savedTheme);

/* Mulai */
loadLevel();
