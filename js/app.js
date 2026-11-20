/* Sailor Inventory - main app */
(function () {
  'use strict';
  const C = Core, t = C.t, esc = C.esc, fmt = C.fmt, DB = C.DB, Sound = C.Sound;
  const VERSION = '1.0.0';
  const SALT = 'sailor-inv-v1';
  const PW_HASH = '79d3f2fc8ab27f74af78afb1b020de0d2e64e13ce7a7d577105c57f18db35918';
  const UNLOCK_MS = 12 * 3600 * 1000;
  const DIMS = ['g', 'm', 'c', 'se', 'sz'];
  const DIM_LABEL = { g: 'gender', m: 'master', c: 'category', se: 'season', sz: 'size' };
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const $ = (s, r) => (r || document).querySelector(s);

  let settings = { lang: 'en', sound: true, vibrate: true, staff: '', camera: '' };
  const state = {
    tab: 'home', dict: null, items: [], bb: new Map(), meta: null, stock: null, pending: null,
    sel: { g: new Set(), m: new Set(), c: new Set(), se: new Set(), sz: new Set() },
    agg: null, itemByBc: {}
  };
  let S = null;            // active session
  let flag = null;         // Uint8Array in-scope flags
  let CNT = { expected: 0, scanned: 0, matched: 0, short: 0, excess: 0 };
  let scanMounted = false, scanner = null, paused = false, wakeLock = null;
  let last = { bc: '', seen: 0, accept: 0 }, pw = { bc: '', t: 0 }, lastRes = null;
  let listTab = 'missing', listQuery = '', listPage = 1, persistTimer = null;

  /* ================= settings / lock ================= */
  function loadSettings() { try { Object.assign(settings, JSON.parse(localStorage.getItem('si.settings') || '{}')); } catch (e) { /* ignore */ } }
  function saveSettings() { try { localStorage.setItem('si.settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } }
  function applySettings() { C.setLang(settings.lang); Sound.enabled = settings.sound; Sound.vib = settings.vibrate; }
  function isUnlocked() { try { return Date.now() - Number(localStorage.getItem('si.unlock') || 0) < UNLOCK_MS; } catch (e) { return false; } }

  function showLock() {
    const el = $('#lock');
    el.hidden = false;
    el.innerHTML = `<form class="lockbox" id="lockform" autocomplete="off">
      <img src="icons/logo.svg" alt="" class="lockicon"><h1>${t('app')}</h1><p>${t('enter_password')}</p>
      <input id="lockpw" type="password" placeholder="${t('password')}" autocomplete="current-password" autofocus>
      <div class="err" id="lockerr"></div><button class="btn" type="submit">${t('unlock')}</button>
      <div class="langrow"><button type="button" data-act="lang" data-v="en" class="${settings.lang === 'en' ? 'on' : ''}">English</button><button type="button" data-act="lang" data-v="bn" class="${settings.lang === 'bn' ? 'on' : ''}">বাংলা</button></div></form>`;
    $('#lockform').addEventListener('submit', async (e) => {
      e.preventDefault();
      const h = await C.sha256(SALT + $('#lockpw').value);
      if (h === PW_HASH) { try { localStorage.setItem('si.unlock', String(Date.now())); } catch (x) { /* ignore */ } el.hidden = true; el.innerHTML = ''; Sound.init(); start(); }
      else { $('#lockerr').textContent = t('wrong_password'); $('#lockpw').value = ''; }
    });
  }

  /* ================= toast / modal ================= */
  let toastTimer = null;
  function toast(msg, kind) {
    const el = $('#toast'); el.textContent = msg; el.className = 'toast show ' + (kind || '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
  }
  function openModal(html, sheet) {
    const m = $('#modal'); m.hidden = false;
    m.innerHTML = `<div class="backdrop" data-act="closeModal"></div><div class="${sheet ? 'sheet' : 'dialog'}">${html}</div>`;
  }
  function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }

  /* ================= stock data ================= */
  function applyStock(stock) {
    state.stock = stock; state.meta = stock.meta; state.dict = stock.dict;
    const D = stock.dict;
    state.items = stock.rows.map(r => ({ bc: r[0], g: r[1], m: r[2], c: r[3], se: r[4], sz: r[5], lb: r[6], st: r[7], co: r[8], q: r[9], mrp: r[10], cpu: r[11], rcv: r[12], sale: r[13] }));
    state.bb = new Map(); state.itemByBc = {};
    state.items.forEach((it, i) => { state.bb.set(it.bc, i); state.itemByBc[it.bc] = it; });
    // aggregates for Home
    const g = {}, m = {};
    state.items.forEach(it => {
      const gn = D.g[it.g], mn = D.m[it.m];
      const a = g[gn] || (g[gn] = { pcs: 0, val: 0 }); a.pcs += it.q; a.val += it.q * it.mrp;
      const b = m[mn] || (m[mn] = { pcs: 0, val: 0, sold: 0, skus: 0 }); b.pcs += it.q; b.val += it.q * it.mrp; b.sold += it.sale; b.skus++;
    });
    state.agg = { g, m };
    DIMS.forEach(d => state.sel[d].clear());
  }

  async function loadStock() {
    try { const cached = await DB.get('stock'); if (cached && cached.rows) applyStock(cached); } catch (e) { /* ignore */ }
    await checkUpdate(false);
    if (!state.items.length) {
      try { const r = await fetch('data/stock.json', { cache: 'no-cache' }); if (r.ok) { const s = await r.json(); applyStock(s); DB.set('stock', s); } } catch (e) { /* offline */ }
    }
  }

  async function checkUpdate(manual) {
    try {
      const r = await fetch('data/meta.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('meta ' + r.status);
      const meta = await r.json();
      if (state.meta && state.meta.publishedAt === meta.publishedAt) { if (manual) toast(t('up_to_date')); return; }
      const sr = await fetch('data/stock.json?v=' + encodeURIComponent(meta.publishedAt), { cache: 'no-cache' });
      if (!sr.ok) throw new Error('stock ' + sr.status);
      handleNewStock(await sr.json());
    } catch (e) { if (manual) toast(t('update_failed'), 'bad'); }
  }

  function handleNewStock(stock) {
    if (S) { state.pending = stock; renderBanner(); return; }
    const had = !!state.meta;
    applyStock(stock); DB.set('stock', stock); state.pending = null;
    if (had) toast(t('updated'), 'ok');
    if (state.tab !== 'publish') render();
    renderHeader();
  }
  function applyPending() { if (state.pending) { const p = state.pending; state.pending = null; applyStock(p); DB.set('stock', p); toast(t('updated'), 'ok'); } renderBanner(); }

  /* ================= selection / scope ================= */
  function facet(dim) {
    const others = DIMS.filter(d => d !== dim && state.sel[d].size), counts = new Map();
    for (const it of state.items) {
      let ok = true;
      for (const d of others) if (!state.sel[d].has(it[d])) { ok = false; break; }
      if (!ok) continue;
      const c = counts.get(it[dim]); if (c) { c.k++; c.p += it.q; } else counts.set(it[dim], { k: 1, p: it.q });
    }
    return counts;
  }
  function pruneSel() {
    for (let pass = 0; pass < 2; pass++) DIMS.forEach(d => {
      if (!state.sel[d].size) return;
      const f = facet(d);
      [...state.sel[d]].forEach(v => { if (!f.has(v)) state.sel[d].delete(v); });
    });
  }
  function anySel() { return DIMS.some(d => state.sel[d].size); }
  function computeScope(sel) {
    sel = sel || state.sel; const out = [], act = DIMS.filter(d => sel[d].size);
    if (!act.length) return out;
    state.items.forEach((it, i) => { for (const d of act) if (!sel[d].has(it[d])) return; out.push(i); });
    return out;
  }
  function selNames() { const o = {}; DIMS.forEach(d => { o[d] = [...state.sel[d]].map(i => state.dict[d][i]); }); return o; }

  /* ================= session ================= */
  function initRuntime() {
    flag = new Uint8Array(state.items.length);
    S.scope.forEach(i => { flag[i] = 1; });
    CNT = { expected: 0, scanned: 0, matched: 0, short: 0, excess: 0 };
    S.scope.forEach(i => { CNT.expected += state.items[i].q; });
    Object.keys(S.counts).forEach(bc => {
      const i = state.bb.get(bc); if (i === undefined || !flag[i]) return;
      const q = state.items[i].q, c = S.counts[bc];
      CNT.scanned += c; CNT.matched += Math.min(c, q); CNT.excess += Math.max(0, c - q);
    });
    CNT.short = CNT.expected - CNT.matched;
  }
  function scopeFromNames(filters) {
    const sel = {}; DIMS.forEach(d => { sel[d] = new Set((filters[d] || []).map(n => state.dict[d].indexOf(n)).filter(i => i >= 0)); });
    return computeScope(sel);
  }
  function schedulePersist() { clearTimeout(persistTimer); persistTimer = setTimeout(persistNow, 400); }
  function persistNow() { clearTimeout(persistTimer); if (!S) return; const { scope, ...rest } = S; DB.set('session', rest).catch(() => {}); }

  async function restoreSession() {
    try {
      const s = await DB.get('session');
      if (s && s.status === 'active' && state.items.length) { S = Object.assign(s, { scope: scopeFromNames(s.filters) }); initRuntime(); }
    } catch (e) { /* ignore */ }
  }

  function startSession() {
    const name = ($('#staff') ? $('#staff').value : settings.staff).trim();
    if (!name) { toast(t('need_name'), 'bad'); return; }
    settings.staff = name; saveSettings();
    const scope = computeScope(); if (!scope.length) { toast(t('empty_scope'), 'bad'); return; }
    Sound.init();
    S = { id: 'S' + Date.now(), createdAt: Date.now(), staff: name, filters: selNames(), scope, counts: {}, wrong: {}, out: {}, log: [], status: 'active' };
    initRuntime(); persistNow(); lastRes = null; listTab = 'missing'; listQuery = ''; listPage = 1; render();
  }

  function normBc(raw) { return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  function recordScan(bc, method) {
    const now = Date.now(), idx = state.bb.get(bc);
    if (idx === undefined) {
      const w = S.wrong[bc] || (S.wrong[bc] = { n: 0, t: now }); w.n++; S.log.push({ t: now, bc, r: 'WRONG', m: method });
      return { r: 'WRONG', bc };
    }
    const it = state.items[idx];
    if (!flag[idx]) {
      const o = S.out[bc] || (S.out[bc] = { n: 0, t: now }); o.n++; S.log.push({ t: now, bc, r: 'OUT', m: method });
      return { r: 'OUT', bc, it };
    }
    const before = S.counts[bc] || 0; S.counts[bc] = before + 1; CNT.scanned++;
    let r;
    if (before < it.q) { CNT.matched++; CNT.short--; r = 'OK'; } else { CNT.excess++; r = 'EXCESS'; }
    S.log.push({ t: now, bc, r, m: method });
    return { r, bc, it, count: before + 1 };
  }

  function removeOne(bc, method) { // manual decrement for in-scope item
    const idx = state.bb.get(bc), c = S.counts[bc] || 0; if (idx === undefined || !flag[idx] || c <= 0) return;
    const q = state.items[idx].q; S.counts[bc] = c - 1; CNT.scanned--;
    if (c > q) CNT.excess--; else { CNT.matched--; CNT.short++; }
    if (S.counts[bc] === 0) delete S.counts[bc];
    S.log.push({ t: Date.now(), bc, r: 'REMOVED', m: method || 'MANUAL' });
  }

  function undoLast() {
    for (let i = S.log.length - 1; i >= 0; i--) {
      const l = S.log[i];
      if (l.r === 'REMOVED') continue;
      S.log.splice(i, 1);
      if (l.r === 'WRONG') { const w = S.wrong[l.bc]; if (w && --w.n <= 0) delete S.wrong[l.bc]; }
      else if (l.r === 'OUT') { const o = S.out[l.bc]; if (o && --o.n <= 0) delete S.out[l.bc]; }
      else {
        const idx = state.bb.get(l.bc), q = state.items[idx].q, c = S.counts[l.bc] || 0;
        S.counts[l.bc] = c - 1; CNT.scanned--; if (c > q) CNT.excess--; else { CNT.matched--; CNT.short++; }
        if (S.counts[l.bc] <= 0) delete S.counts[l.bc];
      }
      lastRes = null; schedulePersist(); updateScanUI(); return;
    }
  }

  function register(bc, method) {
    if (!S) return;
    lastRes = recordScan(bc, method);
    Sound.play(lastRes.r === 'OK' ? 'OK' : lastRes.r === 'EXCESS' ? 'EXCESS' : 'ERR');
    schedulePersist(); updateScanUI();
  }

  function onDetect(raw) { // camera path with anti-double-count logic
    if (!S || paused) return;
    const bc = normBc(raw); if (!bc) return;
    const now = performance.now();
    if (bc === last.bc) { const gap = now - last.seen; last.seen = now; if (gap < 350 || now - last.accept < 700) return; }
    if (!state.bb.has(bc)) { if (!(pw.bc === bc && now - pw.t < 1500)) { pw = { bc, t: now }; return; } }
    last = { bc, seen: now, accept: now };
    register(bc, 'CAMERA');
  }

  /* ================= camera ================= */
  async function startCamera() {
    const msg = $('#camMsg'); if (!msg) return;
    msg.className = 'cammsg'; msg.textContent = '';
    try {
      if (!scanner) scanner = new Scanner($('#vid'), null, onDetect);
      else { scanner.video = $('#vid'); }
      await scanner.start(settings.camera || '');
      paused = false; msg.textContent = ''; msg.className = 'cammsg hide';
      $('#btnTorch').hidden = !scanner.hasTorch();
      const z = scanner.zoomRange(), zs = $('#zoom');
      if (z && zs) { zs.hidden = false; zs.min = z.min; zs.max = Math.min(z.max, z.min + 4); zs.step = z.step; zs.value = z.min; }
      requestWake();
    } catch (e) {
      msg.className = 'cammsg err'; msg.innerHTML = `${t('camera_error')}<br><small>${esc(e.message || e.name || '')}</small><br><button class="btn small" data-act="retryCam">${t('retry')}</button>`;
    }
  }
  function stopCamera() { if (scanner) scanner.stop(); releaseWake(); }
  async function requestWake() { try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) { /* ignore */ } }
  function releaseWake() { try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignore */ } wakeLock = null; }

  function mountScan() {
    scanMounted = true; paused = false; last = { bc: '', seen: 0, accept: 0 }; pw = { bc: '', t: 0 };
    updateScanUI(); startCamera();
  }
  function unmountScan() { if (!scanMounted) return; scanMounted = false; stopCamera(); }

  /* ================= views ================= */
  function renderHeader() {
    const m = state.meta;
    $('#hdrSub').textContent = m ? `${m.outlet} · ${t('stock_as_of')} ${C.fmtDate(m.reportDate)}` : t('tagline');
  }
  function renderBanner() {
    const b = $('#banner');
    if (state.pending) { b.hidden = false; b.textContent = t('pending_update'); } else { b.hidden = true; b.textContent = ''; }
  }
  function renderNav() {
    const ic = {
      home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
      scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>',
      history: '<path d="M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.3 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8 0-1.2z"/>'
    };
    $('#nav').innerHTML = ['home', 'scan', 'history', 'settings'].map(k => {
      const on = state.tab === k || (k === 'settings' && state.tab === 'publish');
      return `<button data-act="tab" data-v="${k}" class="${on ? 'on' : ''} ${k === 'scan' ? 'fab' : ''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ic[k]}</svg><span>${t(k)}</span></button>`;
    }).join('');
  }

  function bar(p, cls) { return `<div class="bar ${cls || ''}"><i style="width:${Math.max(0, Math.min(100, p))}%"></i></div>`; }

  function viewHome() {
    if (!state.items.length) return `<div class="card muted">${t('no_data')}</div>`;
    const m = state.meta, c = m.counts, D = state.dict;
    let h = '';
    if (S) {
      const pct = CNT.expected ? Math.round(CNT.matched * 100 / CNT.expected) : 0;
      h += `<div class="card resume"><div><b>${t('resume_hint')}</b><div class="muted small">${esc(selSummary(S.filters))} · ${esc(S.staff)}</div>${bar(pct)}<div class="small">${fmt(CNT.matched)} / ${fmt(CNT.expected)} ${t('pcs')}</div></div><button class="btn" data-act="tab" data-v="scan">${t('resume_scan')}</button></div>`;
    } else h += `<button class="btn big" data-act="tab" data-v="scan">${t('start_scan')}</button>`;
    h += `<div class="kpis"><div class="kpi"><b>${fmt(c.skus)}</b><span>${t('skus')}</span></div><div class="kpi"><b>${fmt(c.pcs)}</b><span>${t('pcs')}</span></div><div class="kpi"><b>${C.fmtMoney(c.mrpValue)}</b><span>${t('value_mrp')}</span></div></div>`;
    const gs = Object.keys(state.agg.g).sort((a, b) => state.agg.g[b].pcs - state.agg.g[a].pcs);
    h += `<div class="card"><h3>${t('by_gender')}</h3>` + gs.map(k => { const a = state.agg.g[k]; return `<div class="brow"><span>${esc(k)}</span>${bar(a.pcs * 100 / c.pcs)}<b>${fmt(a.pcs)}</b></div>`; }).join('') + '</div>';
    const ms = Object.keys(state.agg.m).sort((a, b) => state.agg.m[b].pcs - state.agg.m[a].pcs).slice(0, 14);
    h += `<div class="card"><h3>${t('by_master')}</h3><table class="tbl"><thead><tr><th></th><th>${t('pcs')}</th><th>${t('sell_through')}</th></tr></thead><tbody>` +
      ms.map(k => { const a = state.agg.m[k], st = a.sold + a.pcs ? Math.round(a.sold * 100 / (a.sold + a.pcs)) : 0; return `<tr><td>${esc(k)}</td><td>${fmt(a.pcs)}</td><td>${st}%</td></tr>`; }).join('') + '</tbody></table></div>';
    return h;
  }

  function selSummary(f) {
    const parts = []; DIMS.forEach(d => { if (f[d] && f[d].length) parts.push(f[d].length > 2 ? f[d].slice(0, 2).join(', ') + ' +' + (f[d].length - 2) : f[d].join(', ')); });
    return parts.join(' · ');
  }

  function viewSetup() {
    if (!state.items.length) return `<div class="card muted">${t('no_data')}</div>`;
    const scope = computeScope(); let pcs = 0, val = 0; scope.forEach(i => { const it = state.items[i]; pcs += it.q; val += it.q * it.mrp; });
    let h = `<div class="card"><h3>${t('choose_section')}</h3><label>${t('your_name')}<input id="staff" value="${esc(settings.staff)}" placeholder="${t('your_name_ph')}" autocomplete="name"></label></div><div class="card dims">`;
    DIMS.forEach(d => {
      const names = [...state.sel[d]].map(i => state.dict[d][i]);
      h += `<button class="dim" data-act="openDim" data-dim="${d}"><span class="dl">${t(DIM_LABEL[d])}</span><span class="dv">${names.length ? esc(names.slice(0, 3).join(', ')) + (names.length > 3 ? ' +' + (names.length - 3) : '') : '<i>' + t('all') + '</i>'}</span><span class="chev">›</span></button>`;
    });
    h += '</div>';
    h += `<div class="card sumbox"><div class="kv"><span><b>${fmt(scope.length)}</b> ${t('skus')}</span><span><b>${fmt(pcs)}</b> ${t('pcs')}</span><span><b>${C.fmtMoney(val)}</b> MRP</span></div>`;
    if (!anySel()) h += `<p class="muted small">${t('need_filter')}</p>`;
    else if (pcs > 3000) h += `<p class="warn small">${t('big_selection')}</p>`;
    h += `<button class="btn big" data-act="startSession" ${scope.length ? '' : 'disabled'}>${t('start')}</button></div>`;
    return h;
  }

  function openDim(d) {
    const f = facet(d), D = state.dict[d];
    let opts = [...f.keys()].map(i => ({ i, name: D[i], k: f.get(i).k, p: f.get(i).p }));
    if (d === 'sz') opts.sort((a, b) => C.sizeRank(a.name) - C.sizeRank(b.name) || a.name.localeCompare(b.name));
    else if (d === 'se') opts.sort((a, b) => (Number((/(\d{4})/.exec(b.name) || [0, 0])[1]) - Number((/(\d{4})/.exec(a.name) || [0, 0])[1])) || a.name.localeCompare(b.name));
    else opts.sort((a, b) => a.name.localeCompare(b.name));
    openModal(`<div class="sh-h"><b>${t(DIM_LABEL[d])}</b><button class="lnk" data-act="dimClear" data-dim="${d}">${t('clear')}</button></div>
      <input id="dimq" class="search" placeholder="${t('search')}" autocomplete="off"><div class="sh-list" id="dimlist"></div>
      <div class="sh-f"><button class="btn" data-act="closeDim">${t('done')} (${state.sel[d].size})</button></div>`, true);
    const draw = () => {
      const q = ($('#dimq').value || '').toUpperCase();
      $('#dimlist').innerHTML = opts.filter(o => !q || o.name.toUpperCase().includes(q)).map(o =>
        `<label class="opt"><input type="checkbox" data-act="dimToggle" data-dim="${d}" data-i="${o.i}" ${state.sel[d].has(o.i) ? 'checked' : ''}><span>${esc(o.name)}</span><small>${fmt(o.k)} · ${fmt(o.p)} ${t('pcs')}</small></label>`).join('');
    };
    $('#dimq').addEventListener('input', draw); draw();
  }

  function viewScan() {
    return `<div class="scanwrap">
      <div class="scanhead"><div class="sel">${esc(selSummary(S.filters))}</div><button class="lnk" data-act="undo">${t('undo')}</button><button class="lnk bad" data-act="discard">${t('discard')}</button></div>
      <div class="cam"><video id="vid" playsinline muted></video><div class="guide"><i></i></div>
        <div class="camtools"><button id="btnTorch" data-act="torch" hidden>${t('torch')}</button><button data-act="pause" id="btnPause">${t('pause')}</button></div>
        <input id="zoom" type="range" hidden><div class="cammsg" id="camMsg"></div></div>
      <div id="stats"></div><div id="last"></div>
      <form id="manual" class="manual"><input id="manualIn" placeholder="${t('manual_ph')}" autocomplete="off" autocapitalize="characters"><button class="btn small" type="submit">${t('add')}</button></form>
      <div class="tabs" id="stabs"></div><div id="slist"></div></div>
      <div class="stickybar"><button class="btn big" data-act="finish">${t('finish')}</button></div>`;
  }

  function scanTabsCounts() {
    const w = Object.values(S.wrong).reduce((a, x) => a + x.n, 0), o = Object.values(S.out).reduce((a, x) => a + x.n, 0);
    return { missing: CNT.short, excess: CNT.excess, wrong: w, other: o };
  }

  function updateScanUI() {
    if (!scanMounted || !S) return;
    const pct = CNT.expected ? CNT.matched * 100 / CNT.expected : 0, n = scanTabsCounts();
    $('#stats').innerHTML = `<div class="prog"><div class="big"><b>${fmt(CNT.matched)}</b><span>${t('of')} ${fmt(CNT.expected)} ${t('pcs')}</span></div><div class="pct">${pct.toFixed(1)}%</div></div>${bar(pct, 'thick')}`;
    const L = lastRes;
    let lh = `<div class="last idle">${t('scan_ready')}</div>`;
    if (L) {
      const it = L.it, D = state.dict;
      const head = it ? `<b>${esc(it.st)}</b><span>${esc(D.co[it.co])} · ${esc(D.sz[it.sz])}</span>` : `<b>${esc(L.bc)}</b>`;
      const cls = L.r === 'OK' ? 'ok' : L.r === 'EXCESS' ? 'warn' : 'bad';
      const msg = L.r === 'OK' ? `${t('ok_scan')}  ${L.count} / ${it.q}` : L.r === 'EXCESS' ? `${t('excess_scan')}  ${L.count} / ${it.q}` : L.r === 'OUT' ? `${t('out_scan')}` : t('wrong_scan');
      lh = `<div class="last ${cls}">${head}<code>${esc(L.bc)}</code><em>${msg}</em></div>`;
    }
    $('#last').innerHTML = lh;
    const tabs = [['missing', 'missing'], ['excess', 'excess'], ['wrong', 'wrong'], ['other', 'rejected']];
    $('#stabs').innerHTML = tabs.map(([k, lb]) => `<button data-act="listTab" data-v="${k}" class="${listTab === k ? 'on' : ''} ${k}">${t(lb)} <b>${fmt(n[k])}</b></button>`).join('');
    renderList();
  }

  function renderList() {
    if (!scanMounted || !S) return;
    const D = state.dict, q = listQuery.toUpperCase(), LIM = 40 * listPage;
    let rows = [], total = 0, h = '';
    const match = it => !q || it.bc.includes(q) || it.st.toUpperCase().includes(q) || D.co[it.co].includes(q);
    if (listTab === 'missing' || listTab === 'excess') {
      const miss = listTab === 'missing';
      S.scope.forEach(i => {
        const it = state.items[i], c = S.counts[it.bc] || 0, v = miss ? it.q - c : c - it.q;
        if (v > 0 && match(it)) rows.push({ it, v, c });
      });
      rows.sort((a, b) => a.it.st.localeCompare(b.it.st) || C.sizeRank(D.sz[a.it.sz]) - C.sizeRank(D.sz[b.it.sz]));
      total = rows.length;
      h = (total > 8 || q ? `<input class="search" id="lq" placeholder="${t('search')}" value="${esc(listQuery)}">` : '') +
        (total ? rows.slice(0, LIM).map(r => `<div class="row"><div class="rmain"><b>${esc(r.it.st)}</b><span>${esc(D.co[r.it.co])} · ${esc(D.sz[r.it.sz])} · MRP ${fmt(r.it.mrp)}</span><code>${r.it.bc}</code></div><div class="rside"><span class="badge ${miss ? 'bad' : 'warn'}">${miss ? t('need') : t('excess')} ${r.v}</span><span class="small muted">${t('have')} ${r.c}/${r.it.q}</span>${miss ? `<button class="mini" data-act="plus" data-bc="${r.it.bc}">${t('found_manual')}</button>` : `<button class="mini" data-act="minus" data-bc="${r.it.bc}">${t('remove_one')}</button>`}</div></div>`).join('') : `<div class="muted center pad">${miss ? t('nothing_missing') : t('nothing_here')}</div>`);
    } else {
      const src = listTab === 'wrong' ? S.wrong : S.out;
      const keys = Object.keys(src).sort((a, b) => src[b].n - src[a].n); total = keys.length;
      h = total ? keys.slice(0, LIM).map(bc => { const it = state.itemByBc[bc]; return `<div class="row"><div class="rmain"><b>${it ? esc(it.st) : esc(bc)}</b><span>${it ? esc(D.g[it.g]) + ' · ' + esc(D.m[it.m]) + ' · ' + esc(D.sz[it.sz]) : t('wrong_scan')}</span><code>${bc}</code></div><div class="rside"><span class="badge bad">× ${src[bc].n}</span></div></div>`; }).join('') : `<div class="muted center pad">${t('nothing_here')}</div>`;
    }
    if (total > LIM) h += `<button class="btn ghost" data-act="more">${t('show_more')} (${fmt(total - LIM)})</button>`;
    const el = $('#slist'), hadFocus = document.activeElement && document.activeElement.id === 'lq';
    el.innerHTML = h;
    if (hadFocus) { const i = $('#lq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }

  function summaryNumbers() {
    const w = Object.values(S.wrong).reduce((a, x) => a + x.n, 0), o = Object.values(S.out).reduce((a, x) => a + x.n, 0);
    return { expected: CNT.expected, scanned: CNT.scanned, matched: CNT.matched, short: CNT.short, excess: CNT.excess, wrong: w, out: o, accuracy: CNT.expected ? CNT.matched / CNT.expected : 0 };
  }

  function openFinish() {
    persistNow();
    const s = summaryNumbers();
    openModal(`<h3>${t('review')}</h3>
      <div class="grid2 stat">
        <div><b>${fmt(s.expected)}</b><span>${t('expected_pcs')}</span></div><div><b>${fmt(s.scanned)}</b><span>${t('scanned_pcs')}</span></div>
        <div class="bad"><b>${fmt(s.short)}</b><span>${t('short_pcs')}</span></div><div class="warn"><b>${fmt(s.excess)}</b><span>${t('excess_pcs')}</span></div>
        <div class="bad"><b>${fmt(s.wrong)}</b><span>${t('wrong_bc')}</span></div><div><b>${(s.accuracy * 100).toFixed(1)}%</b><span>${t('accuracy')}</span></div></div>
      ${s.short ? `<p class="warn small">${fmt(s.short)} ${t('pcs')} - ${t('missing_warn')}</p>` : ''}
      <div class="btnrow"><button class="btn ghost" data-act="closeModal">${t('rescan')}</button><button class="btn" data-act="complete">${t('complete_export')}</button></div>`);
  }

  async function complete() {
    openModal(`<div class="center pad"><div class="spin"></div><p>${t('building')}</p></div>`);
    try {
      S.completedAt = Date.now(); S.status = 'done';
      if (!window.ExcelJS) await C.loadScript('js/lib/exceljs.min.js');
      const buf = await Report.buildReport(window.ExcelJS, { session: S, items: state.items, dict: state.dict, meta: state.meta, byBarcode: state.itemByBc });
      const name = Report.fileName(S, state.meta), bytes = new Uint8Array(buf), sum = summaryNumbers();
      await DB.set('f:' + S.id, bytes);
      await DB.set('h:' + S.id, { id: S.id, name, staff: S.staff, completedAt: S.completedAt, createdAt: S.createdAt, filters: S.filters, summary: sum, outlet: state.meta.outlet });
      await pruneHistory();
      const id = S.id; await DB.del('session');
      unmountScan(); S = null; flag = null; applyPending(); state.tab = 'home';
      render();
      openModal(`<div class="center"><div class="okmark">✓</div><h3>${t('report_ready')}</h3><p class="small muted">${esc(name)}</p>
        <div class="btnrow"><button class="btn" data-act="share" data-id="${id}">${t('share')}</button><button class="btn ghost" data-act="dl" data-id="${id}">${t('download')}</button></div>
        <button class="lnk" data-act="closeModal">${t('close')}</button></div>`);
    } catch (e) {
      S.status = 'active'; delete S.completedAt; openModal(`<div class="bad"><b>${t('pub_fail')}</b><p>${esc(e.message)}</p><button class="btn" data-act="closeModal">${t('close')}</button></div>`);
    }
  }

  async function pruneHistory() {
    const ks = (await DB.keys()).filter(k => String(k).startsWith('h:'));
    if (ks.length <= 40) return;
    const recs = []; for (const k of ks) recs.push(await DB.get(k));
    recs.sort((a, b) => a.completedAt - b.completedAt);
    for (const r of recs.slice(0, recs.length - 40)) { await DB.del('h:' + r.id); await DB.del('f:' + r.id); }
  }

  async function fileFor(id) {
    const [meta, bytes] = [await DB.get('h:' + id), await DB.get('f:' + id)];
    if (!meta || !bytes) throw new Error('File not found');
    return new File([bytes], meta.name, { type: XLSX_MIME });
  }
  async function shareFile(id) {
    const file = await fileFor(id);
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: file.name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    downloadFile(file);
  }
  function downloadFile(file) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  async function viewHistory(el) {
    const ks = (await DB.keys()).filter(k => String(k).startsWith('h:')), recs = [];
    for (const k of ks) recs.push(await DB.get(k));
    recs.sort((a, b) => b.completedAt - a.completedAt);
    if (state.tab !== 'history') return;
    el.innerHTML = recs.length ? recs.map(r => `<div class="card"><div class="hrow"><div><b>${esc(selSummary(r.filters))}</b><div class="muted small">${C.fmtDT(r.completedAt)} · ${t('by')} ${esc(r.staff)}</div></div><div class="acc ${r.summary.accuracy > 0.98 ? 'ok' : r.summary.accuracy > 0.9 ? 'warn' : 'bad'}">${(r.summary.accuracy * 100).toFixed(1)}%</div></div>
      <div class="kv small"><span>${t('expected_pcs')} <b>${fmt(r.summary.expected)}</b></span><span>${t('short_pcs')} <b>${fmt(r.summary.short)}</b></span><span>${t('excess_pcs')} <b>${fmt(r.summary.excess)}</b></span><span>${t('wrong_bc')} <b>${fmt(r.summary.wrong)}</b></span></div>
      <div class="btnrow"><button class="btn small" data-act="share" data-id="${r.id}">${t('share')}</button><button class="btn small ghost" data-act="dl" data-id="${r.id}">${t('download')}</button><button class="btn small ghost bad" data-act="delHist" data-id="${r.id}">${t('delete')}</button></div></div>`).join('') : `<div class="card muted center">${t('no_history')}</div>`;
  }

  function viewSettings() {
    const m = state.meta, devs = settings._devs || [];
    return `<div class="card"><h3>${t('language')}</h3><div class="seg"><button data-act="lang" data-v="en" class="${settings.lang === 'en' ? 'on' : ''}">English</button><button data-act="lang" data-v="bn" class="${settings.lang === 'bn' ? 'on' : ''}">বাংলা</button></div>
      <label class="check"><input type="checkbox" data-act="setSound" ${settings.sound ? 'checked' : ''}> ${t('sound')}</label>
      <label class="check"><input type="checkbox" data-act="setVib" ${settings.vibrate ? 'checked' : ''}> ${t('vibrate')}</label>
      <label>${t('camera')}<select id="camSel" data-act="setCam"><option value="">${t('camera_auto')}</option>${devs.map(d => `<option value="${esc(d.id)}" ${d.id === settings.camera ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}</select></label></div>
      <div class="card"><h3>${t('data')}</h3>${m ? `<div class="kvl"><span>${t('outlet')}</span><b>${esc(m.outlet)}</b><span>${t('stock_as_of')}</span><b>${C.fmtDate(m.reportDate)}</b><span>${t('skus')} / ${t('pcs')}</span><b>${fmt(m.counts.skus)} / ${fmt(m.counts.pcs)}</b><span>${t('published')}</span><b>${C.fmtDT(m.publishedAt)}</b></div>` : `<p class="muted">${t('no_data')}</p>`}
      <button class="btn ghost" data-act="checkUpdate">${t('check_update')}</button></div>
      <div class="card"><h3>${t('admin')}</h3><button class="btn" data-act="tab" data-v="publish">${t('publisher')}</button></div>
      <div class="card"><button class="btn ghost" data-act="lock">${t('lock_now')}</button> <button class="btn ghost bad" data-act="reset">${t('reset_local')}</button><p class="muted small">${t('version')} ${VERSION}</p></div>`;
  }

  async function listCameras() {
    try {
      const ds = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput' && d.label);
      settings._devs = ds.map(d => ({ id: d.deviceId, label: d.label }));
      const sel = $('#camSel'); if (sel && ds.length) sel.innerHTML = `<option value="">${t('camera_auto')}</option>` + settings._devs.map(d => `<option value="${esc(d.id)}" ${d.id === settings.camera ? 'selected' : ''}>${esc(d.label)}</option>`).join('');
    } catch (e) { /* ignore */ }
  }

  /* ================= render ================= */
  let prevTab = null;
  function render() {
    renderNav(); renderHeader(); renderBanner();
    const v = $('#view');
    if (prevTab === 'scan' && state.tab !== 'scan') unmountScan();
    prevTab = state.tab;
    if (state.tab === 'home') v.innerHTML = viewHome();
    else if (state.tab === 'scan') {
      if (S) { if (!scanMounted) { v.innerHTML = viewScan(); mountScan(); } }
      else { unmountScan(); v.innerHTML = viewSetup(); }
    }
    else if (state.tab === 'history') { v.innerHTML = ''; viewHistory(v); }
    else if (state.tab === 'settings') { v.innerHTML = viewSettings(); listCameras(); }
    else if (state.tab === 'publish') {
      v.innerHTML = `<button class="lnk" data-act="tab" data-v="settings">‹ ${t('back')}</button><div id="pubroot"></div>`;
      Publisher.mount($('#pubroot'), { meta: state.meta, items: state.items, onPublished: handleNewStock });
    }
    v.scrollTop = 0; window.scrollTo(0, 0);
  }
  function rerenderSetup() { if (state.tab === 'scan' && !S) { const y = window.scrollY; $('#view').innerHTML = viewSetup(); window.scrollTo(0, y); } }

  /* ================= events ================= */
  const ACT = {
    tab(el) { if (state.tab === 'scan' && S && el.dataset.v !== 'scan') { persistNow(); } state.tab = el.dataset.v; render(); },
    lang(el) { settings.lang = el.dataset.v; saveSettings(); applySettings(); if (!$('#lock').hidden) showLock(); else { scanMounted && unmountScan(); render(); } },
    closeModal() { closeModal(); },
    openDim(el) { openDim(el.dataset.dim); },
    dimToggle(el) { const d = el.dataset.dim, i = Number(el.dataset.i); if (el.checked) state.sel[d].add(i); else state.sel[d].delete(i); },
    dimClear(el) { state.sel[el.dataset.dim].clear(); closeModal(); openDim(el.dataset.dim); },
    closeDim() { pruneSel(); closeModal(); rerenderSetup(); },
    startSession() { startSession(); },
    finish() { openFinish(); },
    complete() { complete(); },
    undo() { undoLast(); },
    discard() { if (confirm(t('discard_q'))) { DB.del('session'); unmountScan(); S = null; flag = null; applyPending(); render(); } },
    torch(el) { scanner && scanner.setTorch(!el.classList.contains('on')).then(() => el.classList.toggle('on')).catch(() => {}); },
    pause(el) { if (!scanner) return; if (paused) { startCamera(); el.textContent = t('pause'); } else { paused = true; scanner.stop(); el.textContent = t('resume'); const m = $('#camMsg'); m.className = 'cammsg'; m.textContent = t('paused'); } },
    retryCam() { startCamera(); },
    listTab(el) { listTab = el.dataset.v; listQuery = ''; listPage = 1; updateScanUI(); },
    more() { listPage++; renderList(); },
    plus(el) { register(el.dataset.bc, 'MANUAL'); },
    minus(el) { removeOne(el.dataset.bc); schedulePersist(); updateScanUI(); },
    share(el) { shareFile(el.dataset.id).catch(e => toast(e.message, 'bad')); },
    dl(el) { fileFor(el.dataset.id).then(downloadFile).catch(e => toast(e.message, 'bad')); },
    async delHist(el) { if (confirm(t('delete_q'))) { await DB.del('h:' + el.dataset.id); await DB.del('f:' + el.dataset.id); render(); } },
    setSound(el) { settings.sound = el.checked; saveSettings(); applySettings(); },
    setVib(el) { settings.vibrate = el.checked; saveSettings(); applySettings(); },
    setCam(el) { settings.camera = el.value; saveSettings(); },
    checkUpdate() { checkUpdate(true); },
    lock() { try { localStorage.removeItem('si.unlock'); } catch (e) { /* ignore */ } location.reload(); },
    async reset() { if (confirm(t('reset_q'))) { await DB.clear(); try { localStorage.removeItem('si.settings'); } catch (e) { /* ignore */ } location.reload(); } }
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT' || el.type === 'checkbox') return;
    const f = ACT[el.dataset.act]; if (f) f(el, e);
  });
  document.addEventListener('change', e => {
    const el = e.target; if (!el.dataset || !el.dataset.act) return;
    if (el.type === 'checkbox' || el.tagName === 'SELECT') { const f = ACT[el.dataset.act]; if (f) f(el, e); }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'staff') { settings.staff = e.target.value; saveSettings(); }
    if (e.target.id === 'lq') { listQuery = e.target.value; listPage = 1; renderList(); }
    if (e.target.id === 'zoom' && scanner) scanner.setZoom(Number(e.target.value)).catch(() => {});
  });
  document.addEventListener('submit', e => {
    if (e.target.id === 'manual') {
      e.preventDefault(); const i = $('#manualIn'), bc = normBc(i.value); i.value = '';
      if (bc) { Sound.init(); register(bc, 'MANUAL'); }
    }
  });
  // USB / Bluetooth scanner (keyboard wedge)
  let kbuf = '', ktimer = null;
  document.addEventListener('keydown', e => {
    if (!scanMounted || !S || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Enter') { const bc = normBc(kbuf); kbuf = ''; if (bc.length >= 4) register(bc, 'MANUAL'); return; }
    if (e.key.length === 1) { kbuf += e.key; clearTimeout(ktimer); ktimer = setTimeout(() => { kbuf = ''; }, 120); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { persistNow(); if (scanMounted && scanner) scanner.stop(); }
    else { if (scanMounted && !paused) startCamera(); checkUpdate(false); }
  });
  window.addEventListener('online', () => checkUpdate(false));
  window.addEventListener('pagehide', persistNow);

  /* ================= boot ================= */
  async function start() {
    render();
    await loadStock();
    await restoreSession();
    render();
    setInterval(() => { if (!document.hidden) checkUpdate(false); }, 5 * 60 * 1000);
  }

  async function boot() {
    loadSettings(); applySettings();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
      let had = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('App updated - reload to use the new version'); had = true; });
    }
    if (!isUnlocked()) showLock(); else start();
  }
  boot();
})();
