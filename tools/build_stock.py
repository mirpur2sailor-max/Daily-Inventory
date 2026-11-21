#!/usr/bin/env python3
"""Convert the outlet stock report (xlsx) into the encrypted data/stock.dat.
Mirrors js/stockparse.js exactly (used by the GitHub Action and for local checks).

Usage: STOCK_CODE=... python tools/build_stock.py data/source/Stock_Report.xlsx [--outlet Mirpur-2] [--out data] [--date YYYY-MM-DD]
"""
import argparse, json, os, re, sys
from datetime import datetime, timezone

import openpyxl

NA = 'N/A'
HEAD = {
    'BARCODE': 'bc', 'MASTER CATEGORY': 'm', 'LABEL': 'lb', 'GENDER': 'g', 'CATEGORY': 'c',
    'STYLE CODE': 'st', 'A02': 'se', 'SEASON': 'se', 'COLOUR': 'co', 'COLOR': 'co', 'SIZE': 'sz',
    'RCV QTY': 'rcv', 'SALE QTY': 'sale', 'BALANCE': 'q', 'MRP': 'mrp',
}
REQUIRED = ['bc', 'g', 'm', 'c', 'se', 'sz', 'q']


def norm(v):
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return ' '.join(str(v).split())


def up(v):
    return norm(v).upper()


def num(v):
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return 0


def date_from_name(name):
    m = re.search(r'(\d{1,2})[.\-_](\d{1,2})[.\-_](\d{4})', name or '')
    return f'{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}' if m else None


def build(path, outlet, report_date, published_at=None):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    all_rows = [list(r) for r in ws.iter_rows(values_only=True)]
    hi = 0
    for i, r in enumerate(all_rows[:15]):
        keys = {HEAD.get(up(h)) for h in r}
        if all(k in keys for k in REQUIRED):
            hi = i
            break
    header = all_rows[hi]
    it = iter(all_rows[hi + 1:])
    col = {}
    for i, h in enumerate(header):
        k = HEAD.get(up(h))
        if k and k not in col:
            col[k] = i
    missing = [k for k in REQUIRED if k not in col]
    if missing:
        sys.exit('Missing column(s): ' + ', '.join(missing))

    def get(r, k):
        i = col.get(k)
        return '' if i is None or i >= len(r) else r[i]

    def text(r, k, d):
        s = up(get(r, k))
        return s if s else d

    seen, out = {}, []
    stats = dict(rowsRead=0, duplicatesDropped=0, duplicatesMerged=0, blankCategory=0, blankSize=0, noBarcode=0, negativeClipped=0)
    for r in it:
        if r is None or all(c is None for c in r):
            continue
        stats['rowsRead'] += 1
        bc = re.sub(r'[^A-Z0-9]', '', up(get(r, 'bc')))
        if not bc:
            stats['noBarcode'] += 1
            continue
        size = text(r, 'sz', NA)
        if size in ('0', '--', '-'):
            size = NA
        cat = text(r, 'c', 'UNCATEGORISED')
        if cat == 'UNCATEGORISED':
            stats['blankCategory'] += 1
        if size == NA:
            stats['blankSize'] += 1
        q = num(get(r, 'q'))
        if q < 0:
            q = 0
            stats['negativeClipped'] += 1
        rec = [text(r, 'g', 'OTHERS'), text(r, 'm', 'OTHERS'), cat, text(r, 'se', NA), size, text(r, 'lb', NA),
               text(r, 'st', ''), text(r, 'co', NA)]
        tail = [max(0, num(get(r, 'mrp'))), num(get(r, 'rcv')), num(get(r, 'sale'))]
        sig = '\x01'.join(rec) + '\x01' + str(q) + '\x01' + '\x01'.join(map(str, tail))
        if bc in seen:
            if seen[bc][0] == sig:
                stats['duplicatesDropped'] += 1
            else:
                seen[bc][1][9] += q
                stats['duplicatesMerged'] += 1
            continue
        row = [bc] + rec + [q] + tail
        seen[bc] = (sig, row)
        out.append(row)

    D = {}
    for p, k in {1: 'g', 2: 'm', 3: 'c', 4: 'se', 5: 'sz', 6: 'lb', 8: 'co'}.items():
        lst = sorted({r[p] for r in out})
        mp = {v: i for i, v in enumerate(lst)}
        D[k] = lst
        for r in out:
            r[p] = mp[r[p]]

    pcs = sum(r[9] for r in out)
    mrp_value = sum(r[9] * r[10] for r in out)
    meta = {
        'schema': 2, 'outlet': outlet,
        'reportDate': report_date or date_from_name(os.path.basename(path)),
        'publishedAt': published_at or datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z'),
        'source': os.path.basename(path),
        'counts': {'skus': len(out), 'pcs': pcs, 'mrpValue': mrp_value},
    }
    return {'meta': meta, 'dict': D, 'rows': out}, meta, stats


def encrypt(stock, code, iterations=150000):
    """Same envelope as js/core.js Core.encrypt (PBKDF2-SHA256 -> AES-256-GCM)."""
    import base64
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    salt, iv = os.urandom(16), os.urandom(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iterations).derive(code.encode('utf-8'))
    raw = json.dumps(stock, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    ct = AESGCM(key).encrypt(iv, raw, None)
    b = lambda x: base64.b64encode(x).decode('ascii')
    m = stock['meta']
    return {'v': 1, 'updated': m['publishedAt'], 'label': 'Stock ' + (m.get('reportDate') or ''), 'outlet': m['outlet'],
            'iter': iterations, 'salt': b(salt), 'iv': b(iv), 'data': b(ct)}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('xlsx')
    ap.add_argument('--outlet', default='Mirpur-2')
    ap.add_argument('--out', default='data')
    ap.add_argument('--date', default=None)
    ap.add_argument('--published-at', default=None, help='ISO timestamp override (seeding only)')
    ap.add_argument('--plain', default=None, help='(testing) also write unencrypted json here - never commit it')
    ap.add_argument('--code', default=os.environ.get('STOCK_CODE'), help='access code (or env STOCK_CODE)')
    a = ap.parse_args()
    if not a.code:
        sys.exit('Access code required: --code or STOCK_CODE')
    stock, meta, stats = build(a.xlsx, a.outlet, a.date, a.published_at)
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, 'stock.dat'), 'w', encoding='utf-8') as f:
        json.dump(encrypt(stock, a.code), f, separators=(',', ':'))
    if a.plain:
        with open(a.plain, 'w', encoding='utf-8') as f:
            json.dump(stock, f, separators=(',', ':'), ensure_ascii=False)
    print(json.dumps({'meta': meta, 'stats': stats}, indent=2))
