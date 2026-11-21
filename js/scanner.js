/* Camera barcode scanner v2.
   Combines native BarcodeDetector (fast, Android Chrome) with ZXing WASM (HD reader, works everywhere),
   multi-pass sharpening for blurry low-end cameras, zoom steps, torch, camera switching and photo fallback.
   (Decoding approach proven in the Sailor planner app.) */
(function (root) {
  'use strict';
  var LIN = ['Code128', 'Code39', 'Code93', 'EAN-13', 'EAN-8', 'UPC-A', 'UPC-E', 'ITF', 'Codabar'];
  var ALL = LIN.concat(['QRCode', 'DataMatrix']);
  var NATIVE = ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar', 'qr_code', 'data_matrix'];
  // passes tried in turn: plain frame, then sharpened versions (rescues blurry cameras)
  var PASSES = [{ sh: 0 }, { sh: 2, amt: 1.5 }, { sh: 4, amt: 2, up: 2 }, { sh: 3, amt: 3 }];
  var LSKEY = 'si.cam';

  function lsGet() { try { return localStorage.getItem(LSKEY) || ''; } catch (e) { return ''; } }
  function lsSet(v) { try { if (v) localStorage.setItem(LSKEY, v); else localStorage.removeItem(LSKEY); } catch (e) { /* ignore */ } }

  /* opts: { video, cam (container), frame (guide element), onCode(text) } */
  function Scanner(opts) {
    this.V = opts.video; this.CAM = opts.cam; this.FR = opts.frame; this.onCode = opts.onCode;
    this.cv = document.createElement('canvas');
    this.ctx = this.cv.getContext('2d', { willReadFrequently: true });
    this.stream = null; this.track = null; this.running = false; this.busy = false; this.timer = 0;
    this.n = 0; this.native = null; this.wasm = false; this.zooms = [1]; this.zi = 0; this.torch = false; this.devs = []; this.decT = 0;
    this.caps = {}; this.pauseUntil = 0;
  }
  var P = Scanner.prototype;

  P.initDecoders = function () {
    var self = this;
    if (!self.wasm && root.ZXingWASM) {
      try {
        root.ZXingWASM.prepareZXingModule({ overrides: { locateFile: function (p, pre) { return p.endsWith('.wasm') ? new URL('js/lib/' + p, location.href).href : pre + p; } }, fireImmediately: true });
        self.wasm = true;
      } catch (e) { /* ignore */ }
    }
    if (!self.native && 'BarcodeDetector' in root) {
      Promise.resolve(root.BarcodeDetector.getSupportedFormats ? root.BarcodeDetector.getSupportedFormats() : NATIVE).then(function (sup) {
        var f = NATIVE.filter(function (x) { return sup.indexOf(x) >= 0; });
        if (f.length) self.native = new root.BarcodeDetector({ formats: f });
      }).catch(function () { /* ignore */ });
    }
  };

  P.getStream = async function () {
    var saved = lsGet(), base = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }, tries = [];
    if (saved) tries.push({ audio: false, video: Object.assign({ deviceId: { exact: saved } }, base) });
    tries.push({ audio: false, video: Object.assign({ facingMode: { ideal: 'environment' } }, base) }, { audio: false, video: { facingMode: 'environment' } }, { audio: false, video: true });
    var err;
    for (var i = 0; i < tries.length; i++) {
      try { return await navigator.mediaDevices.getUserMedia(tries[i]); } catch (e) {
        err = e; if (e && e.name === 'NotAllowedError') throw e; if (tries[i].video.deviceId) lsSet('');
      }
    }
    throw err;
  };

  P.start = async function () {
    if (this.running) return;
    this.initDecoders();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { var u = new Error('unsupported'); u.name = 'Unsupported'; throw u; }
    this.stream = await this.getStream();
    this.track = this.stream.getVideoTracks()[0];
    this.V.srcObject = this.stream; this.V.setAttribute('playsinline', ''); this.V.muted = true;
    await this.V.play().catch(function () { /* ignore */ });
    var caps = {}; try { caps = this.track.getCapabilities ? this.track.getCapabilities() : {}; } catch (e) { caps = {}; }
    this.caps = caps;
    var adv = [];
    if (caps.focusMode && caps.focusMode.indexOf('continuous') >= 0) adv.push({ focusMode: 'continuous' });
    if (caps.exposureMode && caps.exposureMode.indexOf('continuous') >= 0) adv.push({ exposureMode: 'continuous' });
    if (adv.length) this.track.applyConstraints({ advanced: adv }).catch(function () { /* ignore */ });
    this.zooms = [1]; if (caps.zoom) [1.5, 2, 3].forEach(function (z) { if (z <= caps.zoom.max) this.zooms.push(z); }, this);
    this.zi = 0; this.torch = false;
    try { this.devs = (await navigator.mediaDevices.enumerateDevices()).filter(function (d) { return d.kind === 'videoinput'; }); } catch (e) { this.devs = []; }
    this.running = true;
    this._loop();
  };

  P.stopTracks = function () {
    if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); });
    this.stream = null; this.track = null; this.torch = false;
    try { this.V.srcObject = null; } catch (e) { /* ignore */ }
  };
  P.stop = function () { this.running = false; clearTimeout(this.timer); this.stopTracks(); };

  P.hasTorch = function () { return !!this.caps.torch; };
  P.hasZoom = function () { return this.zooms.length > 1; };
  P.hasMultiCam = function () { return this.devs.length > 1; };
  P.info = function () {
    var st = this.track && this.track.getSettings ? this.track.getSettings() : {};
    return (st.width && st.height ? st.width + '×' + st.height : '') + (this.native ? ' · fast reader' : '') + (this.wasm ? ' · HD reader' : '');
  };
  P.toggleTorch = async function () {
    if (!this.track) return false;
    this.torch = !this.torch;
    try { await this.track.applyConstraints({ advanced: [{ torch: this.torch }] }); return this.torch; } catch (e) { this.torch = false; throw e; }
  };
  P.cycleZoom = async function () {
    if (!this.track) return 1;
    this.zi = (this.zi + 1) % this.zooms.length; var z = this.zooms[this.zi];
    try { await this.track.applyConstraints({ advanced: [{ zoom: z }] }); } catch (e) { /* ignore */ }
    return z;
  };
  P.nextCamera = async function () {
    if (!this.devs.length) return '';
    var cur = this.track && this.track.getSettings ? this.track.getSettings().deviceId : '';
    var i = this.devs.findIndex(function (d) { return d.deviceId === cur; }), nx = this.devs[(i + 1) % this.devs.length];
    lsSet(nx.deviceId); this.stop(); await this.start();
    return nx.label || '';
  };
  P.holdFor = function (ms) { this.pauseUntil = Date.now() + ms; };

  P._loop = function () { var self = this; clearTimeout(self.timer); if (self.running) self.timer = setTimeout(function () { self._tick(); }, self.decT > 120 ? 40 : 80); };

  function blur1(src, w, h, r, horiz) {
    var out = new Float32Array(src.length), len = horiz ? w : h, lines = horiz ? h : w, st = horiz ? 1 : w, ls = horiz ? w : 1, k = 2 * r + 1;
    for (var l = 0; l < lines; l++) {
      var o = l * ls, sum = 0, i;
      for (i = -r; i <= r; i++) sum += src[o + Math.min(len - 1, Math.max(0, i)) * st];
      for (i = 0; i < len; i++) { out[o + i * st] = sum / k; sum += src[o + Math.min(len - 1, i + r + 1) * st] - src[o + Math.max(0, i - r) * st]; }
    }
    return out;
  }
  function sharpen(img, r, amt) { // unsharp mask on luminance
    var w = img.width, h = img.height, d = img.data, n = w * h, L = new Float32Array(n), i, j;
    for (i = 0, j = 0; i < n; i++, j += 4) L[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    var B = blur1(L, w, h, r, true); B = blur1(B, w, h, r, false); B = blur1(B, w, h, r, true); B = blur1(B, w, h, r, false);
    for (i = 0, j = 0; i < n; i++, j += 4) { var v = L[i] + amt * (L[i] - B[i]); v = v < 0 ? 0 : v > 255 ? 255 : v; d[j] = d[j + 1] = d[j + 2] = v; }
    return img;
  }

  /* grab the guide window (slightly padded) or, every 7th frame, the whole frame */
  P._grab = function (full) {
    var V = this.V, vw = V.videoWidth, vh = V.videoHeight; if (!vw || !vh) return null;
    var sx = 0, sy = 0, sw = vw, sh = vh;
    if (!full && this.CAM && this.FR) {
      var cr = this.CAM.getBoundingClientRect(), fr = this.FR.getBoundingClientRect();
      var s = Math.max(cr.width / vw, cr.height / vh), ox = (vw * s - cr.width) / 2, oy = (vh * s - cr.height) / 2;
      sx = (fr.left - cr.left + ox) / s; sy = (fr.top - cr.top + oy) / s; sw = fr.width / s; sh = fr.height / s;
      var px = sw * 0.06, py = sh * 0.25; sx -= px; sy -= py; sw += px * 2; sh += py * 2;
      sx = Math.max(0, sx); sy = Math.max(0, sy); sw = Math.min(vw - sx, sw); sh = Math.min(vh - sy, sh);
      if (!(sw > 20 && sh > 20)) { sx = 0; sy = 0; sw = vw; sh = vh; }
    }
    var sc = Math.min(1, (full ? 1280 : 1600) / sw), cv = this.cv;
    cv.width = Math.round(sw * sc); cv.height = Math.round(sh * sc);
    this.ctx.imageSmoothingQuality = 'high'; this.ctx.drawImage(V, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    return cv;
  };

  P._wasmRead = async function (img, formats, hard) {
    try {
      var r = await root.ZXingWASM.readBarcodes(img, { formats: formats, tryHarder: true, tryRotate: true, tryInvert: false, tryDenoise: !!hard, maxNumberOfSymbols: 1, downscaleThreshold: hard ? 2000 : 500 });
      var ok = r.find(function (x) { return x.isValid && x.text; });
      return ok ? ok.text : null;
    } catch (e) { return null; }
  };

  P._decode = async function (c, pass, formats) {
    if (!pass.sh && this.native) { try { var r = await this.native.detect(c); if (r && r.length) return r[0].rawValue; } catch (e) { /* fall through */ } }
    if (!this.wasm) return null;
    var src = c;
    if (pass.up && c.width < 1100) {
      src = document.createElement('canvas'); src.width = c.width * pass.up; src.height = c.height * pass.up;
      var x = src.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, src.width, src.height);
    }
    var img = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, src.width, src.height);
    if (pass.sh) sharpen(img, pass.up && src === c ? Math.max(1, Math.round(pass.sh / pass.up)) : pass.sh, pass.amt);
    return this._wasmRead(img, formats || LIN, false);
  };

  P._tick = async function () {
    var self = this;
    if (!self.running || self.busy || self.V.readyState < 2 || Date.now() < self.pauseUntil) { self._loop(); return; }
    self.busy = true; self.n++;
    var t0 = performance.now(), full = self.n % 7 === 0, c = self._grab(full), txt = null;
    try { if (c) txt = await self._decode(c, full ? PASSES[0] : PASSES[self.n % PASSES.length]); } catch (e) { txt = null; }
    self.decT = performance.now() - t0; self.busy = false;
    if (txt) self.onCode(String(txt).trim());
    self._loop();
  };

  /* decode a still photo (phone camera autofocus) - returns text or null */
  P.readFile = async function (file) {
    this.initDecoders();
    var bmp = await (root.createImageBitmap ? createImageBitmap(file) : new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = URL.createObjectURL(file); }));
    var W = bmp.width, H = bmp.height, tries = [2400, 1600, 1000], txt = null;
    for (var t = 0; t < tries.length; t++) {
      var s = Math.min(1, tries[t] / Math.max(W, H)), c = document.createElement('canvas');
      c.width = Math.round(W * s); c.height = Math.round(H * s);
      c.getContext('2d', { willReadFrequently: true }).drawImage(bmp, 0, 0, c.width, c.height);
      if (!this.wasm && !this.native) { await new Promise(function (r) { setTimeout(r, 300); }); this.initDecoders(); }
      for (var p = 0; p < PASSES.length; p++) { txt = await this._decode(c, PASSES[p], ALL); if (txt) break; }
      if (!txt && this.wasm) { var img = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height); txt = await this._wasmRead(img, ALL, true); }
      if (txt) break;
    }
    return txt ? String(txt).trim() : null;
  };

  root.Scanner = Scanner;
})(typeof window !== 'undefined' ? window : globalThis);
