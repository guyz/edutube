import { Player } from './player.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NOW = () => Date.now() / 1000;
const DAY = 86400;
const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_STANDALONE = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function fmtDur(s) {
  if (!s && s !== 0) return '';
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function ago(ts) {
  if (!ts) return '';
  const d = NOW() - ts;
  const units = [[365 * DAY, 'year'], [30 * DAY, 'month'], [7 * DAY, 'week'], [DAY, 'day'], [3600, 'hour'], [60, 'minute']];
  for (const [sec, name] of units) {
    const n = Math.floor(d / sec);
    if (n >= 1) return `${n} ${name}${n > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

function fmtViews(n) {
  if (!n) return '';
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M views`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '')}K views`;
  return `${n} view${n === 1 ? '' : 's'}`;
}

function fmtDate(ts) {
  return new Date(ts * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function hashColor(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(h) % 360} 45% 42%)`;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

const ICON = {
  headphones: '<svg viewBox="0 0 24 24"><path d="M12 1a9 9 0 0 0-9 9v7a3 3 0 0 0 3 3h3v-8H5v-2a7 7 0 0 1 14 0v2h-4v8h3a3 3 0 0 0 3-3v-7a9 9 0 0 0-9-9z"/></svg>',
  later: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7z"/></svg>',
  saved: '<svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z"/></svg>',
  yt: '<svg viewBox="0 0 24 24"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3z"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2zM14 3v2h3.6l-9.8 9.8 1.4 1.4L19 6.4V10h2V3z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></svg>',
  fwd: '<svg viewBox="0 0 24 24"><path d="M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/></svg>',
  speed: '<svg viewBox="0 0 24 24"><path d="M20.4 8.6 19 10a8 8 0 0 1-.7 8H5.7A8 8 0 0 1 15.6 6.3l1.4-1.4A10 10 0 0 0 4 19l.3.5h15.4l.3-.5a10 10 0 0 0 .4-10.9zm-10 6.8a2 2 0 0 0 2.8 0l5.7-8.5-8.5 5.7a2 2 0 0 0 0 2.8z"/></svg>',
};

const TOPIC_COLORS = {
  safety: '#ff6b6b', interp: '#c084fc', llm: '#3ea6ff', theory: '#f5a623', security: '#2ecc71',
  crypto: '#14b8a6', policy: '#f472b6', rl: '#a3e635', neuro: '#fb923c',
};

// ---------------------------------------------------------------------------
// Local storage (no login - everything stays on this device)
// ---------------------------------------------------------------------------

const store = {
  get(key, def) {
    try { const v = localStorage.getItem('edutube.' + key); return v ? JSON.parse(v) : def; } catch { return def; }
  },
  set(key, val) {
    try { localStorage.setItem('edutube.' + key, JSON.stringify(val)); } catch { /* storage full or blocked */ }
  },
};

const state = {
  progress: store.get('progress', {}), // id -> {t, d, at, done}
  later: store.get('later', []),
  history: store.get('history', []),
  prefs: Object.assign({ autoplay: false, theme: 'system' }, store.get('prefs', {})),
  // Playback speed is global across videos for this session, like YouTube.
  rate: (() => { try { return parseFloat(sessionStorage.getItem('edutube.rate')) || 1; } catch { return 1; } })(),
};

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function setRate(r, { fromPlayer = false } = {}) {
  state.rate = r;
  try { sessionStorage.setItem('edutube.rate', String(r)); } catch { /* private mode */ }
  if (!fromPlayer) player.setRate(r);
  const sel = document.getElementById('rate-sel');
  if (sel) {
    if (![...sel.options].some((o) => parseFloat(o.value) === r)) sel.add(new Option(`${r}×`, String(r)));
    sel.value = String(r);
  }
}

function saveProgress() { store.set('progress', state.progress); }
function savePrefs() { store.set('prefs', state.prefs); }

function applyTheme() {
  const t = state.prefs.theme;
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}
applyTheme();

function progressPct(it) {
  const p = state.progress[it.id];
  if (!p) return 0;
  if (p.done) return 100;
  const d = p.d || it.dur;
  return d ? Math.min(100, Math.max(2, (p.t / d) * 100)) : 0;
}

function resumeAt(it) {
  const p = state.progress[it.id];
  if (!p || p.done || p.t < 20) return 0;
  const d = p.d || it.dur;
  if (d && p.t > d - 30) return 0;
  return p.t;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

let CAT = null;
const byId = new Map();
const srcById = new Map();
let VIDEOS = [];
let PODS = [];

async function loadCatalog() {
  const res = await fetch('data/catalog.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`catalog: HTTP ${res.status}`);
  CAT = await res.json();
  for (const s of CAT.sources) srcById.set(s.id, s);
  for (const it of CAT.items) {
    byId.set(it.id, it);
    const s = srcById.get(it.src);
    it._hay = [it.title, s?.name, it.desc, (it.topics || []).map((t) => CAT.topics[t]).join(' '), CAT.formats[it.fmt] || 'podcast']
      .join(' ').toLowerCase();
  }
  VIDEOS = CAT.items.filter((x) => x.type === 'video');
  PODS = CAT.items.filter((x) => x.type === 'podcast');
}

const src = (id) => srcById.get(id) || { id, name: id };

// Default ("For you") ranking. Each item gets a score from:
//   freshness   - newer talks score higher (halves roughly every 3.5 months)
//   shuffle     - a random number that changes every app visit (or on "Shuffle")
//   interests   - topics and channels you have watched before
//   popularity  - a small boost for widely viewed talks
// minus a penalty for talks you already finished. The result is then diversified.
let SEED = 0;
try { SEED = parseInt(sessionStorage.getItem('edutube.seed'), 10) || 0; } catch { /* private mode */ }
if (!SEED) reseed();

function reseed() {
  SEED = (Math.random() * 2 ** 31) | 0 || 1;
  try { sessionStorage.setItem('edutube.seed', String(SEED)); } catch { /* private mode */ }
  return SEED;
}

function rand01(id) {
  // Stable per (item, seed): the order doesn't jump around while you browse.
  let h = SEED ^ 0x9e3779b9;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function interestProfile() {
  const topics = new Map();
  const sources = new Map();
  const seen = [...new Set([...state.history.slice(0, 80), ...Object.keys(state.progress)])];
  for (const id of seen) {
    const it = byId.get(id);
    if (!it) continue;
    for (const t of it.topics || []) topics.set(t, (topics.get(t) || 0) + 1);
    sources.set(it.src, (sources.get(it.src) || 0) + 1);
  }
  const tMax = Math.max(1, ...topics.values());
  const sMax = Math.max(1, ...sources.values());
  return { topics, sources, tMax, sMax, n: seen.length };
}

function recommend(list) {
  const prof = interestProfile();
  const now = NOW();
  const scored = list.map((it) => {
    const age = Math.max(0, (now - it.pub) / DAY);
    const fresh = Math.exp(-age / 150);
    let aff = 0;
    if (prof.n) {
      for (const t of it.topics || []) aff = Math.max(aff, (prof.topics.get(t) || 0) / prof.tMax);
      aff = 0.7 * aff + 0.3 * ((prof.sources.get(it.src) || 0) / prof.sMax);
    }
    const pop = it.views ? Math.min(1, Math.log10(it.views + 1) / 5) : 0.3;
    const done = state.progress[it.id]?.done ? 1.5 : 0;
    return [1.0 * fresh + 1.0 * rand01(it.id) + 0.5 * aff + 0.2 * pop - done, it];
  });
  scored.sort((a, b) => b[0] - a[0]);
  return diversify(scored.map((x) => x[1]));
}

// Keep the default feed varied: no source may fill more than 2 of any 8 consecutive slots.
function diversify(list, maxRun = 2, windowSize = 8) {
  const out = [];
  const pending = [];
  const recent = new Map();
  const ok = (it) => (recent.get(it.src) || 0) < maxRun;
  const push = (it) => {
    out.push(it);
    recent.set(it.src, (recent.get(it.src) || 0) + 1);
    if (out.length > windowSize) {
      const old = out[out.length - 1 - windowSize];
      recent.set(old.src, recent.get(old.src) - 1);
    }
  };
  let i = 0;
  while (out.length < list.length) {
    const j = pending.findIndex(ok);
    if (j >= 0) { push(pending.splice(j, 1)[0]); continue; }
    if (i < list.length) {
      const it = list[i++];
      if (ok(it)) push(it); else pending.push(it);
    } else {
      push(pending.shift());
    }
  }
  return out;
}

const LENGTHS = { short: [0, 20 * 60], medium: [20 * 60, 60 * 60], long: [60 * 60, Infinity] };
const WHEN = { week: 7, month: 31, year: 366 };

function applyFilters(list, q) {
  let out = list;
  if (q.topic) out = out.filter((x) => x.topics && x.topics.includes(q.topic));
  if (q.fmt) out = out.filter((x) => x.fmt === q.fmt);
  if (q.len && LENGTHS[q.len]) {
    const [a, b] = LENGTHS[q.len];
    out = out.filter((x) => x.dur && x.dur >= a && x.dur < b);
  }
  if (q.when && WHEN[q.when]) {
    const since = NOW() - WHEN[q.when] * DAY;
    out = out.filter((x) => x.pub >= since);
  }
  return out;
}

function sortList(list, sort) {
  const out = list.slice();
  if (sort === 'views') out.sort((a, b) => (b.views || 0) - (a.views || 0));
  else if (sort === 'oldest') out.sort((a, b) => a.pub - b.pub);
  else if (sort === 'longest') out.sort((a, b) => (b.dur || 0) - (a.dur || 0));
  else out.sort((a, b) => b.pub - a.pub);
  return out;
}

function search(query, list) {
  // Substring matching, so dropping a plural "s" also matches the singular.
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    .map((t) => (t.length > 4 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
  if (!terms.length) return [];
  const scored = [];
  for (const it of list) {
    let ok = true;
    for (const t of terms) if (!it._hay.includes(t)) { ok = false; break; }
    if (!ok) continue;
    const title = it.title.toLowerCase();
    const sname = src(it.src).name.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (title.includes(t)) score += 4;
      if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(title)) score += 2;
      if (sname.includes(t)) score += 3;
    }
    if (title.includes(query.toLowerCase())) score += 6;
    score += Math.max(0, 2 - (NOW() - it.pub) / (365 * DAY)); // mild recency boost
    scored.push([score, it]);
  }
  scored.sort((a, b) => b[0] - a[0] || b[1].pub - a[1].pub);
  return scored.map((x) => x[1]);
}

// ---------------------------------------------------------------------------
// Rendering bits
// ---------------------------------------------------------------------------

function thumbUrl(it, small = false) {
  if (it.type === 'podcast') return src(it.src).avatar || '';
  return `https://i.ytimg.com/vi/${it.id}/${small ? 'mqdefault' : 'hqdefault'}.jpg`;
}

function avatarHtml(s, cls = 'avatar') {
  if (s.avatar) return `<span class="${cls}"><img src="${esc(s.avatar)}" alt="" loading="lazy"></span>`;
  return `<span class="${cls}" style="background:${hashColor(s.name || s.id)}">${esc((s.name || '?').trim()[0])}</span>`;
}

function thumbHtml(it, small = false) {
  const p = progressPct(it);
  let inner;
  if (it.type === 'podcast') {
    const u = esc(thumbUrl(it));
    inner = `<div class="pod-thumb-bg" style="background-image:url('${u}')"></div><img class="pod-thumb-art" src="${u}" alt="" loading="lazy">`
      + `<span class="badge left">${ICON.headphones}Podcast</span>`;
  } else {
    inner = `<img src="${thumbUrl(it, small)}" alt="" loading="lazy">`;
  }
  return `<div class="thumb">${inner}${it.dur ? `<span class="badge">${fmtDur(it.dur)}</span>` : ''}`
    + `${p ? `<div class="progress"><i style="width:${p}%"></i></div>` : ''}</div>`;
}

function subLine(it) {
  return [fmtViews(it.views), ago(it.pub)].filter(Boolean).join(' • ');
}

function cardHtml(it) {
  const s = src(it.src);
  const fmt = it.type === 'video' ? CAT.formats[it.fmt] : '';
  return `<a class="card" href="#/watch/${esc(it.id)}">${thumbHtml(it)}
    <div class="meta">${avatarHtml(s)}<div class="meta-text">
      <h3 class="title">${esc(it.title)}</h3>
      <div class="sub"><div class="line">${esc(s.name)}</div><div class="line">${esc(subLine(it))}</div>
      ${fmt && it.fmt !== 'talk' ? `<span class="tag">${esc(fmt)}</span>` : ''}</div>
    </div></div></a>`;
}

function compactHtml(it) {
  const s = src(it.src);
  return `<a class="compact" href="#/watch/${esc(it.id)}">${thumbHtml(it, true)}
    <div class="meta-text"><h3 class="title">${esc(it.title)}</h3>
    <div class="sub"><div class="line">${esc(s.name)}</div><div class="line">${esc(subLine(it))}</div></div></div></a>`;
}

function rowHtml(it) {
  const s = src(it.src);
  return `<a class="row" href="#/watch/${esc(it.id)}">${thumbHtml(it)}
    <div class="meta-text"><h3 class="title">${esc(it.title)}</h3>
    <div class="sub"><div class="line">${esc(s.name)} • ${esc(subLine(it))}</div></div>
    ${it.desc ? `<div class="desc">${esc(it.desc)}</div>` : ''}</div></a>`;
}

// Infinite list: renders `page` items now and more as the sentinel scrolls into view.
let activeObserver = null;
function infinite(container, list, render, page = 36) {
  if (activeObserver) activeObserver.disconnect();
  let n = 0;
  const sentinel = document.createElement('div');
  sentinel.className = 'sentinel';
  const more = () => {
    const chunk = list.slice(n, n + page);
    n += chunk.length;
    container.insertAdjacentHTML('beforeend', chunk.map(render).join(''));
    if (n >= list.length) { activeObserver && activeObserver.disconnect(); sentinel.remove(); }
  };
  more();
  if (n < list.length) {
    container.after(sentinel);
    activeObserver = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) more();
    }, { rootMargin: '1200px' });
    activeObserver.observe(sentinel);
  }
}

function emptyHtml(title, text) {
  return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  return { parts, q };
}

function hrefWith(base, q) {
  const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v));
  const s = params.toString();
  return `#/${base}${s ? '?' + s : ''}`;
}

