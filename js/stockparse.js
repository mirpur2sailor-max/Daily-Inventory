/* Stock report (xlsx) -> compact stock.json.  Mirrors tools/build_stock.py exactly. */
(function (root) {
  'use strict';
  var NA = 'N/A';

  function norm(v) {
    if (v == null) return '';
    if (typeof v === 'object') {
      if (v instanceof Date) return '';
      if (v.result != null) v = v.result;
      else if (v.richText) v = v.richText.map(function (t) { return t.text; }).join('');
      else if (v.text != null) v = v.text;
      else return '';
    }
    return String(v).replace(/\s+/g, ' ').trim();
  }
  function up(v) { return norm(v).toUpperCase(); }
  function num(v) {
    if (v && typeof v === 'object' && v.result != null) v = v.result;
    var n = Number(v);
    return isFinite(n) ? Math.round(n) : 0;
  }

  var HEAD = {
    'BARCODE': 'bc', 'MASTER CATEGORY': 'm', 'LABEL': 'lb', 'GENDER': 'g', 'CATEGORY': 'c',
    'STYLE CODE': 'st', 'A02': 'se', 'SEASON': 'se', 'COLOUR': 'co', 'COLOR': 'co', 'SIZE': 'sz',
    'RCV QTY': 'rcv', 'SALE QTY': 'sale', 'BALANCE': 'q', 'MRP': 'mrp'
  };
  var REQUIRED = ['bc', 'g', 'm', 'c', 'se', 'sz', 'q'];
  var REQ_NAMES = { bc: 'BARCODE', g: 'GENDER', m: 'MASTER CATEGORY', c: 'CATEGORY', se: 'A02 (Season)', sz: 'Size', q: 'BALANCE' };

  function dateFromName(name) {
    var m = /(\d{1,2})[.\-_](\d{1,2})[.\-_](\d{4})/.exec(name || '');
    if (!m) return null;
    return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  }

  /* headerCells: array of header values; rows: array of arrays (same positions) */
  function build(headerCells, rows, opts) {
    opts = opts || {};
    var col = {};
    headerCells.forEach(function (h, i) {
      var key = HEAD[up(h)];
      if (key && col[key] === undefined) col[key] = i;
    });
    var missing = REQUIRED.filter(function (k) { return col[k] === undefined; });
    if (missing.length) throw new Error('Missing column(s): ' + missing.map(function (k) { return REQ_NAMES[k]; }).join(', '));

    var D = { g: {}, m: {}, c: {}, se: {}, sz: {}, lb: {}, co: {} };
    var seen = {}, out = [];
    var stats = { rowsRead: 0, duplicatesDropped: 0, duplicatesMerged: 0, blankCategory: 0, blankSize: 0, noBarcode: 0, negativeClipped: 0 };

    function get(r, k) { return col[k] === undefined ? '' : r[col[k]]; }
    function text(r, k, dflt) { var s = up(get(r, k)); return s === '' ? dflt : s; }

    rows.forEach(function (r) {
      stats.rowsRead++;
      var bc = up(get(r, 'bc')).replace(/[^A-Z0-9]/g, '');
      if (!bc) { stats.noBarcode++; return; }
      var size = text(r, 'sz', NA);
      if (size === '0' || size === '--' || size === '-') size = NA;
      var cat = text(r, 'c', 'UNCATEGORISED');
      if (cat === 'UNCATEGORISED') stats.blankCategory++;
      if (size === NA) stats.blankSize++;
      var q = num(get(r, 'q'));
      if (q < 0) { q = 0; stats.negativeClipped++; }
      var rec = [
        text(r, 'g', 'OTHERS'), text(r, 'm', 'OTHERS'), cat, text(r, 'se', NA), size, text(r, 'lb', NA),
        text(r, 'st', ''), text(r, 'co', NA)
      ];
      var tail = [Math.max(0, num(get(r, 'mrp'))), num(get(r, 'rcv')), num(get(r, 'sale'))];
      var sig = rec.join('\u0001') + '\u0001' + q + '\u0001' + tail.join('\u0001');
      if (Object.prototype.hasOwnProperty.call(seen, bc)) {
        var prev = seen[bc];
        if (prev.sig === sig) { stats.duplicatesDropped++; return; }
        prev.row[9] += q; stats.duplicatesMerged++; return;
      }
      var row = [bc, rec[0], rec[1], rec[2], rec[3], rec[4], rec[5], rec[6], rec[7], q].concat(tail);
      seen[bc] = { sig: sig, row: row };
      out.push(row);
    });

    // dictionary-encode  (row layout v2: bc,g,m,c,se,sz,lb,st,co,q,mrp,rcv,sale  - cost price is never stored)
    var idxCols = { 1: 'g', 2: 'm', 3: 'c', 4: 'se', 5: 'sz', 6: 'lb', 8: 'co' };
    Object.keys(idxCols).forEach(function (p) {
      var k = idxCols[p], set = {};
      out.forEach(function (r) { set[r[p]] = 1; });
      var list = Object.keys(set).sort();
      var map = {}; list.forEach(function (v, i) { map[v] = i; });
      D[k] = list;
      out.forEach(function (r) { r[p] = map[r[p]]; });
    });

    var pcs = 0, mrpValue = 0;
    out.forEach(function (r) { pcs += r[9]; mrpValue += r[9] * r[10]; });

    var meta = {
      schema: 2,
      outlet: opts.outlet || 'Mirpur-2',
      reportDate: opts.reportDate || dateFromName(opts.fileName) || null,
      publishedAt: opts.publishedAt || new Date().toISOString(),
      source: opts.fileName || '',
      counts: { skus: out.length, pcs: pcs, mrpValue: mrpValue }
    };
    return { stock: { meta: meta, dict: D, rows: out }, meta: meta, stats: stats };
  }

  function headerIndex(all) {
    for (var i = 0; i < Math.min(all.length, 15); i++) {
      var keys = {};
      (all[i] || []).forEach(function (h) { var k = HEAD[up(h)]; if (k) keys[k] = 1; });
      if (REQUIRED.every(function (k) { return keys[k]; })) return i;
    }
    return 0;
  }

  async function parseWorkbook(ExcelJS, buffer, opts) {
    var wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    var ws = wb.worksheets[0];
    if (!ws) throw new Error('No worksheet found');
    var all = [];
    ws.eachRow({ includeEmpty: false }, function (row) {
      var vals = row.values; // 1-based sparse
      var arr = new Array(Math.max(vals.length - 1, 0));
      for (var i = 1; i < vals.length; i++) arr[i - 1] = vals[i];
      all.push(arr);
    });
    var h = headerIndex(all);
    return build(all[h] || [], all.slice(h + 1), opts);
  }

  var api = { build: build, parseWorkbook: parseWorkbook, dateFromName: dateFromName, NA: NA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.StockParse = api;
})(typeof window !== 'undefined' ? window : globalThis);
