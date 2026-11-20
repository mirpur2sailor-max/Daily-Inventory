/* Core helpers: i18n, IndexedDB key-value store, utilities, sound. */
(function (root) {
  'use strict';

  /* ---------- i18n ---------- */
  var EN = {
    app: 'Sailor Inventory', tagline: 'Stock verification', outlet: 'Outlet',
    home: 'Home', scan: 'Scan', history: 'Reports', settings: 'Settings',
    unlock: 'Unlock', password: 'Password', enter_password: 'Enter app password', wrong_password: 'Incorrect password',
    stock_as_of: 'Stock as of', skus: 'SKUs', pcs: 'pcs', value_mrp: 'Stock value (MRP)', sold: 'Sold', sell_through: 'Sell-thru',
    start_scan: 'Start new scan', resume_scan: 'Resume scan', resume_hint: 'Scan in progress',
    by_gender: 'Stock by gender', by_master: 'Stock by master category', no_data: 'No stock data yet. Ask admin to publish the stock report.',
    gender: 'Gender', master: 'Master Category', category: 'Category', season: 'Season', size: 'Size',
    all: 'All', selected: 'selected', search: 'Search', clear: 'Clear', done: 'Done', select_all: 'Select all',
    your_name: 'Your name', your_name_ph: 'Staff name', choose_section: 'Choose what you will scan',
    selection: 'Selection', expected: 'Expected', need_filter: 'Select at least one filter to begin',
    need_name: 'Enter your name to begin', big_selection: 'Large selection. Scan one category per day for best accuracy.',
    start: 'Start scanning', empty_scope: 'No items match this selection',
    scanned: 'Scanned', of: 'of', missing: 'Missing', excess: 'Excess', wrong: 'Wrong', rejected: 'Other',
    last_scan: 'Last scan', scan_ready: 'Point the camera at a barcode', camera_error: 'Camera not available', retry: 'Retry camera',
    manual_ph: 'Type / USB-scan barcode', add: 'Add', undo: 'Undo', torch: 'Torch', pause: 'Pause', resume: 'Resume', paused: 'Paused',
    finish: 'Finish & report', discard: 'Discard scan', discard_q: 'Discard this scan? All scanned counts will be lost.',
    ok_scan: 'Matched', excess_scan: 'Excess: more than system stock', out_scan: 'Not in selected section - rejected', wrong_scan: 'Barcode not in stock report',
    need: 'Need', have: 'Scanned', system: 'System', found_manual: '+1 Found', remove_one: '-1',
    nothing_missing: 'Nothing missing', nothing_here: 'Nothing here', show_more: 'Show more',
    review: 'Review before export', rescan: 'Continue scanning', complete_export: 'Complete & create Excel',
    expected_pcs: 'System qty', scanned_pcs: 'Scanned qty', short_pcs: 'Short', excess_pcs: 'Excess', wrong_bc: 'Wrong barcodes', accuracy: 'Accuracy',
    missing_warn: 'items are still missing. You can continue scanning to find them.',
    building: 'Building Excel report...', report_ready: 'Report ready', share: 'Share', download: 'Download', close: 'Close',
    no_history: 'No completed reports yet', delete: 'Delete', delete_q: 'Delete this report?', completed: 'Completed', by: 'by',
    language: 'Language', sound: 'Beep sound', vibrate: 'Vibration', camera: 'Camera', camera_auto: 'Auto (back camera)',
    data: 'Stock data', check_update: 'Check for update', up_to_date: 'Stock data is up to date', updated: 'Stock data updated', update_failed: 'Could not check for update (offline?)',
    pending_update: 'New stock data is ready. It will apply when you finish or discard the current scan.',
    admin: 'Admin', publisher: 'Stock data publisher', publisher_hint: 'Upload the latest stock report to GitHub so all staff phones update.',
    lock_now: 'Lock app', reset_local: 'Reset local data', reset_q: 'Delete all local data on this phone (stock cache, active scan, reports)?',
    version: 'Version', published: 'Published',
    pub_repo: 'GitHub repository', pub_owner: 'Owner', pub_name: 'Repository', pub_branch: 'Branch', pub_folder: 'Data folder', pub_token: 'GitHub access token',
    pub_token_hint: 'Fine-grained token with Contents: read & write on this repository only.', pub_remember: 'Remember token on this device',
    pub_file: 'Stock report (.xlsx)', pub_outlet: 'Outlet name', pub_date: 'Report date', pub_parse: 'Read & preview', pub_publish: 'Publish to GitHub',
    pub_preview: 'Preview', pub_rows: 'SKUs', pub_dupes: 'duplicate rows ignored', pub_blank_cat: 'blank category', pub_blank_size: 'no size',
    pub_diff: 'Change vs live data', pub_added: 'new SKUs', pub_removed: 'removed SKUs', pub_pcs_delta: 'pcs change',
    pub_done: 'Published. Staff phones update within a few minutes.', pub_fail: 'Publish failed', pub_missing: 'Fill repository, token and choose a file',
    pub_reading: 'Reading Excel...', pub_pushing: 'Uploading to GitHub...', back: 'Back', cancel: 'Cancel', ok: 'OK', offline: 'Offline'
  };
  var BN = {
    app: 'সেইলর ইনভেন্টরি', tagline: 'স্টক যাচাই', outlet: 'আউটলেট',
    home: 'হোম', scan: 'স্ক্যান', history: 'রিপোর্ট', settings: 'সেটিংস',
    unlock: 'আনলক', password: 'পাসওয়ার্ড', enter_password: 'অ্যাপের পাসওয়ার্ড দিন', wrong_password: 'পাসওয়ার্ড ভুল',
    stock_as_of: 'স্টকের তারিখ', skus: 'SKU', pcs: 'পিস', value_mrp: 'স্টক ভ্যালু (MRP)', sold: 'বিক্রি', sell_through: 'সেল-থ্রু',
    start_scan: 'নতুন স্ক্যান শুরু', resume_scan: 'স্ক্যান চালিয়ে যান', resume_hint: 'স্ক্যান চলমান',
    by_gender: 'জেন্ডার অনুযায়ী স্টক', by_master: 'মাস্টার ক্যাটাগরি অনুযায়ী স্টক', no_data: 'এখনও স্টক ডাটা নেই। অ্যাডমিনকে স্টক রিপোর্ট পাবলিশ করতে বলুন।',
    gender: 'জেন্ডার', master: 'মাস্টার ক্যাটাগরি', category: 'ক্যাটাগরি', season: 'সিজন', size: 'সাইজ',
    all: 'সব', selected: 'নির্বাচিত', search: 'খুঁজুন', clear: 'মুছুন', done: 'ঠিক আছে', select_all: 'সব নির্বাচন',
    your_name: 'আপনার নাম', your_name_ph: 'স্টাফের নাম', choose_section: 'কী স্ক্যান করবেন তা বাছুন',
    selection: 'নির্বাচন', expected: 'প্রত্যাশিত', need_filter: 'শুরু করতে অন্তত একটি ফিল্টার বাছুন',
    need_name: 'শুরু করতে আপনার নাম লিখুন', big_selection: 'নির্বাচন অনেক বড়। সঠিকতার জন্য দিনে একটি ক্যাটাগরি স্ক্যান করুন।',
    start: 'স্ক্যান শুরু করুন', empty_scope: 'এই নির্বাচনে কোনো পণ্য নেই',
    scanned: 'স্ক্যান', of: '/', missing: 'পাওয়া যায়নি', excess: 'এক্সেস', wrong: 'ভুল', rejected: 'অন্য',
    last_scan: 'সর্বশেষ স্ক্যান', scan_ready: 'বারকোডের দিকে ক্যামেরা ধরুন', camera_error: 'ক্যামেরা চালু করা যায়নি', retry: 'আবার চেষ্টা',
    manual_ph: 'বারকোড টাইপ / USB স্ক্যান', add: 'যোগ', undo: 'আনডু', torch: 'টর্চ', pause: 'বিরতি', resume: 'চালু', paused: 'বিরতিতে',
    finish: 'শেষ ও রিপোর্ট', discard: 'স্ক্যান বাতিল', discard_q: 'এই স্ক্যান বাতিল করবেন? সব স্ক্যান কাউন্ট মুছে যাবে।',
    ok_scan: 'মিলেছে', excess_scan: 'এক্সেস: সিস্টেম স্টকের বেশি', out_scan: 'নির্বাচিত সেকশনের বাইরে - বাদ', wrong_scan: 'বারকোড স্টক রিপোর্টে নেই',
    need: 'দরকার', have: 'স্ক্যান', system: 'সিস্টেম', found_manual: '+1 পেয়েছি', remove_one: '-1',
    nothing_missing: 'কিছু মিসিং নেই', nothing_here: 'কিছু নেই', show_more: 'আরও দেখুন',
    review: 'এক্সপোর্টের আগে দেখুন', rescan: 'স্ক্যান চালিয়ে যান', complete_export: 'সম্পন্ন করে Excel বানান',
    expected_pcs: 'সিস্টেম পরিমাণ', scanned_pcs: 'স্ক্যান পরিমাণ', short_pcs: 'শর্ট', excess_pcs: 'এক্সেস', wrong_bc: 'ভুল বারকোড', accuracy: 'নির্ভুলতা',
    missing_warn: 'টি আইটেম এখনও পাওয়া যায়নি। খুঁজতে আবার স্ক্যান করতে পারেন।',
    building: 'Excel রিপোর্ট তৈরি হচ্ছে...', report_ready: 'রিপোর্ট তৈরি', share: 'শেয়ার', download: 'ডাউনলোড', close: 'বন্ধ',
    no_history: 'এখনও কোনো সম্পন্ন রিপোর্ট নেই', delete: 'মুছুন', delete_q: 'এই রিপোর্ট মুছবেন?', completed: 'সম্পন্ন', by: 'স্টাফ',
    language: 'ভাষা', sound: 'বিপ শব্দ', vibrate: 'ভাইব্রেশন', camera: 'ক্যামেরা', camera_auto: 'অটো (পিছনের ক্যামেরা)',
    data: 'স্টক ডাটা', check_update: 'আপডেট চেক করুন', up_to_date: 'স্টক ডাটা আপ-টু-ডেট', updated: 'স্টক ডাটা আপডেট হয়েছে', update_failed: 'আপডেট চেক করা যায়নি (অফলাইন?)',
    pending_update: 'নতুন স্টক ডাটা প্রস্তুত। চলমান স্ক্যান শেষ বা বাতিল করলে প্রয়োগ হবে।',
    admin: 'অ্যাডমিন', publisher: 'স্টক ডাটা পাবলিশার', publisher_hint: 'সর্বশেষ স্টক রিপোর্ট GitHub-এ আপলোড করুন, সব স্টাফের ফোন আপডেট হবে।',
    lock_now: 'অ্যাপ লক করুন', reset_local: 'লোকাল ডাটা রিসেট', reset_q: 'এই ফোনের সব লোকাল ডাটা (স্টক ক্যাশ, চলমান স্ক্যান, রিপোর্ট) মুছবেন?',
    version: 'ভার্সন', published: 'পাবলিশ',
    pub_repo: 'GitHub রিপোজিটরি', pub_owner: 'ওনার', pub_name: 'রিপোজিটরি', pub_branch: 'ব্রাঞ্চ', pub_folder: 'ডাটা ফোল্ডার', pub_token: 'GitHub অ্যাক্সেস টোকেন',
    pub_token_hint: 'শুধু এই রিপোজিটরির Contents: read & write অনুমতিসহ fine-grained টোকেন।', pub_remember: 'এই ডিভাইসে টোকেন মনে রাখুন',
    pub_file: 'স্টক রিপোর্ট (.xlsx)', pub_outlet: 'আউটলেটের নাম', pub_date: 'রিপোর্টের তারিখ', pub_parse: 'পড়ুন ও প্রিভিউ', pub_publish: 'GitHub-এ পাবলিশ',
    pub_preview: 'প্রিভিউ', pub_rows: 'SKU', pub_dupes: 'ডুপ্লিকেট রো বাদ', pub_blank_cat: 'ক্যাটাগরি ফাঁকা', pub_blank_size: 'সাইজ নেই',
    pub_diff: 'বর্তমান ডাটার সাথে পরিবর্তন', pub_added: 'নতুন SKU', pub_removed: 'বাদ পড়া SKU', pub_pcs_delta: 'পিস পরিবর্তন',
    pub_done: 'পাবলিশ হয়েছে। কয়েক মিনিটের মধ্যে স্টাফদের ফোনে আপডেট হবে।', pub_fail: 'পাবলিশ ব্যর্থ', pub_missing: 'রিপোজিটরি, টোকেন ও ফাইল দিন',
    pub_reading: 'Excel পড়া হচ্ছে...', pub_pushing: 'GitHub-এ আপলোড হচ্ছে...', back: 'পিছনে', cancel: 'বাতিল', ok: 'ঠিক আছে', offline: 'অফলাইন'
  };
  var LANGS = { en: EN, bn: BN };
  var lang = 'en';
  function t(k) { return (LANGS[lang] && LANGS[lang][k]) || EN[k] || k; }
  function setLang(l) { lang = LANGS[l] ? l : 'en'; document.documentElement.lang = lang === 'bn' ? 'bn' : 'en'; }

  /* ---------- IndexedDB KV ---------- */
  var dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open('sailor-inventory', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var s = db.transaction('kv', mode).objectStore('kv'), q = fn(s);
        q.onsuccess = function () { res(q.result); };
        q.onerror = function () { rej(q.error); };
      });
    });
  }
  var DB = {
    get: function (k) { return tx('readonly', function (s) { return s.get(k); }); },
    set: function (k, v) { return tx('readwrite', function (s) { return s.put(v, k); }); },
    del: function (k) { return tx('readwrite', function (s) { return s.delete(k); }); },
    keys: function () { return tx('readonly', function (s) { return s.getAllKeys(); }); },
    clear: function () { return tx('readwrite', function (s) { return s.clear(); }); }
  };

  /* ---------- utils ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }
  function fmtMoney(n) {
    n = Number(n || 0);
    if (Math.abs(n) >= 1e7) return (n / 1e7).toFixed(2) + ' Cr';
    if (Math.abs(n) >= 1e5) return (n / 1e5).toFixed(2) + ' Lac';
    return fmt(n);
  }
  function fmtDate(iso) {
    if (!iso) return '-';
    var d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtDT(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  var LET = ['NB', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '3XL', '4XL'];
  function sizeRank(s) {
    var b = String(s).toUpperCase().replace(/\s*\(.*\)$/, '').trim(), i = LET.indexOf(b), m;
    if (i >= 0) return 1000 + i;
    if ((m = /^(\d+)\s*M$/.exec(b))) return 2000 + Number(m[1]);
    if ((m = /^(\d+)(?:-\d+)?Y$/.exec(b))) return 3000 + Number(m[1]);
    if ((m = /^(\d+(?:\.\d+)?)/.exec(b))) return 4000 + Number(m[1]);
    return b === 'N/A' ? 99999 : 9000;
  }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  async function sha256(text) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function b64(str) {
    var bytes = new TextEncoder().encode(str), bin = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }

  /* ---------- sound ---------- */
  var ac = null;
  var Sound = {
    enabled: true, vib: true,
    init: function () { try { if (!ac) ac = new (root.AudioContext || root.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { /* none */ } },
    tone: function (f, d, when, type) {
      if (!ac) return;
      var o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime + (when || 0);
      o.type = type || 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + d + 0.02);
    },
    play: function (kind) {
      if (this.enabled) {
        if (kind === 'OK') this.tone(1250, 0.09);
        else if (kind === 'EXCESS') { this.tone(700, 0.1); this.tone(700, 0.1, 0.13); }
        else { this.tone(220, 0.18, 0, 'square'); this.tone(180, 0.22, 0.2, 'square'); }
      }
      if (this.vib && navigator.vibrate) navigator.vibrate(kind === 'OK' ? 25 : [60, 40, 90]);
    }
  };

  root.Core = { t: t, setLang: setLang, getLang: function () { return lang; }, DB: DB, esc: esc, fmt: fmt, fmtMoney: fmtMoney, fmtDate: fmtDate, fmtDT: fmtDT, sizeRank: sizeRank, loadScript: loadScript, sha256: sha256, b64: b64, Sound: Sound, EN: EN, BN: BN };
})(window);