const view = $('#view');
let currentRoute = '';

function route() {
  const { parts, q } = parseHash();
  const name = parts[0] || 'home';
  const watching = name === 'watch';
  document.body.classList.toggle('watching', watching);
  document.body.classList.remove('side-open', 'searching');
  if (activeObserver) { activeObserver.disconnect(); activeObserver = null; }
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
  const sameWatch = watching && currentRoute === `watch/${parts[1]}`;
  currentRoute = parts.join('/');
  if (!sameWatch) window.scrollTo(0, 0);
  if (name !== 'search') $('#search').value = '';
  if (!watching) document.title = 'EduTube';

  try {
    if (name === 'home') renderHome(q);
    else if (name === 'search') renderSearch(q);
    else if (name === 'watch') renderWatch(parts[1], q);
    else if (name === 'podcasts') renderPodcasts(q);
    else if (name === 'explore') renderExplore();
    else if (name === 'library') renderLibrary();
    else if (name === 'source') renderSource(parts[1], q);
    else view.innerHTML = emptyHtml('Page not found', 'Try the home page.');
  } catch (e) {
    console.error(e);
    view.innerHTML = emptyHtml('Something went wrong', e.message);
  }
  syncDock();
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function chipsHtml(base, q) {
  const chip = (label, topic, extra = '') =>
    `<a class="chip ${(q.topic || '') === topic ? 'active' : ''}" href="${hrefWith(base, { ...q, topic })}">${extra}${esc(label)}</a>`;
  return `<div class="chips">${chip('All', '')}${Object.entries(CAT.topics).map(([k, v]) => chip(v, k)).join('')}
    ${base === '' ? `<a class="chip" href="#/podcasts">${ICON.headphones.replace('<svg', '<svg style="width:18px;height:18px"')}Podcasts</a>` : ''}</div>`;
}

function filtersHtml(q, count, { sorts = true, relevance = false, shuffle = false } = {}) {
  const opt = (v, label, cur) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${esc(label)}</option>`;
  const fmts = Object.entries(CAT.formats).filter(([k]) => k !== 'podcast');
  return `<div class="filters">
    ${shuffle ? '<button class="shuffle-btn" data-shuffle aria-label="Shuffle the feed"><svg viewBox="0 0 24 24"><path d="M10.6 9.2 5.4 4 4 5.4l5.2 5.2zM14.5 4l2 2L4 18.6 5.4 20 18 7.5l2 2V4zm.3 9.4-1.4 1.4 3.1 3.1-2 2H20v-5.5l-2 2z"/></svg>Shuffle</button>' : ''}
    <select data-q="fmt" aria-label="Format">${opt('', 'All formats', q.fmt || '')}${fmts.map(([k, v]) => opt(k, v, q.fmt)).join('')}</select>
    <select data-q="len" aria-label="Length">${opt('', 'Any length', q.len || '')}${opt('short', 'Under 20 min', q.len)}${opt('medium', '20–60 min', q.len)}${opt('long', 'Over 1 hour', q.len)}</select>
    <select data-q="when" aria-label="Upload date">${opt('', 'Any time', q.when || '')}${opt('week', 'This week', q.when)}${opt('month', 'This month', q.when)}${opt('year', 'This year', q.when)}</select>
    ${sorts ? `<select data-q="sort" aria-label="Sort">${relevance ? opt('', 'Relevance', q.sort || '') : opt('', 'For you (shuffled)', q.sort || '')}${opt('newest', 'Newest', q.sort)}${opt('views', 'Most viewed', q.sort)}${opt('longest', 'Longest', q.sort)}${opt('oldest', 'Oldest', q.sort)}</select>` : ''}
    <span class="count">${count.toLocaleString()} result${count === 1 ? '' : 's'}</span>
  </div>`;
}

function bindFilters(base, q) {
  const sh = view.querySelector('[data-shuffle]');
  if (sh) sh.addEventListener('click', () => { reseed(); route(); });
  view.querySelectorAll('.filters select').forEach((sel) => {
    sel.addEventListener('change', () => {
      const next = { ...q, [sel.dataset.q]: sel.value };
      history.replaceState(null, '', hrefWith(base, next));
      route();
    });
  });
}

function renderHome(q) {
  const filtered = !!(q.topic || q.fmt || q.len || q.when || q.sort);
  let list = applyFilters(VIDEOS, q);
  list = q.sort ? sortList(list, q.sort) : recommend(list);
  let html = chipsHtml('', q) + filtersHtml(q, list.length, { shuffle: !q.sort });

  if (!filtered) {
    const cont = continueList().slice(0, 12);
    if (cont.length) html += shelfHtml('Continue watching', cont, '#/library');
    const fresh = diversify(sortList(VIDEOS.filter((x) => x.pub >= NOW() - 7 * DAY && !x.approx), 'newest'));
    const freshList = fresh.length >= 4 ? fresh : diversify(sortList(VIDEOS.filter((x) => x.pub >= NOW() - 14 * DAY), 'newest'));
    if (freshList.length) html += shelfHtml(fresh.length >= 4 ? 'New this week' : 'New in the last two weeks', freshList.slice(0, 24), hrefWith('', { when: 'week', sort: 'newest' }));
    html += shelfHtml('Latest podcast episodes', diversify(sortList(PODS, 'newest'), 1, 4).slice(0, 12), '#/podcasts');
    html += `<div class="shelf-head"><h2>All talks</h2></div>`;
  }
  html += `<div class="grid" id="grid"></div>`;
  view.innerHTML = html;
  bindFilters('', q);
  if (!list.length) $('#grid').outerHTML = emptyHtml('Nothing matches these filters', 'Try removing a filter.');
  else infinite($('#grid'), list, cardHtml);
}

function shelfHtml(title, list, moreHref) {
  return `<section class="shelf"><div class="shelf-head"><h2>${esc(title)}</h2>${moreHref ? `<a href="${moreHref}">See all</a>` : ''}</div>
    <div class="shelf-row">${list.map(cardHtml).join('')}</div></section>`;
}

function continueList() {
  return Object.entries(state.progress)
    .filter(([id, p]) => !p.done && p.t >= 20 && byId.has(id))
    .sort((a, b) => b[1].at - a[1].at)
    .map(([id]) => byId.get(id));
}

function renderSearch(q) {
  const query = (q.q || '').trim();
  $('#search').value = query;
  let list = applyFilters(search(query, CAT.items), q);
  if (q.sort) list = sortList(list, q.sort);
  view.innerHTML = `<div class="page-head"><div><h1>“${esc(query)}”</h1></div></div>` + filtersHtml(q, list.length, { relevance: true })
    + `<div class="rows" id="rows"></div>`;
  bindFilters('search', q);
  if (!list.length) $('#rows').outerHTML = emptyHtml('No results', 'Try fewer or different words - e.g. a speaker, venue or topic.');
  else infinite($('#rows'), list, rowHtml, 30);
}

function renderPodcasts(q) {
  const style = q.style || '';
  const shows = CAT.sources.filter((s) => s.type === 'podcast');
  let list = sortList(PODS, 'newest');
  if (style) list = list.filter((x) => src(x.src).style === style);
  if (q.show) list = list.filter((x) => x.src === q.show);
  const chip = (label, val) => `<a class="chip ${style === val && !q.show ? 'active' : ''}" href="${hrefWith('podcasts', { style: val })}">${esc(label)}</a>`;
  const showList = (st) => shows.filter((s) => s.style === st).map((s) =>
    `<a class="src-item" href="${hrefWith('podcasts', { show: s.id })}">${avatarHtml(s)}<div><b>${esc(s.name)}</b><span>${s.count} episodes</span></div></a>`).join('');
  view.innerHTML = `<div class="page-head"><div><h1>Podcasts</h1><p>Audio plays in the background and on the lock screen.</p></div></div>
    <div class="chips">${chip('All episodes', '')}${chip('Academic interviews', 'academic')}${chip('Business & casual', 'casual')}</div>
    ${q.show ? `<h2 class="section">${esc(src(q.show).name)} <a class="text-btn" style="font-size:14px" href="#/podcasts">Show all</a></h2>` : `
    <h2 class="section">Academic interviews</h2><div class="src-list">${showList('academic')}</div>
    <h2 class="section">Business & casual</h2><div class="src-list">${showList('casual')}</div>
    <h2 class="section">Latest episodes</h2>`}
    <div class="rows" id="rows"></div>`;
  infinite($('#rows'), list, rowHtml, 30);
}

function renderExplore() {
  const topicCount = (k) => VIDEOS.filter((x) => x.topics.includes(k)).length;
  const fmtCount = (k) => VIDEOS.filter((x) => x.fmt === k).length;
  const talks = CAT.sources.filter((s) => s.type === 'youtube' && s.count).sort((a, b) => a.name.localeCompare(b.name));
  const pods = CAT.sources.filter((s) => s.type === 'podcast' && s.count);
  view.innerHTML = `<div class="page-head"><div><h1>Explore</h1><p>${VIDEOS.length.toLocaleString()} talks from ${talks.length} channels, ${PODS.length} podcast episodes. Updated ${fmtDate(Date.parse(CAT.updated) / 1000)}.</p></div></div>
    <h2 class="section">Topics</h2><div class="tiles">${Object.entries(CAT.topics).map(([k, v]) =>
      `<a class="tile" style="--c:${TOPIC_COLORS[k]}" href="${hrefWith('', { topic: k })}"><b>${esc(v)}</b><span>${topicCount(k).toLocaleString()} talks</span></a>`).join('')}</div>
    <h2 class="section">Formats</h2><div class="tiles">${Object.entries(CAT.formats).filter(([k]) => fmtCount(k)).map(([k, v]) =>
      `<a class="tile" style="--c:var(--fg-3)" href="${hrefWith('', { fmt: k, sort: 'newest' })}"><b>${esc(v)}</b><span>${fmtCount(k).toLocaleString()} talks</span></a>`).join('')}</div>
    <h2 class="section">Channels & venues</h2><div class="src-list">${talks.map((s) =>
      `<a class="src-item" href="#/source/${esc(s.id)}">${avatarHtml(s)}<div><b>${esc(s.name)}</b><span>${s.count.toLocaleString()} talks</span></div></a>`).join('')}</div>
    <h2 class="section">Podcasts</h2><div class="src-list">${pods.map((s) =>
      `<a class="src-item" href="${hrefWith('podcasts', { show: s.id })}">${avatarHtml(s)}<div><b>${esc(s.name)}</b><span>${s.style === 'casual' ? 'Business & casual' : 'Academic'} • ${s.count} episodes</span></div></a>`).join('')}</div>`;
}

function renderSource(id, q) {
  const s = srcById.get(id);
  if (!s) { view.innerHTML = emptyHtml('Unknown channel', ''); return; }
  if (s.type === 'podcast') { location.replace(hrefWith('podcasts', { show: id })); return; }
  let list = applyFilters(VIDEOS.filter((x) => x.src === id), q);
  list = sortList(list, q.sort || 'newest');
  view.innerHTML = `<div class="page-head">${avatarHtml(s)}<div><h1>${esc(s.name)}</h1>
      <p>${s.count.toLocaleString()} talks • <a class="text-btn" href="${esc(s.url)}" target="_blank" rel="noopener">Open on YouTube</a></p></div></div>
    ${filtersHtml(q, list.length)}<div class="grid" id="grid"></div>`;
  view.querySelector('.filters select[data-q=sort] option[value=""]').remove();
  bindFilters(`source/${id}`, q);
  if (!list.length) $('#grid').outerHTML = emptyHtml('Nothing matches these filters', '');
  else infinite($('#grid'), list, cardHtml);
}

function renderLibrary() {
  const cont = continueList();
  const later = state.later.map((id) => byId.get(id)).filter(Boolean);
  const hist = state.history.map((id) => byId.get(id)).filter(Boolean);
  const sec = (title, list, act, emptyText) => `<h2 class="section">${esc(title)} ${list.length && act ? `<button class="text-btn" style="font-size:14px;margin-left:8px" data-clear="${act}">Clear</button>` : ''}</h2>
    ${list.length ? `<div class="grid lib-grid">${list.slice(0, 48).map(cardHtml).join('')}</div>` : `<p class="note lib-pad">${esc(emptyText)}</p>`}`;
  view.innerHTML = `<div class="page-head"><div><h1>Library</h1><p>Saved on this device only - no account needed.</p></div></div>
    ${sec('Continue watching', cont, '', 'Talks you start will show up here so you can resume where you left off.')}
    ${sec('Watch later', later, 'later', 'Tap “Save” on any talk to keep it here.')}
    ${sec('History', hist, 'history', 'Nothing watched yet.')}
    <h2 class="section">Settings</h2>
    <div class="filters lib-pad">
      <label>Theme&nbsp;<select id="theme-sel">${['system', 'dark', 'light'].map((t) => `<option value="${t}" ${state.prefs.theme === t ? 'selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></label>
      <label class="switch"><input type="checkbox" id="autoplay-set" ${state.prefs.autoplay ? 'checked' : ''}> Autoplay next</label>
    </div>
    <div class="lib-pad">${backgroundHelpHtml(true)}</div>`;
  view.querySelectorAll('[data-clear]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.clear;
    if (k === 'later') { state.later = []; store.set('later', []); }
    if (k === 'history') { state.history = []; store.set('history', []); state.progress = {}; saveProgress(); }
    renderLibrary();
  }));
  $('#theme-sel').addEventListener('change', (e) => { state.prefs.theme = e.target.value; savePrefs(); applyTheme(); });
  $('#autoplay-set').addEventListener('change', (e) => { state.prefs.autoplay = e.target.checked; savePrefs(); });
}

function backgroundHelpHtml(open = false) {
  return `<details class="help-box" ${open ? 'open' : ''}><summary><b>Listening while you do other things (iPhone)</b></summary>
    <ol>
      <li><b>Podcasts</b> keep playing with the screen off or in other apps, with lock-screen controls.</li>
      <li><b>Talks:</b> YouTube's player blocks the floating mini screen (picture-in-picture) and background play on
        iPhone when a video is embedded in another site, unless you have Premium - this is in YouTube's own player code,
        so no website can switch it off.</li>
      <li><b>Mini screen:</b> tap <b>YouTube app</b> under the talk. It opens in the YouTube app at the same moment, where
        picture-in-picture works.</li>
      <li><b>Audio only:</b> if the talk pauses when you switch apps, press ▶ on the Lock Screen or in Control Center and it keeps playing.</li>
    </ol></details>`;
}

// ---------------------------------------------------------------------------
// Watch page
// ---------------------------------------------------------------------------

let upNext = [];

function related(it) {
  const scores = [];
  const topics = new Set(it.topics || []);
  const pool = it.type === 'podcast' ? PODS : VIDEOS;
  for (const x of pool) {
    if (x.id === it.id) continue;
    let s = 0;
    if (x.src === it.src) s += it.type === 'podcast' ? 6 : 2.5;
    for (const t of x.topics || []) if (topics.has(t)) s += 1.5;
    if (x.fmt === it.fmt) s += 0.5;
    s += Math.max(0, 1.5 - (NOW() - x.pub) / (365 * DAY)); // favour recent
    if (state.progress[x.id]?.done) s -= 4;
    scores.push([s, x]);
  }
  scores.sort((a, b) => b[0] - a[0]);
  const top = scores.slice(0, 60).map((x) => x[1]);
  return diversify(top, 3, 8).slice(0, 24);
}

function renderWatch(id, q) {
  const it = byId.get(id);
  if (!it) { view.innerHTML = emptyHtml('This talk is no longer in the catalog', 'It may have been removed by its uploader.'); return; }
  const s = src(it.src);
  const saved = state.later.includes(id);
  const tags = [it.type === 'video' && CAT.formats[it.fmt] ? `<a href="${hrefWith('', { fmt: it.fmt, sort: 'newest' })}">#${esc(CAT.formats[it.fmt].replace(/\s+/g, ''))}</a>` : '',
    ...(it.topics || []).map((t) => `<a href="${hrefWith('', { topic: t })}">#${esc(CAT.topics[t].replace(/[\s&]+/g, ''))}</a>`)].join('');
  const extUrl = it.type === 'video' ? `https://www.youtube.com/watch?v=${it.id}` : (it.link || it.audio);
  const rates = RATES.includes(state.rate) ? RATES : [...RATES, state.rate].sort((a, b) => a - b);
  const date = it.approx ? ago(it.pub) : fmtDate(it.pub);

  upNext = related(it);
  view.innerHTML = `<div class="watch-info">
      <h1 class="watch-title">${esc(it.title)}</h1>
      <div class="watch-bar">
        <a class="channel" href="${s.type === 'podcast' ? hrefWith('podcasts', { show: s.id }) : `#/source/${esc(s.id)}`}">${avatarHtml(s)}<div><b>${esc(s.name)}</b><span>${(s.count || 0).toLocaleString()} ${s.type === 'podcast' ? 'episodes' : 'talks'}</span></div></a>
        <div class="pills">
          <button class="pill" data-w="back" aria-label="Back 15 seconds">${ICON.back}15s</button>
          <button class="pill" data-w="fwd" aria-label="Forward 30 seconds">${ICON.fwd}30s</button>
          <label class="pill">${ICON.speed}<select id="rate-sel" aria-label="Playback speed">${rates.map((r) => `<option value="${r}" ${state.rate === r ? 'selected' : ''}>${r}×</option>`).join('')}</select></label>
          <button class="pill ${saved ? 'on' : ''}" data-w="later">${saved ? ICON.saved + 'Saved' : ICON.later + 'Save'}</button>
          <button class="pill" data-w="share">${ICON.share}Share</button>
          <a class="pill" href="${esc(extUrl)}" target="_blank" rel="noopener" id="ext-link">${it.type === 'video' ? ICON.yt + (IS_IOS ? 'YouTube app' : 'YouTube') : ICON.link + 'Episode page'}</a>
        </div>
      </div>
      <div class="desc-box ${it.desc && it.desc.length > 220 ? 'clamped' : ''}">
        <div class="stats">${esc([fmtViews(it.views), date, it.dur ? fmtDur(it.dur) : ''].filter(Boolean).join('  •  '))}</div>
        ${tags ? `<div class="tags">${tags}</div>` : ''}
        <div class="desc-body">${it.desc ? linkify(esc(it.desc)) : `<span class="note">No description. <a class="text-btn" href="${esc(extUrl)}" target="_blank" rel="noopener">See it on ${it.type === 'video' ? 'YouTube' : 'the episode page'}</a>.</span>`}</div>
        ${it.desc && it.desc.length > 220 ? '<button class="more" data-w="more">Show more</button>' : ''}
      </div>
      ${IS_IOS && it.type === 'video' ? backgroundHelpHtml() : ''}
    </div>
    <aside class="watch-side">
      <div class="side-head"><h3>Up next</h3><label class="switch">Autoplay <input type="checkbox" id="autoplay" ${state.prefs.autoplay ? 'checked' : ''}></label></div>
      ${upNext.map(compactHtml).join('')}
    </aside>`;

  view.querySelector('.watch-bar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-w]');
    if (!b) return;
    const w = b.dataset.w;
    if (w === 'back') player.skip(-15);
    if (w === 'fwd') player.skip(30);
    if (w === 'later') {
      const i = state.later.indexOf(id);
      if (i >= 0) state.later.splice(i, 1); else state.later.unshift(id);
      store.set('later', state.later);
      const on = i < 0;
      b.classList.toggle('on', on);
      b.innerHTML = on ? ICON.saved + 'Saved' : ICON.later + 'Save';
      toast(on ? 'Saved to Watch later' : 'Removed from Watch later');
    }
    if (w === 'share') share(it);
  });
  const more = view.querySelector('[data-w=more]');
  if (more) more.addEventListener('click', () => {
    const box = view.querySelector('.desc-box');
    box.classList.toggle('clamped');
    more.textContent = box.classList.contains('clamped') ? 'Show more' : 'Show less';
  });
  $('#rate-sel').addEventListener('change', (e) => setRate(parseFloat(e.target.value)));
  $('#autoplay').addEventListener('change', (e) => { state.prefs.autoplay = e.target.checked; savePrefs(); });
  $('#ext-link').addEventListener('click', () => {
    if (it.type === 'video' && player.item?.id === it.id) {
      const t = Math.floor(player.time());
      $('#ext-link').href = `https://www.youtube.com/watch?v=${it.id}${t > 5 ? `&t=${t}s` : ''}`;
      player.pause();
    }
  });

  // Start (or keep) playback.
  if (player.item?.id !== id) {
    const start = q.t ? parseInt(q.t, 10) : resumeAt(it);
    state.history = [id, ...state.history.filter((x) => x !== id)].slice(0, 300);
    store.set('history', state.history);
    player.rate = state.rate;
    player.load(it, { start, autoplay: true }).then(syncDock);
  }
  document.title = `${it.title} - EduTube`;
}

