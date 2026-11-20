/* Camera barcode scanner: native BarcodeDetector when available, ZXing (WASM, bundled locally) otherwise. */
(function (root) {
  'use strict';
  var NATIVE_FORMATS = ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar', 'qr_code', 'data_matrix'];
  var ZX_FORMATS = ['Code128', 'Code39', 'Code93', 'EAN-13', 'EAN-8', 'UPC-A', 'UPC-E', 'ITF', 'Codabar', 'QRCode', 'DataMatrix'];

  function Scanner(video, overlay, onCode) {
    this.video = video; this.overlay = overlay; this.onCode = onCode;
    this.stream = null; this.running = false; this.busy = false;
    this.engine = null; this.detector = null; this.track = null;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.caps = {};
    this.lastTick = 0;
  }

  Scanner.prototype.init = async function () {
    if (this.engine) return;
    if ('BarcodeDetector' in root) {
      try {
        var sup = await root.BarcodeDetector.getSupportedFormats();
        var fm = NATIVE_FORMATS.filter(function (f) { return sup.indexOf(f) >= 0; });
        if (fm.length) { this.detector = new root.BarcodeDetector({ formats: fm }); this.engine = 'native'; return; }
      } catch (e) { /* fall through */ }
    }
    if (!root.ZXingWASM) throw new Error('Scanner engine missing');
    root.ZXingWASM.prepareZXingModule({
      overrides: { locateFile: function (p, prefix) { return p.endsWith('.wasm') ? 'js/lib/zxing_reader.wasm' : prefix + p; } },
      fireImmediately: true
    });
    this.engine = 'zxing';
  };

  Scanner.prototype.start = async function (deviceId) {
    await this.init();
    this.stop();
    var c = { audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 } } };
    if (deviceId) c.video.deviceId = { exact: deviceId }; else c.video.facingMode = { ideal: 'environment' };
    this.stream = await navigator.mediaDevices.getUserMedia(c);
    this.track = this.stream.getVideoTracks()[0];
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', ''); this.video.muted = true;
    await this.video.play();
    this.caps = (this.track.getCapabilities && this.track.getCapabilities()) || {};
    try {
      if (this.caps.focusMode && this.caps.focusMode.indexOf('continuous') >= 0) await this.track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
    } catch (e) { /* optional */ }
    this.running = true;
    this._loop();
  };

  Scanner.prototype.stop = function () {
    this.running = false;
    if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); });
    this.stream = null; this.track = null;
    try { this.video.srcObject = null; } catch (e) { /* noop */ }
  };

  Scanner.prototype.hasTorch = function () { return !!this.caps.torch; };
  Scanner.prototype.zoomRange = function () { return this.caps.zoom ? { min: this.caps.zoom.min, max: this.caps.zoom.max, step: this.caps.zoom.step || 0.1 } : null; };
  Scanner.prototype.setTorch = async function (on) { if (this.track) await this.track.applyConstraints({ advanced: [{ torch: !!on }] }); };
  Scanner.prototype.setZoom = async function (z) { if (this.track) await this.track.applyConstraints({ advanced: [{ zoom: z }] }); };

  Scanner.prototype._loop = function () {
    var self = this;
    if (!self.running) return;
    var next = function () {
      if (!self.running) return;
      if ('requestVideoFrameCallback' in self.video) self.video.requestVideoFrameCallback(tick); else requestAnimationFrame(tick);
    };
    var tick = async function () {
      if (!self.running) return;
      var now = performance.now();
      if (!self.busy && now - self.lastTick > 45 && self.video.readyState >= 2 && self.video.videoWidth) {
        self.busy = true; self.lastTick = now;
        try { await self._scanFrame(); } catch (e) { /* ignore frame errors */ }
        self.busy = false;
      }
      next();
    };
    next();
  };

  /* decode only the guide window (centre band) -> faster and ignores neighbouring tags */
  Scanner.prototype._scanFrame = async function () {
    var v = this.video, vw = v.videoWidth, vh = v.videoHeight;
    var sw = Math.round(vw * 0.86), sh = Math.round(vh * 0.46);
    var sx = Math.round((vw - sw) / 2), sy = Math.round((vh - sh) / 2);
    var scale = Math.min(1, 960 / sw);
    var cw = Math.round(sw * scale), ch = Math.round(sh * scale);
    if (this.canvas.width !== cw) { this.canvas.width = cw; this.canvas.height = ch; }
    this.ctx.drawImage(v, sx, sy, sw, sh, 0, 0, cw, ch);
    var text = null;
    if (this.engine === 'native') {
      var res = await this.detector.detect(this.canvas);
      if (res && res.length) text = this._pick(res.map(function (r) { return { t: r.rawValue, b: r.boundingBox }; }), cw, ch);
    } else {
      var img = this.ctx.getImageData(0, 0, cw, ch);
      var out = await root.ZXingWASM.readBarcodes(img, { formats: ZX_FORMATS, tryHarder: true, tryRotate: true, tryInvert: false, maxNumberOfSymbols: 4 });
      var list = out.filter(function (r) { return r.isValid; }).map(function (r) {
        var p = r.position, xs = [p.topLeft.x, p.bottomRight.x], ys = [p.topLeft.y, p.bottomRight.y];
        return { t: r.text, b: { x: Math.min.apply(0, xs), y: Math.min.apply(0, ys), width: Math.abs(xs[1] - xs[0]), height: Math.abs(ys[1] - ys[0]) } };
      });
      if (list.length) text = this._pick(list, cw, ch);
    }
    if (text) this.onCode(text);
  };

  Scanner.prototype._pick = function (list, cw, ch) {
    var best = null, bd = 1e12;
    list.forEach(function (r) {
      if (!r.t) return;
      var b = r.b || { x: 0, y: 0, width: 0, height: 0 };
      var dx = b.x + b.width / 2 - cw / 2, dy = b.y + b.height / 2 - ch / 2, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = r.t; }
    });
    return best;
  };

  root.Scanner = Scanner;
})(typeof window !== 'undefined' ? window : globalThis);
