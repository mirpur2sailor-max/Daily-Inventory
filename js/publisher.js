/* In-app stock data publisher v2.
   xlsx -> encrypted stock.dat (AES-GCM, key from the access code) -> committed to GitHub through the Contents API.
   Also: download stock.dat (upload it to GitHub yourself) or use the data on this phone only. */
(function (root) {
  'use strict';
  var C = root.Core, t = C.t, esc = C.esc, fmt = C.fmt;
  var LS = 'si.publisher';

  function load() { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } }
  function save(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) { /* ignore */ } }
  function tokenGet() { try { return localStorage.getItem(LS + '.tok') || sessionStorage.getItem(LS + '.tok') || ''; } catch (e) { return ''; } }
  function tokenSet(tok, remember) {
    try { localStorage.removeItem(LS + '.tok'); sessionStorage.removeItem(LS + '.tok'); (remember ? localStorage : sessionStorage).setItem(LS + '.tok', tok); } catch (e) { /* ignore */ }
  }

  async function gh(method, url, token, body) {
    var r = await fetch('https://api.github.com' + url, {
      method: method,
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    var j = null; try { j = await r.json(); } catch (e) { /* empty */ }
    if (!r.ok && r.status !== 404) throw new Error((j && j.message) || ('HTTP ' + r.status));
    return { status: r.status, json: j };
  }
  function apiPath(cfg, name) {
    var path = (cfg.folder ? cfg.folder.replace(/^\/|\/$/g, '') + '/' : '') + name;
    return '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) + '/contents/' + path.split('/').map(encodeURIComponent).join('/');
  }
  async function putFile(cfg, token, name, text, message) {
    var base = apiPath(cfg, name);
    var cur = await gh('GET', base + '?ref=' + encodeURIComponent(cfg.branch), token);
    var body = { message: message, content: C.b64(text), branch: cfg.branch };
    if (cur.status === 200 && cur.json && cur.json.sha) body.sha = cur.json.sha;
    var r = await gh('PUT', base, token, body);
    if (r.status === 404) throw new Error('Repository or branch not found (check owner / name / token access)');
    return r.json;
  }
  async function deleteIfExists(cfg, token, name, message) {
    var base = apiPath(cfg, name);
    var cur = await gh('GET', base + '?ref=' + encodeURIComponent(cfg.branch), token);
    if (cur.status !== 200 || !cur.json || !cur.json.sha) return false;
    await gh('DELETE', base, token, { message: message, sha: cur.json.sha, branch: cfg.branch });
    return true;
  }

  function mount(el, ctx) {
    var cfg = Object.assign({ owner: 'mirpur2sailor-max', repo: 'Daily-Inventory', branch: 'main', folder: 'data', outlet: (ctx.meta && ctx.meta.outlet) || 'Mirpur-2' }, load());
    var parsed = null;

    el.innerHTML =
      '<div class="card"><h3>' + t('publisher') + '</h3><p class="muted">' + t('publisher_hint') + '</p>' +
      '<div class="grid2"><label>' + t('pub_owner') + '<input id="p-owner" value="' + esc(cfg.owner) + '" autocapitalize="off"></label>' +
      '<label>' + t('pub_name') + '<input id="p-repo" value="' + esc(cfg.repo) + '" autocapitalize="off"></label>' +
      '<label>' + t('pub_branch') + '<input id="p-branch" value="' + esc(cfg.branch) + '" autocapitalize="off"></label>' +
      '<label>' + t('pub_folder') + '<input id="p-folder" value="' + esc(cfg.folder) + '" autocapitalize="off"></label></div>' +
      '<label>' + t('pub_token') + '<input id="p-token" type="password" autocomplete="off" value="' + esc(tokenGet()) + '"></label>' +
      '<p class="muted small">' + t('pub_token_hint') + '</p>' +
      '<label class="check"><input type="checkbox" id="p-remember" ' + (localStorage.getItem(LS + '.tok') ? 'checked' : '') + '> ' + t('pub_remember') + '</label></div>' +
      '<div class="card"><label>' + t('pub_file') + '<input id="p-file" type="file" accept=".xlsx,.xlsm"></label>' +
      '<div class="grid2"><label>' + t('pub_outlet') + '<input id="p-outlet" value="' + esc(cfg.outlet) + '"></label>' +
      '<label>' + t('pub_date') + '<input id="p-date" type="date"></label></div>' +
      '<label>' + t('pub_code') + '<input id="p-code" type="password" autocomplete="off" value="' + esc(ctx.code || '') + '"></label><p class="muted small">' + t('pub_code_hint') + '</p>' +
      '<button class="btn" id="p-parse">' + t('pub_parse') + '</button></div>' +
      '<div id="p-out"></div>';

    var $ = function (s) { return el.querySelector(s); };
    var out = $('#p-out');
    $('#p-file').addEventListener('change', function () {
      var f = this.files[0]; if (!f) return;
      var d = root.StockParse.dateFromName(f.name); if (d) $('#p-date').value = d;
    });

    function readCfg() {
      cfg = { owner: $('#p-owner').value.trim(), repo: $('#p-repo').value.trim(), branch: $('#p-branch').value.trim() || 'main', folder: $('#p-folder').value.trim(), outlet: $('#p-outlet').value.trim() || 'Mirpur-2' };
      save(cfg);
      return cfg;
    }
    function bad(msg) { out.insertAdjacentHTML('afterbegin', '<div class="card bad">' + esc(msg) + '</div>'); }

    $('#p-parse').addEventListener('click', async function () {
      var f = $('#p-file').files[0];
      if (!f) { out.innerHTML = '<div class="card bad">' + t('pub_missing') + '</div>'; return; }
      readCfg();
      out.innerHTML = '<div class="card">' + t('pub_reading') + '</div>';
      try {
        if (!root.ExcelJS) await C.loadScript('js/lib/exceljs.min.js');
        var buf = await f.arrayBuffer();
        parsed = await root.StockParse.parseWorkbook(root.ExcelJS, buf, { fileName: f.name, outlet: cfg.outlet, reportDate: $('#p-date').value || null });
        var st = parsed.stats, m = parsed.meta;
        var diff = '';
        if (ctx.items && ctx.items.length) {
          var live = {}, livePcs = 0;
          ctx.items.forEach(function (it) { live[it.bc] = 1; livePcs += it.q; });
          var added = 0, nb = {}; parsed.stock.rows.forEach(function (r) { nb[r[0]] = 1; if (!live[r[0]]) added++; });
          var removed = 0; Object.keys(live).forEach(function (b) { if (!nb[b]) removed++; });
          var dp = m.counts.pcs - livePcs;
          diff = '<h4>' + t('pub_diff') + '</h4><div class="kv"><span>+ ' + fmt(added) + ' ' + t('pub_added') + '</span><span>- ' + fmt(removed) + ' ' + t('pub_removed') + '</span><span>' + (dp >= 0 ? '+' : '') + fmt(dp) + ' ' + t('pub_pcs_delta') + '</span></div>';
        }
        out.innerHTML = '<div class="card"><h3>' + t('pub_preview') + '</h3>' +
          '<div class="kv"><span><b>' + fmt(m.counts.skus) + '</b> ' + t('pub_rows') + '</span><span><b>' + fmt(m.counts.pcs) + '</b> ' + t('pcs') + '</span><span><b>' + C.fmtMoney(m.counts.mrpValue) + '</b> MRP</span></div>' +
          '<p class="muted small">' + C.fmtDate(m.reportDate) + ' · ' + esc(m.outlet) + '<br>' + fmt(st.duplicatesDropped) + ' ' + t('pub_dupes') + ' · ' + fmt(st.blankCategory) + ' ' + t('pub_blank_cat') + ' · ' + fmt(st.blankSize) + ' ' + t('pub_blank_size') + '</p>' + diff +
          '<label class="check"><input type="checkbox" id="p-clean" checked> ' + t('pub_clean') + '</label>' +
          '<button class="btn" id="p-go">' + t('pub_publish') + '</button>' +
          '<div class="btnrow"><button class="btn ghost" id="p-dl">' + t('pub_dl') + '</button><button class="btn ghost" id="p-local">' + t('pub_local') + '</button></div>' +
          '<p class="muted small">' + t('pub_dl_hint') + '</p></div>';
        $('#p-go').addEventListener('click', publish);
        $('#p-dl').addEventListener('click', download);
        $('#p-local').addEventListener('click', useLocal);
      } catch (e) {
        out.innerHTML = '<div class="card bad">' + esc(e.message) + '</div>';
      }
    });

    async function seal() {
      var code = $('#p-code').value.trim();
      if (!code) { bad(t('pub_code_need')); return null; }
      parsed.meta.publishedAt = new Date().toISOString();
      parsed.stock.meta = parsed.meta;
      return { env: await C.encryptEnv(parsed.stock, code), code: code };
    }

    async function publish() {
      readCfg();
      var tok = $('#p-token').value.trim();
      if (!cfg.owner || !cfg.repo || !tok || !parsed) { bad(t('pub_missing')); return; }
      var btn = $('#p-go'); btn.disabled = true; btn.textContent = t('pub_enc');
      try {
        var sealed = await seal(); if (!sealed) { btn.disabled = false; btn.textContent = t('pub_publish'); return; }
        tokenSet(tok, $('#p-remember').checked);
        btn.textContent = t('pub_pushing');
        var msg = 'Stock data ' + (parsed.meta.reportDate || '') + ' (' + parsed.meta.counts.skus + ' SKUs, ' + parsed.meta.counts.pcs + ' pcs)';
        await putFile(cfg, tok, 'stock.dat', JSON.stringify(sealed.env), msg);
        var cleaned = false;
        if ($('#p-clean').checked) {
          var a = await deleteIfExists(cfg, tok, 'stock.json', 'Remove old unencrypted stock data');
          var b = await deleteIfExists(cfg, tok, 'meta.json', 'Remove old unencrypted stock meta');
          cleaned = a || b;
        }
        out.innerHTML = '<div class="card ok"><b>' + t('pub_done') + '</b>' + (cleaned ? '<br>' + t('pub_cleaned') : '') + '</div>';
        try { localStorage.setItem('si.code', sealed.code); } catch (e) { /* ignore */ }
        ctx.onPublished && ctx.onPublished(parsed.stock);
      } catch (e) {
        btn.disabled = false; btn.textContent = t('pub_publish');
        out.insertAdjacentHTML('afterbegin', '<div class="card bad"><b>' + t('pub_fail') + '</b><br>' + esc(e.message) + '</div>');
      }
    }

    async function download() {
      var sealed = await seal(); if (!sealed) return;
      var blob = new Blob([JSON.stringify(sealed.env)], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'stock.dat'; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    }

    function useLocal() {
      parsed.meta.publishedAt = new Date().toISOString(); parsed.stock.meta = parsed.meta;
      out.insertAdjacentHTML('afterbegin', '<div class="card ok"><b>' + t('pub_local_done') + '</b></div>');
      ctx.onPublished && ctx.onPublished(parsed.stock);
    }
  }

  root.Publisher = { mount: mount };
})(window);