function linkify(html) {
  return html.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a class="text-btn" href="$1" target="_blank" rel="noopener">$1</a>');
}

async function share(it) {
  const url = `${location.origin}${location.pathname}#/watch/${it.id}`;
  if (navigator.share) {
    try { await navigator.share({ title: it.title, url }); } catch { /* cancelled */ }
    return;
  }
  try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); }
}

// ---------------------------------------------------------------------------
// Player + dock
// ---------------------------------------------------------------------------

const dock = $('#dock');
let lastSave = 0;

const player = new Player({
  dock,
  audio: $('#audio'),
  describe: (it) => ({ title: it.title, artist: src(it.src).name, artwork: new URL(src(it.src).avatar || 'icons/icon-512.png', location.href).href }),
  onTime(it, t, d, ended) {
    if (!it) return;
    const p = state.progress[it.id] || {};
    p.t = ended ? 0 : t;
    if (d) p.d = d;
    p.at = Date.now();
    if (ended || (d && t > d - 30 && d > 60)) p.done = true;
    else if (t > 5) p.done = false;
    state.progress[it.id] = p;
    const now = Date.now();
    if (ended || now - lastSave > 5000) { lastSave = now; saveProgress(); }
    updateDockTime(t, d);
  },
  onEnded(it) {
    saveProgress();
    if (!state.prefs.autoplay || !it) return;
    const next = upNext.find((x) => !state.progress[x.id]?.done) || upNext[0];
    if (!next) return;
    if (currentRoute.startsWith('watch/')) location.hash = `#/watch/${next.id}`;
    else { player.rate = state.rate; player.load(next, { start: resumeAt(next) }).then(syncDock); upNext = related(next); }
  },
  onState(ev) {
    if (ev && ev.rate) setRate(ev.rate, { fromPlayer: true }); // changed in YouTube's own menu
    saveProgress();
  },
  onError(msg, it) {
    toast(msg);
    if (it && it.type === 'video') {
      const box = view.querySelector('.desc-box');
      if (box && !view.querySelector('.play-error')) {
        box.insertAdjacentHTML('beforebegin', `<div class="help-box play-error"><b>${esc(msg)}</b> <a class="text-btn" href="https://www.youtube.com/watch?v=${esc(it.id)}" target="_blank" rel="noopener">Watch on YouTube</a></div>`);
      }
    }
  },
});

