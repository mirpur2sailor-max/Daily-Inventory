/* Standard stock-verification Excel report (ExcelJS). Pure function: usable in browser and Node. */
(function (root) {
  'use strict';
  var RED = 'FFC8102E', NAVY = 'FF14284B', LIGHT = 'FFF6F1F1';
  var FILL = { SHORT: 'FFFDE2E2', EXCESS: 'FFFFF1CC', MATCH: 'FFE3F6E8' };

  function fmtDT(ts) {
    var d = new Date(ts), p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function header(ws, cols) {
    ws.columns = cols.map(function (c) { return { header: c[0], key: c[1], width: c[2] }; });
    var r = ws.getRow(1);
    r.height = 24;
    r.eachCell(function (cell) {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: NAVY } } };
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  }

  /* data = { session, items, dict, meta, now } */
  async function buildReport(ExcelJS, data) {
    var s = data.session, items = data.items, D = data.dict, meta = data.meta;
    var now = data.now || Date.now();
    var wb = new ExcelJS.Workbook();
    wb.creator = 'Sailor Inventory'; wb.created = new Date(now);

    // ---- compute reconciliation ----
    var rec = [], short = [], excess = [], match = 0;
    var expPcs = 0, scanPcs = 0, shortPcs = 0, excessPcs = 0, matchedPcs = 0, shortVal = 0, excessVal = 0;
    s.scope.forEach(function (i) {
      var it = items[i], sc = s.counts[it.bc] || 0, v = sc - it.q;
      var type = v < 0 ? 'SHORT' : v > 0 ? 'EXCESS' : 'MATCH';
      var row = { it: it, sys: it.q, scan: sc, v: v, type: type, val: v * it.mrp };
      rec.push(row);
      expPcs += it.q; scanPcs += sc; matchedPcs += Math.min(sc, it.q);
      if (v < 0) { short.push(row); shortPcs += -v; shortVal += -v * it.mrp; }
      else if (v > 0) { excess.push(row); excessPcs += v; excessVal += v * it.mrp; }
      else match++;
    });
    var wrongList = Object.keys(s.wrong).map(function (b) { return Object.assign({ bc: b }, s.wrong[b]); });
    var outList = Object.keys(s.out).map(function (b) { return Object.assign({ bc: b }, s.out[b]); });
    var wrongTotal = wrongList.reduce(function (a, x) { return a + x.n; }, 0);
    var outTotal = outList.reduce(function (a, x) { return a + x.n; }, 0);
    var accuracy = expPcs ? matchedPcs / expPcs : 0;

    // ---- Summary ----
    var ws = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 34 }, { width: 46 }];
    ws.mergeCells('A1:B1');
    var t = ws.getCell('A1');
    t.value = 'SAILOR by EPYLLION - STOCK VERIFICATION REPORT';
    t.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
    t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(1).height = 32;
    var f = s.filters;
    var list = function (a) { return a && a.length ? a.join(', ') : 'ALL'; };
    var lines = [
      ['REPORT INFORMATION'],
      ['Outlet', meta.outlet || ''],
      ['Stock Report Date (system)', meta.reportDate || ''],
      ['Scan Started', fmtDT(s.createdAt)],
      ['Scan Completed', fmtDT(s.completedAt || now)],
      ['Scanned By', s.staff],
      ['Report Status', 'COMPLETED'],
      ['SCAN SELECTION'],
      ['Gender', list(f.g)], ['Master Category', list(f.m)], ['Category', list(f.c)], ['Season', list(f.se)], ['Size', list(f.sz)],
      ['RESULT (PCS)'],
      ['Expected SKUs (selection)', s.scope.length],
      ['System Qty (pcs)', expPcs],
      ['Scanned Qty (pcs)', scanPcs],
      ['Matched Qty (pcs)', matchedPcs],
      ['Short Qty (pcs)', shortPcs],
      ['Excess Qty (pcs)', excessPcs],
      ['Net Variance (pcs)', scanPcs - expPcs],
      ['Accuracy % (matched / system)', accuracy],
      ['SKUs - Matched', match],
      ['SKUs - Short', short.length],
      ['SKUs - Excess', excess.length],
      ['VALUE AT MRP (BDT)'],
      ['System Value', rec.reduce(function (a, r) { return a + r.it.q * r.it.mrp; }, 0)],
      ['Short Value', shortVal],
      ['Excess Value', excessVal],
      ['Net Variance Value', excessVal - shortVal],
      ['EXCEPTIONS'],
      ['Wrong Barcode - distinct', wrongList.length],
      ['Wrong Barcode - total scans', wrongTotal],
      ['Out of Selection - distinct', outList.length],
      ['Out of Selection - total scans', outTotal]
    ];
    var row = 3;
    lines.forEach(function (l) {
      var r = ws.getRow(row++);
      if (l.length === 1) {
        ws.mergeCells('A' + r.number + ':B' + r.number);
        r.getCell(1).value = l[0];
        r.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        r.getCell(1).alignment = { indent: 1 };
      } else {
        r.getCell(1).value = l[0]; r.getCell(2).value = l[1];
        r.getCell(1).font = { bold: true };
        r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
        r.getCell(2).alignment = { horizontal: 'left', wrapText: true };
        if (typeof l[1] === 'number') r.getCell(2).numFmt = /Accuracy/.test(l[0]) ? '0.0%' : '#,##0';
        [1, 2].forEach(function (c) { r.getCell(c).border = { bottom: { style: 'hair', color: { argb: 'FFBBBBBB' } } }; });
      }
    });

    // ---- Reconciliation ----
    var cols = [
      ['SL', 'sl', 6], ['Barcode', 'bc', 12], ['Style Code', 'st', 28], ['Gender', 'g', 10], ['Master Category', 'm', 18],
      ['Category', 'c', 26], ['Season', 'se', 18], ['Label', 'lb', 12], ['Colour', 'co', 22], ['Size', 'sz', 9], ['MRP', 'mrp', 9],
      ['System Qty', 'sys', 10], ['Scanned Qty', 'scan', 11], ['Variance (Scan - System)', 'v', 13], ['Variance Type', 'type', 12], ['Variance Value (MRP)', 'val', 14]
    ];
    function itemRow(r, i) {
      var it = r.it;
      return { sl: i + 1, bc: it.bc, st: it.st, g: D.g[it.g], m: D.m[it.m], c: D.c[it.c], se: D.se[it.se], lb: D.lb[it.lb], co: D.co[it.co], sz: D.sz[it.sz], mrp: it.mrp, sys: r.sys, scan: r.scan };
    }
    function fillSheet(name, rows, withFormula) {
      var w = wb.addWorksheet(name);
      header(w, cols);
      rows.forEach(function (r, i) {
        var o = itemRow(r, i), n = i + 2;
        var row = w.addRow(o);
        if (withFormula) {
          row.getCell('v').value = { formula: 'M' + n + '-L' + n, result: r.v };
          row.getCell('type').value = { formula: 'IF(N' + n + '<0,"SHORT",IF(N' + n + '>0,"EXCESS","MATCH"))', result: r.type };
          row.getCell('val').value = { formula: 'N' + n + '*K' + n, result: r.val };
        } else { row.getCell('v').value = r.v; row.getCell('type').value = r.type; row.getCell('val').value = r.val; }
        row.getCell('type').alignment = { horizontal: 'center' };
        if (r.type !== 'MATCH') row.getCell('type').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[r.type] } };
        ['mrp', 'val'].forEach(function (k) { row.getCell(k).numFmt = '#,##0'; });
      });
      return w;
    }
    // sort: SHORT first, then EXCESS, then MATCH (by master/style)
    var order = { SHORT: 0, EXCESS: 1, MATCH: 2 };
    rec.sort(function (a, b) { return order[a.type] - order[b.type] || D.m[a.it.m].localeCompare(D.m[b.it.m]) || a.it.st.localeCompare(b.it.st) || a.it.bc.localeCompare(b.it.bc); });
    fillSheet('Reconciliation', rec, true);
    short.sort(function (a, b) { return a.v - b.v || a.it.bc.localeCompare(b.it.bc); });
    excess.sort(function (a, b) { return b.v - a.v || a.it.bc.localeCompare(b.it.bc); });
    fillSheet('Short', short, false);
    fillSheet('Excess', excess, false);

    // ---- Wrong barcode ----
    var w1 = wb.addWorksheet('Wrong Barcode');
    header(w1, [['SL', 'sl', 6], ['Scanned Barcode', 'bc', 22], ['Times Scanned', 'n', 14], ['First Scanned At', 't', 20], ['Remarks', 'r', 44]]);
    wrongList.sort(function (a, b) { return b.n - a.n; }).forEach(function (x, i) {
      w1.addRow({ sl: i + 1, bc: x.bc, n: x.n, t: fmtDT(x.t), r: 'Barcode not found in stock report' });
    });

    // ---- Out of selection ----
    var w2 = wb.addWorksheet('Out of Selection');
    header(w2, [['SL', 'sl', 6], ['Barcode', 'bc', 12], ['Style Code', 'st', 28], ['Gender', 'g', 10], ['Master Category', 'm', 18], ['Category', 'c', 26], ['Season', 'se', 18], ['Size', 'sz', 9], ['Times Scanned', 'n', 14], ['Remarks', 'r', 40]]);
    outList.sort(function (a, b) { return b.n - a.n; }).forEach(function (x, i) {
      var it = data.byBarcode[x.bc];
      w2.addRow({ sl: i + 1, bc: x.bc, st: it ? it.st : '', g: it ? D.g[it.g] : '', m: it ? D.m[it.m] : '', c: it ? D.c[it.c] : '', se: it ? D.se[it.se] : '', sz: it ? D.sz[it.sz] : '', n: x.n, r: 'Valid product but outside selected scan scope (rejected)' });
    });

    // ---- Scan log ----
    var w3 = wb.addWorksheet('Scan Log');
    header(w3, [['SL', 'sl', 7], ['Time', 't', 20], ['Barcode', 'bc', 12], ['Result', 'r', 16], ['Method', 'm', 10]]);
    var names = { OK: 'OK', EXCESS: 'EXCESS', OUT: 'OUT OF SELECTION', WRONG: 'WRONG BARCODE', UNDO: 'UNDO' };
    s.log.forEach(function (l, i) {
      w3.addRow({ sl: i + 1, t: fmtDT(l.t), bc: l.bc, r: names[l.r] || l.r, m: l.m || 'CAMERA' });
    });

    return wb.xlsx.writeBuffer();
  }

  function fileName(session, meta) {
    var p = function (n) { return ('0' + n).slice(-2); }, d = new Date(session.completedAt || Date.now());
    var clean = function (x) { return String(x).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
    var sel = [].concat(session.filters.m || [], session.filters.c || []).slice(0, 2).map(clean).join('_') || [].concat(session.filters.g || []).map(clean).join('_') || 'ALL';
    return 'Inventory_' + clean(meta.outlet || 'Outlet') + '_' + sel.slice(0, 40) + '_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '_' + clean(session.staff).slice(0, 20) + '.xlsx';
  }

  var api = { buildReport: buildReport, fileName: fileName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Report = api;
})(typeof window !== 'undefined' ? window : globalThis);