function updateDockTime(t, d) {
  const pct = d ? (t / d) * 100 : 0;
  $('.mini-progress i', dock).style.width = `${pct}%`;
  if (player.kind === 'audio') {
    $('.t-cur', dock).textContent = fmtDur(t);
    $('.t-dur', dock).textContent = fmtDur(d);
    const bar = $('.seek-bar', dock);
    if (!bar.matches(':active')) bar.value = d ? Math.round((t / d) * 1000) : 0;
  }
}

function syncDock() {
  const it = player.item;
  const watching = document.body.classList.contains('watching');
  document.body.classList.toggle('mini', !!it && !watching);
  if (!it) { dock.hidden = true; return; }
  dock.hidden = false;
  const s = src(it.src);
  $('.mini-title', dock).textContent = it.title;
  $('.mini-sub', dock).textContent = s.name;
  const stage = $('#pod-stage');
  stage.hidden = player.kind !== 'audio';
  if (player.kind === 'audio') {
    const art = s.avatar || 'icons/icon-512.png';
    $('.pod-art', stage).src = art;
    $('.pod-bg', stage).style.backgroundImage = `url('${art}')`;
  }
  // Watching a different item than the one in the dock (e.g. a removed id): keep it simple.
  if (watching && currentRoute !== `watch/${it.id}`) document.body.classList.add('mini');
}

dock.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'toggle') player.toggle();
  if (act === 'back') player.skip(-15);
  if (act === 'fwd') player.skip(30);
  if (act === 'close') { saveProgress(); player.stop(); syncDock(); }
  if (act === 'expand' && player.item) location.hash = `#/watch/${player.item.id}`;
});
$('.seek-bar', dock).addEventListener('input', (e) => {
  const d = player.duration();
  if (d) player.seek((e.target.value / 1000) * d);
});

// ---------------------------------------------------------------------------
// Chrome: search, sidebar, keyboard
// ---------------------------------------------------------------------------

$('#search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#search').value.trim();
  if (v) location.hash = hrefWith('search', { q: v });
  $('#search').blur();
});
$('#search-open').addEventListener('click', () => {
  document.body.classList.add('searching');
  $('#search').focus();
});
$('#search').addEventListener('blur', () => {
  setTimeout(() => { if (!$('#search').value) document.body.classList.remove('searching'); }, 150);
});
$('#menu-btn').addEventListener('click', () => {
  if (window.innerWidth > 1312) document.body.classList.toggle('side-collapsed');
  else document.body.classList.toggle('side-open');
});
document.addEventListener('click', (e) => {
  if (document.body.classList.contains('side-open') && !e.target.closest('#sidebar, #menu-btn')) document.body.classList.remove('side-open');
});

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); $('#search').focus(); return; }
  if (!player.item) return;
  if (e.key === 'k') player.toggle();
  else if (e.key === 'j') player.skip(-10);
  else if (e.key === 'l') player.skip(10);
});

window.addEventListener('pagehide', saveProgress);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveProgress(); });

function renderSidebar() {
  $('#nav-topics').innerHTML = `<h4>Topics</h4>` + Object.entries(CAT.topics).map(([k, v]) =>
    `<a href="${hrefWith('', { topic: k })}"><span class="dot" style="background:${TOPIC_COLORS[k]}"></span><span>${esc(v)}</span></a>`).join('');
  $('#nav-foot').innerHTML = `<div class="foot-note">${VIDEOS.length.toLocaleString()} talks • ${PODS.length} episodes<br>
    Updated ${fmtDate(Date.parse(CAT.updated) / 1000)} • refreshed weekly<br>
    No account needed - your library stays on this device.</div>`;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

(async function boot() {
  view.innerHTML = '<div class="empty"><p>Loading talks…</p></div>';
  try {
    await loadCatalog();
  } catch (e) {
    view.innerHTML = emptyHtml('Could not load the catalog', `${e.message}. Check your connection and reload.`);
    return;
  }
  renderSidebar();
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
