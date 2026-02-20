// ESM build of printer-manager — auto-generated from UMD source
// Import: import PrinterManager from 'goldpos-printer/printer-manager';

/**
 * ============================================================================
 * GoldPOS Printer Manager v3.0.0
 * ============================================================================
 * Backend-agnostic Bluetooth thermal printer manager.
 * Features:
 *   - ESC/POS + TSPL dual command mode
 *   - Auto-detect wizard (test which commands the printer understands)
 *   - Device profile persistence (localStorage + optional REST API)
 *   - BLE chunked writes with retry + method fallback
 *   - Gold shop receipt formatting
 *
 * Architecture: Zero backend dependencies. Optional REST sync via config.
 *
 * @license MIT
 * ============================================================================
 */
(function (root, factory) {
  if (typeof define === "function" && define.amd) define([], factory);
  else if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PrinterManager = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ─── ESC/POS Constants ─────────────────────────────────────────────── */
  const ESC = 0x1b, GS = 0x1d, LF = 0x0a;
  const CMD = {
    INIT:             [ESC, 0x40],
    ALIGN_LEFT:       [ESC, 0x61, 0x00],
    ALIGN_CENTER:     [ESC, 0x61, 0x01],
    ALIGN_RIGHT:      [ESC, 0x61, 0x02],
    BOLD_ON:          [ESC, 0x45, 0x01],
    BOLD_OFF:         [ESC, 0x45, 0x00],
    DOUBLE_HEIGHT_ON: [GS, 0x21, 0x01],
    DOUBLE_WIDTH_ON:  [GS, 0x21, 0x10],
    DOUBLE_SIZE_ON:   [GS, 0x21, 0x11],
    NORMAL_SIZE:      [GS, 0x21, 0x00],
    UNDERLINE_ON:     [ESC, 0x2d, 0x01],
    UNDERLINE_OFF:    [ESC, 0x2d, 0x00],
    FEED_LINE:        [LF],
    FEED_LINES:       n => [ESC, 0x64, n],
    CUT_PARTIAL:      [GS, 0x56, 0x01],
    CUT_FULL:         [GS, 0x56, 0x00],
    DRAWER_PIN2:      [ESC, 0x70, 0x00, 0x19, 0xfa],
    DRAWER_PIN5:      [ESC, 0x70, 0x01, 0x19, 0xfa],
    FONT_A:           [ESC, 0x4d, 0x00],
    FONT_B:           [ESC, 0x4d, 0x01],
  };

  /* ─── Known BLE Services ────────────────────────────────────────────── */
  const BLE_SERVICES = [
    "000018f0-0000-1000-8000-00805f9b34fb",
    "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
    "49535343-fe7d-4ae5-8fa9-9fafd205e455",
    "0000ff00-0000-1000-8000-00805f9b34fb",
    "0000fee7-0000-1000-8000-00805f9b34fb",
  ];

  /* ─── Paper/Defaults ────────────────────────────────────────────────── */
  const PAPER_COLS = { 58: 32, 72: 42, 76: 44, 80: 48, 100: 56, 104: 60 };

  const DEFAULTS = {
    // Command language: "escpos", "tspl", "raw", or "auto" (detect on first connect)
    commandMode: "auto",

    // Paper & formatting
    paperWidth: 80, charsPerLine: 48,

    // Store info
    storeName: "TOKO EMAS", storeAddress: "", storePhone: "", storeNPWP: "",
    footerText: "Terima Kasih atas Kunjungan Anda",

    // ESC/POS specific
    autoCut: true,

    // TSPL specific (mm)
    labelWidth: 100, labelHeight: 150,
    labelGap: 2, labelDensity: 8,
    tsplDpi: 203, tsplMarginX: 20, tsplMarginY: 15,

    // Drawer & copies
    openDrawerOnPrint: false, cashDrawerPin: 2, copies: 1,

    // BLE connection
    autoReconnect: true, reconnectInterval: 5000,
    reconnectMaxAttempts: 5, chunkSize: 80, chunkDelay: 40,
    connectDelay: 500, writeRetries: 2,

    // Persistence
    storageKey: "goldpos_printer",
    // REST API endpoint for backend sync (optional)
    // e.g. "/api/printer_profiles" — set to null to disable
    apiEndpoint: null,
    // Extra headers for API calls (e.g. CSRF token)
    apiHeaders: {},

    debug: false,
  };

  /* ─── Helpers ───────────────────────────────────────────────────────── */
  const fmtCurrency = n =>
    "Rp " + Number(n).toLocaleString("id-ID", { minimumFractionDigits: 0 });

  const padR = (s, l) => (s + " ".repeat(l)).substring(0, l);
  const padL = (s, l) => (" ".repeat(l) + s).slice(-l);
  const center = (s, l) => {
    if (s.length >= l) return s.substring(0, l);
    const p = Math.floor((l - s.length) / 2);
    return " ".repeat(p) + s + " ".repeat(l - s.length - p);
  };
  const wrap = (s, m) => {
    const words = s.split(" "), lines = []; let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > m) { if (cur) lines.push(cur); cur = w; }
      else cur = cur ? cur + " " + w : w;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const genInvoice = (pfx = "INV") => {
    const d = new Date();
    const ds = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
    return `${pfx}-${ds}-${String(Math.floor(Math.random()*9999)+1).padStart(4,"0")}`;
  };
  const fmtDate = (d) => {
    d = d || new Date();
    const p = n => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const escQ = s => s.replace(/"/g, "'");

  /* ═══════════════════════════════════════════════════════════════════════
   * DeviceStore — Backend-agnostic device profile persistence
   *
   * Stores device profiles keyed by BLE device ID.
   * Primary: localStorage (always available, instant)
   * Secondary: REST API sync (optional, for multi-device / backend storage)
   *
   * Profile schema:
   *   { deviceId, deviceName, commandMode, paperWidth, charsPerLine,
   *     autoCut, chunkSize, chunkDelay, serviceUuid, charUuid, writeMethod,
   *     labelWidth, labelHeight, ... , updatedAt }
   * ═══════════════════════════════════════════════════════════════════════ */
  class DeviceStore {
    constructor(storageKey, apiEndpoint, apiHeaders) {
      this._key = storageKey || "goldpos_printer";
      this._api = apiEndpoint || null;
      this._headers = apiHeaders || {};
    }

    /** Get all stored device profiles */
    getAll() {
      try {
        return JSON.parse(localStorage.getItem(this._key + "_devices") || "{}");
      } catch { return {}; }
    }

    /** Get profile for a specific device */
    get(deviceId) {
      return this.getAll()[deviceId] || null;
    }

    /** Save/update profile for a device */
    save(deviceId, profile) {
      const all = this.getAll();
      all[deviceId] = { ...profile, deviceId, updatedAt: new Date().toISOString() };
      try { localStorage.setItem(this._key + "_devices", JSON.stringify(all)); } catch {}
      // Async sync to backend (fire-and-forget)
      if (this._api) this._apiSync("PUT", deviceId, all[deviceId]);
      return all[deviceId];
    }

    /** Delete a device profile */
    delete(deviceId) {
      const all = this.getAll();
      delete all[deviceId];
      try { localStorage.setItem(this._key + "_devices", JSON.stringify(all)); } catch {}
      if (this._api) this._apiSync("DELETE", deviceId);
    }

    /** Get store settings (non-device specific) */
    getSettings() {
      try { return JSON.parse(localStorage.getItem(this._key + "_settings") || "{}"); }
      catch { return {}; }
    }

    /** Save store settings */
    saveSettings(settings) {
      try { localStorage.setItem(this._key + "_settings", JSON.stringify(settings)); } catch {}
      if (this._api) this._apiSync("PUT", "_settings", settings);
    }

    /** Optional REST API sync */
    async _apiSync(method, id, data) {
      if (!this._api) return;
      try {
        const url = `${this._api}/${encodeURIComponent(id)}`;
        const opts = {
          method, headers: { "Content-Type": "application/json", ...this._headers },
        };
        if (data && method !== "DELETE") opts.body = JSON.stringify(data);
        await fetch(url, opts);
      } catch (e) {
        console.warn("[DeviceStore] API sync failed:", e.message);
      }
    }

    /** Pull all profiles from backend API (merge with local) */
    async syncFromApi() {
      if (!this._api) return;
      try {
        const res = await fetch(this._api, { headers: this._headers });
        if (!res.ok) return;
        const remote = await res.json();
        const local = this.getAll();
        // Merge: newer wins
        const merged = { ...local };
        for (const [id, prof] of Object.entries(remote)) {
          if (!merged[id] || new Date(prof.updatedAt) > new Date(merged[id].updatedAt)) {
            merged[id] = prof;
          }
        }
        try { localStorage.setItem(this._key + "_devices", JSON.stringify(merged)); } catch {}
        return merged;
      } catch (e) {
        console.warn("[DeviceStore] API pull failed:", e.message);
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * PrinterManager
   * ═══════════════════════════════════════════════════════════════════════ */
  class PrinterManager {
    constructor(opts = {}) {
      this.config = { ...DEFAULTS, ...opts };
      if (!opts.charsPerLine && PAPER_COLS[this.config.paperWidth]) {
        this.config.charsPerLine = PAPER_COLS[this.config.paperWidth];
      }

      this._device = null;
      this._server = null;
      this._service = null;
      this._char = null;
      this._writeMethod = null;
      this._connected = false;
      this._connecting = false;
      this._reconnecting = false;
      this._reconnAttempts = 0;
      this._reconnTimer = null;
      this._busy = false;
      this._listeners = {};
      this._detectedMode = null; // result of auto-detect

      // Device profile store
      this.store = new DeviceStore(
        this.config.storageKey,
        this.config.apiEndpoint,
        this.config.apiHeaders
      );

      // Load store settings into config
      const saved = this.store.getSettings();
      if (saved && Object.keys(saved).length) {
        Object.assign(this.config, saved);
        if (!opts.charsPerLine && PAPER_COLS[this.config.paperWidth]) {
          this.config.charsPerLine = PAPER_COLS[this.config.paperWidth];
        }
      }

      this._onDisconnected = this._onDisconnected.bind(this);
    }

    /* ─── Events ─────────────────────────────────────────────────────── */
    on(ev, fn)  { (this._listeners[ev] ??= []).push(fn); return this; }
    off(ev, fn) { if (this._listeners[ev]) this._listeners[ev] = this._listeners[ev].filter(f => f !== fn); return this; }
    _emit(ev, d) { for (const fn of (this._listeners[ev] || [])) { try { fn(d); } catch(e) { console.error(`[PM] ${ev}:`, e); } } }

    /* ─── Status ─────────────────────────────────────────────────────── */
    static isSupported() { return !!(navigator?.bluetooth); }
    get isConnected() { return this._connected && !!this._char; }
    get deviceName() { return this._device?.name || null; }
    get deviceId() { return this._device?.id || null; }
    get isTSPL() { return this.config.commandMode === "tspl"; }
    get effectiveMode() { return this.config.commandMode === "auto" ? (this._detectedMode || "escpos") : this.config.commandMode; }
    get state() {
      return {
        connected: this._connected, connecting: this._connecting,
        reconnecting: this._reconnecting, deviceName: this.deviceName,
        deviceId: this.deviceId, paperWidth: this.config.paperWidth,
        commandMode: this.effectiveMode, writeMethod: this._writeMethod,
      };
    }
    _dbg(...a) { if (this.config.debug) console.log("[PM]", ...a); }

    /* ─── Connect ────────────────────────────────────────────────────── */
    async connect() {
      if (!PrinterManager.isSupported()) throw this._err("unsupported", "Web Bluetooth not supported.");
      if (this._connected) return { success: true, device: this.deviceName, alreadyConnected: true };

      this._connecting = true;
      this._emit("stateChange", this.state);
      try {
        this._device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: BLE_SERVICES,
        });
        if (!this._device) throw new Error("No device selected");
        this._device.addEventListener("gattserverdisconnected", this._onDisconnected);
        this._server = await this._device.gatt.connect();
        this._dbg("GATT connected, stabilizing...");
        await new Promise(r => setTimeout(r, this.config.connectDelay));
        await this._discover();
        await new Promise(r => setTimeout(r, 200));

        // Load saved profile for this device
        const profile = this.store.get(this._device.id);
        if (profile) {
          this._dbg("Loaded device profile:", profile);
          if (profile.commandMode && profile.commandMode !== "auto") {
            this.config.commandMode = profile.commandMode;
            this._detectedMode = profile.commandMode;
          }
          if (profile.paperWidth) this.config.paperWidth = profile.paperWidth;
          if (profile.charsPerLine) this.config.charsPerLine = profile.charsPerLine;
          if (profile.autoCut !== undefined) this.config.autoCut = profile.autoCut;
          if (profile.chunkSize) this.config.chunkSize = profile.chunkSize;
          if (profile.chunkDelay) this.config.chunkDelay = profile.chunkDelay;
          if (profile.labelWidth) this.config.labelWidth = profile.labelWidth;
          if (profile.labelHeight) this.config.labelHeight = profile.labelHeight;
        }

        this._connected = true; this._connecting = false; this._reconnAttempts = 0;
        const r = {
          success: true, device: this.deviceName, deviceId: this._device.id,
          service: this._service?.uuid, characteristic: this._char?.uuid,
          writeMethod: this._writeMethod, commandMode: this.effectiveMode,
          hasProfile: !!profile,
        };
        this._emit("connected", r); this._emit("stateChange", this.state);
        return r;
      } catch (e) {
        this._connecting = false; this._emit("stateChange", this.state);
        if (e.name === "NotFoundError") throw this._err("cancelled", "Selection cancelled.");
        throw this._err("connection", e.message);
      }
    }

    async disconnect() {
      this._stopReconn();
      if (this._device?.gatt?.connected) {
        this._device.removeEventListener("gattserverdisconnected", this._onDisconnected);
        this._device.gatt.disconnect();
      }
      this._reset();
      this._emit("disconnected", { manual: true }); this._emit("stateChange", this.state);
    }

    /* ─── BLE Discovery ──────────────────────────────────────────────── */
    async _discover() {
      for (const svc of BLE_SERVICES) {
        try {
          this._service = await this._server.getPrimaryService(svc);
          this._dbg("Service:", svc);
          const chars = await this._service.getCharacteristics();
          for (const c of chars) {
            if (c.properties.write || c.properties.writeWithoutResponse) {
              this._char = c;
              this._writeMethod = c.properties.write ? "writeValue" : "writeValueWithoutResponse";
              this._dbg("Char:", c.uuid, "Method:", this._writeMethod);
              return;
            }
          }
        } catch(_) {}
      }
      // Fallback: enumerate all
      try {
        const allSvcs = await this._server.getPrimaryServices();
        for (const svc of allSvcs) {
          try {
            const chars = await svc.getCharacteristics();
            for (const c of chars) {
              if (c.properties.write || c.properties.writeWithoutResponse) {
                this._service = svc; this._char = c;
                this._writeMethod = c.properties.write ? "writeValue" : "writeValueWithoutResponse";
                return;
              }
            }
          } catch(_) {}
        }
      } catch(_) {}
      throw new Error("No writable characteristic found.");
    }

    _onDisconnected() {
      this._connected = false; this._char = null; this._service = null; this._server = null;
      this._emit("disconnected", { manual: false }); this._emit("stateChange", this.state);
      if (this.config.autoReconnect) this._startReconn();
    }
    _startReconn() {
      if (this._reconnecting) return;
      this._reconnecting = true; this._reconnAttempts = 0;
      this._reconnTimer = setInterval(async () => {
        if (this._connected || !this._device) { this._stopReconn(); return; }
        this._reconnAttempts++;
        if (this._reconnAttempts > this.config.reconnectMaxAttempts) { this._stopReconn(); return; }
        this._emit("reconnecting", { attempt: this._reconnAttempts, max: this.config.reconnectMaxAttempts });
        try {
          this._server = await this._device.gatt.connect();
          await new Promise(r => setTimeout(r, this.config.connectDelay));
          await this._discover();
          await new Promise(r => setTimeout(r, 200));
          this._connected = true; this._stopReconn();
          this._emit("reconnected", { device: this.deviceName }); this._emit("stateChange", this.state);
        } catch(_) {}
      }, this.config.reconnectInterval);
    }
    _stopReconn() { this._reconnecting = false; if (this._reconnTimer) { clearInterval(this._reconnTimer); this._reconnTimer = null; } }
    _reset() { this._connected = false; this._connecting = false; this._reconnecting = false; this._char = null; this._service = null; this._server = null; this._device = null; }
    _err(type, msg) { const e = new Error(msg); this._emit("error", { type, error: e }); return e; }

    /* ─── Low-Level BLE I/O ──────────────────────────────────────────── */
    async _writeChunk(chunk, attempt = 0) {
      const methods = [];
      if (this._writeMethod === "writeValue" && this._char.properties.write) methods.push("writeValue");
      else if (this._char.properties.writeWithoutResponse) methods.push("writeValueWithoutResponse");
      if (this._char.properties.write && !methods.includes("writeValue")) methods.push("writeValue");
      if (this._char.properties.writeWithoutResponse && !methods.includes("writeValueWithoutResponse")) methods.push("writeValueWithoutResponse");
      for (let mi = 0; mi < methods.length; mi++) {
        try {
          await this._char[methods[mi]](chunk);
          if (methods[mi] !== this._writeMethod) { this._writeMethod = methods[mi]; }
          return;
        } catch (e) {
          this._dbg("Write fail [" + methods[mi] + "] #" + attempt);
          if (mi === methods.length - 1) {
            if (attempt < this.config.writeRetries) {
              await new Promise(r => setTimeout(r, 150 * (attempt + 1)));
              return this._writeChunk(chunk, attempt + 1);
            }
            throw e;
          }
          await new Promise(r => setTimeout(r, 50));
        }
      }
    }

    async _send(data) {
      if (!this.isConnected) throw new Error("Printer not connected");
      while (this._busy) await new Promise(r => setTimeout(r, 30));
      this._busy = true;
      try {
        const sz = this.config.chunkSize;
        this._dbg("Send " + data.length + "B / " + Math.ceil(data.length / sz) + " chunks");
        for (let i = 0; i < data.length; i += sz) {
          await this._writeChunk(data.slice(i, i + sz));
          if (i + sz < data.length) await new Promise(r => setTimeout(r, this.config.chunkDelay));
        }
      } finally { this._busy = false; }
    }

    async _sendText(text) {
      await this._send(new TextEncoder().encode(text));
    }

    _build(...parts) {
      const enc = new TextEncoder();
      const arrs = parts.map(p => typeof p === "string" ? enc.encode(p) : Array.isArray(p) ? new Uint8Array(p) : p instanceof Uint8Array ? p : new Uint8Array(0));
      const total = arrs.reduce((s, a) => s + a.length, 0);
      const out = new Uint8Array(total); let off = 0;
      for (const a of arrs) { out.set(a, off); off += a.length; }
      return out;
    }

    /* ═════════════════════════════════════════════════════════════════════
     * Auto-Detect Wizard
     *
     * Sends test payloads in each format. Returns test IDs + data.
     * The UI asks the user which ones printed correctly, then saves the
     * result as the device profile.
     *
     * Usage:
     *   const tests = await printer.runDetectionTests();
     *   // UI shows results, user picks which worked
     *   printer.saveDetectionResult("escpos_full", { autoCut: false });
     * ═════════════════════════════════════════════════════════════════════ */

    /**
     * Get the list of detection tests (metadata only, no sending).
     */
    static getDetectionTests() {
      return [
        { id: "raw",          label: "Raw Text",             desc: "Plain ASCII text, no commands" },
        { id: "escpos_basic", label: "ESC/POS Basic",        desc: "ESC/POS init + text + line feed" },
        { id: "escpos_fmt",   label: "ESC/POS Formatted",    desc: "ESC/POS with bold, center, alignment" },
        { id: "escpos_size",  label: "ESC/POS Double Size",  desc: "ESC/POS with GS ! double height/width" },
        { id: "escpos_full",  label: "ESC/POS Full Receipt", desc: "Complete receipt with all formatting" },
        { id: "tspl",         label: "TSPL Label",           desc: "TSPL TEXT/BAR/PRINT commands for label printers" },
      ];
    }

    /**
     * Run a single detection test by ID.
     */
    async runDetectionTest(testId) {
      if (!this.isConnected) throw new Error("Not connected");
      const uid = String(Math.floor(Math.random() * 9000) + 1000);

      switch (testId) {
        case "raw":
          await this._sendText(
            `TEST: RAW [${uid}]\r\nHello from GoldPOS\r\nRp 1.500.000\r\n2.50g 24K\r\n---\r\n\r\n\r\n`
          );
          break;

        case "escpos_basic":
          await this._send(this._build(
            CMD.INIT,
            `TEST: ESCPOS BASIC [${uid}]\n`,
            "Hello from GoldPOS\n",
            "Rp 1.500.000\n",
            CMD.FEED_LINES(3)
          ));
          break;

        case "escpos_fmt":
          await this._send(this._build(
            CMD.INIT, CMD.ALIGN_CENTER, CMD.BOLD_ON,
            `TEST: FORMATTED [${uid}]\n`,
            CMD.BOLD_OFF, CMD.ALIGN_LEFT,
            "Left aligned text\n",
            "Rp 1.500.000 | 2.50g 24K\n",
            CMD.FEED_LINES(3)
          ));
          break;

        case "escpos_size":
          await this._send(this._build(
            CMD.INIT, CMD.ALIGN_CENTER,
            CMD.DOUBLE_SIZE_ON, `BIG [${uid}]\n`, CMD.NORMAL_SIZE,
            "Normal text below\n",
            CMD.FEED_LINES(3)
          ));
          break;

        case "escpos_full": {
          const sep = "-".repeat(32) + "\n";
          const dsep = "=".repeat(32) + "\n";
          const c2 = (l, r) => {
            const mx = 32 - r.length - 1;
            const tl = l.substring(0, mx);
            return tl + " ".repeat(Math.max(32 - tl.length - r.length, 1)) + r + "\n";
          };
          await this._send(this._build(
            CMD.INIT, CMD.ALIGN_CENTER, CMD.BOLD_ON, CMD.DOUBLE_SIZE_ON,
            "TOKO EMAS\n", CMD.NORMAL_SIZE, CMD.BOLD_OFF,
            `Test [${uid}]\n`, CMD.ALIGN_LEFT, dsep,
            c2("Invoice", "INV-TEST-0001"),
            c2("Tanggal", fmtDate()), dsep,
            "Cincin Emas 24K\n",
            "  1x 5.00g @Rp 1.100.000/g\n",
            c2("", "Rp 5.500.000"), sep,
            CMD.BOLD_ON, CMD.DOUBLE_HEIGHT_ON,
            c2("TOTAL", "Rp 5.500.000"),
            CMD.NORMAL_SIZE, CMD.BOLD_OFF, sep,
            c2("Bayar", "Tunai"),
            c2("Dibayar", "Rp 6.000.000"),
            c2("Kembali", "Rp 500.000"), sep,
            CMD.ALIGN_CENTER, "\nTerima Kasih\n\n\n",
            CMD.ALIGN_LEFT,
          ));
          break;
        }

        case "tspl":
          await this._sendText(
            `SIZE 100 mm, 50 mm\r\n` +
            `GAP 2 mm, 0 mm\r\nDIRECTION 1\r\nDENSITY 8\r\nCLS\r\n` +
            `TEXT 30,15,"4",0,1,1,"TEST: TSPL [${uid}]"\r\n` +
            `TEXT 30,50,"3",0,1,1,"Hello from GoldPOS"\r\n` +
            `TEXT 30,80,"3",0,1,1,"Rp 1.500.000"\r\n` +
            `BAR 30,115,740,2\r\n` +
            `TEXT 30,125,"2",0,1,1,"If you see this AS FORMATTED LABEL, TSPL works"\r\n` +
            `PRINT 1\r\n`
          );
          break;

        default:
          throw new Error("Unknown test: " + testId);
      }

      return { testId, uid };
    }

    /**
     * Save detection result + device profile.
     * @param {string} bestTest - The test ID that worked best
     * @param {Object} overrides - Extra config overrides (e.g. autoCut, paperWidth)
     */
    saveDetectionResult(bestTest, overrides = {}) {
      const modeMap = {
        "raw": "escpos",           // raw works → ESC/POS will work too
        "escpos_basic": "escpos",
        "escpos_fmt": "escpos",
        "escpos_size": "escpos",
        "escpos_full": "escpos",
        "tspl": "tspl",
      };
      const mode = modeMap[bestTest] || "escpos";
      this._detectedMode = mode;
      this.config.commandMode = mode;

      // Apply overrides
      Object.assign(this.config, overrides);
      if (overrides.paperWidth && !overrides.charsPerLine) {
        this.config.charsPerLine = PAPER_COLS[overrides.paperWidth] || 48;
      }

      // Save device profile
      if (this._device?.id) {
        this.store.save(this._device.id, {
          deviceName: this.deviceName,
          commandMode: mode,
          paperWidth: this.config.paperWidth,
          charsPerLine: this.config.charsPerLine,
          autoCut: this.config.autoCut,
          chunkSize: this.config.chunkSize,
          chunkDelay: this.config.chunkDelay,
          serviceUuid: this._service?.uuid,
          charUuid: this._char?.uuid,
          writeMethod: this._writeMethod,
          labelWidth: this.config.labelWidth,
          labelHeight: this.config.labelHeight,
          detectedVia: bestTest,
        });
        this._emit("profileSaved", { deviceId: this._device.id, mode, test: bestTest });
      }

      this._emit("stateChange", this.state);
      return { mode, deviceId: this._device?.id };
    }

    /* ═════════════════════════════════════════════════════════════════════
     * ESC/POS Formatting
     * ═════════════════════════════════════════════════════════════════════ */
    _sep(ch = "-") { return ch.repeat(this.config.charsPerLine) + "\n"; }
    _dsep() { return "=".repeat(this.config.charsPerLine) + "\n"; }
    _col2(l, r) {
      const mx = this.config.charsPerLine - r.length - 1;
      const tl = l.length > mx ? l.substring(0, mx) : l;
      return tl + " ".repeat(Math.max(this.config.charsPerLine - tl.length - r.length, 1)) + r + "\n";
    }
    _col3(a, b, c) {
      const w = this.config.charsPerLine;
      const w1 = Math.floor(w * 0.45), w2 = Math.floor(w * 0.2), w3 = w - w1 - w2;
      return padR(a, w1) + center(b, w2) + padL(c, w3) + "\n";
    }

    _buildReceiptEscpos(tx, copyN, totalC) {
      const c = this.config;
      const inv = tx.invoiceNumber || genInvoice();
      const date = fmtDate(tx.date);
      let sub = "";
      if (c.storeAddress) sub += c.storeAddress + "\n";
      if (c.storePhone) sub += "Telp: " + c.storePhone + "\n";
      if (c.storeNPWP) sub += "NPWP: " + c.storeNPWP + "\n";
      let info = this._dsep();
      info += this._col2("No. Invoice", inv);
      info += this._col2("Tanggal", date);
      if (tx.cashier) info += this._col2("Kasir", tx.cashier);
      if (tx.customer) info += this._col2("Pelanggan", tx.customer);
      info += this._dsep();
      let items = this._col3("ITEM", "BERAT", "SUBTOTAL") + this._sep();
      let grandTotal = 0, totalWeight = 0;
      for (const it of (tx.items || [])) {
        const qty = it.qty || 1, wt = it.weight || 0, ppg = it.pricePerGram || 0;
        const disc = it.discount || 0, s = wt * ppg * qty - disc;
        grandTotal += s; totalWeight += wt * qty;
        for (const ln of wrap(it.name, c.charsPerLine)) items += ln + "\n";
        items += `  ${qty}x ${wt}g ${it.karat||""} @${fmtCurrency(ppg)}/g\n`;
        items += this._col2("", fmtCurrency(s + disc));
        if (disc > 0) items += this._col2("  Diskon", "-" + fmtCurrency(disc));
        items += "\n";
      }
      items += this._sep();
      let totals = this._col2("Total Berat", totalWeight.toFixed(2) + " g");
      totals += this._col2("Subtotal", fmtCurrency(grandTotal));
      const oDisc = tx.discount || 0;
      if (oDisc > 0) { totals += this._col2("Diskon", "-" + fmtCurrency(oDisc)); grandTotal -= oDisc; }
      const taxR = tx.tax || 0;
      if (taxR > 0) { const ta = Math.round(grandTotal * taxR / 100); totals += this._col2(`PPN (${taxR}%)`, fmtCurrency(ta)); grandTotal += ta; }
      totals += this._dsep();
      const totalLine = this._col2("TOTAL", fmtCurrency(grandTotal));
      let pay = "";
      const m = (tx.paymentMethod || "cash").toLowerCase();
      const ml = { cash: "Tunai", debit: "Kartu Debit", credit: "Kartu Kredit", transfer: "Transfer Bank" };
      pay += this._col2("Pembayaran", ml[m] || m);
      if (m === "cash" && tx.amountPaid) {
        pay += this._col2("Dibayar", fmtCurrency(tx.amountPaid));
        pay += this._col2("Kembali", fmtCurrency(Math.max(0, tx.amountPaid - grandTotal)));
      } else if ((m === "debit" || m === "credit") && tx.cardLast4) {
        pay += this._col2("Kartu", "**** " + tx.cardLast4);
      } else if (m === "transfer" && tx.bankName) {
        pay += this._col2("Bank", tx.bankName);
      }
      pay += this._sep();
      let foot = "";
      if (c.footerText) foot += "\n" + center(c.footerText, c.charsPerLine) + "\n";
      foot += center("Barang yang sudah dibeli tidak dapat", c.charsPerLine) + "\n";
      foot += center("dikembalikan / ditukar", c.charsPerLine) + "\n";
      if (totalC > 1) foot += "\n" + center(`-- Copy ${copyN}/${totalC} --`, c.charsPerLine) + "\n";
      foot += "\n\n\n";
      return this._build(
        CMD.INIT, CMD.ALIGN_CENTER, CMD.BOLD_ON, CMD.DOUBLE_SIZE_ON,
        c.storeName + "\n", CMD.NORMAL_SIZE, CMD.BOLD_OFF, sub,
        CMD.ALIGN_LEFT, info, items, totals,
        CMD.BOLD_ON, CMD.DOUBLE_HEIGHT_ON, totalLine,
        CMD.NORMAL_SIZE, CMD.BOLD_OFF, "\n", pay,
        CMD.ALIGN_CENTER, foot, CMD.ALIGN_LEFT,
        ...(c.autoCut ? [CMD.CUT_PARTIAL] : [CMD.FEED_LINES(3)])
      );
    }

    /* ═════════════════════════════════════════════════════════════════════
     * TSPL Receipt (label printer)
     * ═════════════════════════════════════════════════════════════════════ */
    _buildReceiptTspl(tx, copyN, totalC) {
      const c = this.config;
      const dpmm = c.tsplDpi / 25.4;
      const W = Math.round(c.labelWidth * dpmm);
      const mx = c.tsplMarginX;
      const usable = W - mx * 2;
      const FONTS = { "1":[8,12], "2":[12,20], "3":[16,24], "4":[24,32], "5":[32,48] };
      const GAP = 4;
      let y = c.tsplMarginY;
      const lines = [];
      const addText = (x, text, font = "2", xm = 1, ym = 1) => {
        lines.push(`TEXT ${x},${y},"${font}",0,${xm},${ym},"${escQ(text)}"`);
        y += FONTS[font][1] * ym + GAP;
      };
      const addCenter = (text, font = "2", xm = 1, ym = 1) => {
        const tw = text.length * FONTS[font][0] * xm;
        addText(Math.max(mx, Math.round((W - tw) / 2)), text, font, xm, ym);
      };
      const addLR = (left, right, font = "2") => {
        const cw = FONTS[font][0];
        lines.push(`TEXT ${mx},${y},"${font}",0,1,1,"${escQ(left)}"`);
        lines.push(`TEXT ${W - mx - right.length * cw},${y},"${font}",0,1,1,"${escQ(right)}"`);
        y += FONTS[font][1] + GAP;
      };
      const addBar = (h = 2) => { lines.push(`BAR ${mx},${y},${usable},${h}`); y += h + GAP; };

      const inv = tx.invoiceNumber || genInvoice();
      const date = fmtDate(tx.date);

      addCenter(c.storeName, "4");
      if (c.storeAddress) addCenter(c.storeAddress);
      if (c.storePhone) addCenter("Telp: " + c.storePhone);
      y += 4; addBar(3);
      addLR("No. Invoice", inv); addLR("Tanggal", date);
      if (tx.cashier) addLR("Kasir", tx.cashier);
      if (tx.customer) addLR("Pelanggan", tx.customer);
      addBar(2);

      let grandTotal = 0, totalWeight = 0;
      for (const it of (tx.items || [])) {
        const qty = it.qty || 1, wt = it.weight || 0, ppg = it.pricePerGram || 0;
        const disc = it.discount || 0, sub = wt * ppg * qty - disc;
        grandTotal += sub; totalWeight += wt * qty;
        addText(mx, it.name, "3");
        addText(mx + 16, `${qty}x ${wt}g ${it.karat||""} @${fmtCurrency(ppg)}/g`);
        addLR("", fmtCurrency(sub + disc));
        if (disc > 0) addLR("  Diskon", "-" + fmtCurrency(disc));
        y += 2;
      }
      addBar(1);
      addLR("Total Berat", totalWeight.toFixed(2) + " g");
      addLR("Subtotal", fmtCurrency(grandTotal));
      const oDisc = tx.discount || 0;
      if (oDisc > 0) { addLR("Diskon", "-" + fmtCurrency(oDisc)); grandTotal -= oDisc; }
      const taxR = tx.tax || 0;
      if (taxR > 0) { const ta = Math.round(grandTotal * taxR / 100); addLR("PPN (" + taxR + "%)", fmtCurrency(ta)); grandTotal += ta; }
      addBar(3);
      addCenter("TOTAL", "4"); addCenter(fmtCurrency(grandTotal), "4");
      addBar(2);
      const ml = { cash: "Tunai", debit: "Kartu Debit", credit: "Kartu Kredit", transfer: "Transfer Bank" };
      const m = (tx.paymentMethod || "cash").toLowerCase();
      addLR("Pembayaran", ml[m] || m);
      if (m === "cash" && tx.amountPaid) {
        addLR("Dibayar", fmtCurrency(tx.amountPaid));
        addLR("Kembali", fmtCurrency(Math.max(0, tx.amountPaid - grandTotal)));
      }
      y += 8;
      if (c.footerText) addCenter(c.footerText);
      addCenter("Barang yang sudah dibeli tidak dapat");
      addCenter("dikembalikan / ditukar");
      if (totalC > 1) addCenter("-- Copy " + copyN + "/" + totalC + " --");

      const labelH = Math.max(Math.round((y + 30) / dpmm), c.labelHeight);
      let tspl = `SIZE ${c.labelWidth} mm, ${labelH} mm\r\n`;
      tspl += `GAP ${c.labelGap} mm, 0 mm\r\nDIRECTION 1\r\nDENSITY ${c.labelDensity}\r\nCLS\r\n`;
      tspl += lines.join("\r\n") + "\r\nPRINT 1\r\n";
      return tspl;
    }

    /* ═════════════════════════════════════════════════════════════════════
     * Public Print Methods (auto-dispatch)
     * ═════════════════════════════════════════════════════════════════════ */
    async printReceipt(tx, opts = {}) {
      if (!this.isConnected) throw new Error("Not connected");
      const copies = opts.copies || this.config.copies || 1;
      const openDrawer = opts.openDrawer ?? this.config.openDrawerOnPrint;
      const mode = this.effectiveMode;

      this._emit("printStart", { type: "receipt", transaction: tx });
      try {
        if (openDrawer && mode === "escpos") await this.openCashDrawer();
        for (let i = 0; i < copies; i++) {
          if (mode === "tspl") {
            await this._sendText(this._buildReceiptTspl(tx, i + 1, copies));
          } else {
            await this._send(this._buildReceiptEscpos(tx, i + 1, copies));
          }
          if (i < copies - 1) await new Promise(r => setTimeout(r, mode === "tspl" ? 1000 : 500));
        }
        this._emit("printEnd", { type: "receipt", success: true });
      } catch (e) {
        this._emit("printError", { type: "receipt", error: e }); throw e;
      }
    }

    async printTest() {
      if (!this.isConnected) throw new Error("Not connected");
      this._emit("printStart", { type: "test" });
      try {
        const mode = this.effectiveMode;
        if (mode === "tspl") {
          const c = this.config;
          let tspl = `SIZE ${c.labelWidth} mm, 50 mm\r\nGAP ${c.labelGap} mm, 0 mm\r\n`;
          tspl += `DIRECTION 1\r\nDENSITY ${c.labelDensity}\r\nCLS\r\n`;
          tspl += `TEXT 30,15,"4",0,1,1,"TEST PRINT"\r\n`;
          tspl += `TEXT 30,50,"2",0,1,1,"${this.deviceName || '?'}"\r\n`;
          tspl += `TEXT 30,75,"2",0,1,1,"Mode: TSPL | ${c.labelWidth}x${c.labelHeight}mm"\r\n`;
          tspl += `TEXT 30,100,"3",0,1,1,"${fmtCurrency(1500000)} | 2.50g 24K"\r\n`;
          tspl += `BAR 30,135,740,2\r\n`;
          tspl += `TEXT 30,145,"2",0,1,1,"${fmtDate()}"\r\n`;
          tspl += `PRINT 1\r\n`;
          await this._sendText(tspl);
        } else {
          const c = this.config;
          let t = center("=== TEST PRINT ===", c.charsPerLine) + "\n\n";
          t += center(c.storeName, c.charsPerLine) + "\n" + this._sep();
          t += this._col2("Mode", mode.toUpperCase());
          t += this._col2("Paper", c.paperWidth + "mm / " + c.charsPerLine + " cols");
          t += this._col2("Printer", this.deviceName || "?");
          t += this._col2("Chunk", c.chunkSize + "B / " + c.chunkDelay + "ms");
          t += this._col2("AutoCut", c.autoCut ? "ON" : "OFF");
          t += this._col2("Date", fmtDate()) + this._sep();
          t += this._col2("Test Harga", fmtCurrency(1500000));
          t += this._col2("Test Berat", "2.50 g / 24K") + "\n";
          t += center("Printer berfungsi dengan baik!", c.charsPerLine) + "\n\n\n";
          await this._send(this._build(
            CMD.INIT, CMD.ALIGN_CENTER, CMD.BOLD_ON, "=== TEST PRINT ===\n\n",
            CMD.BOLD_OFF, CMD.ALIGN_LEFT, t,
            ...(c.autoCut ? [CMD.CUT_PARTIAL] : [CMD.FEED_LINES(2)])
          ));
        }
        this._emit("printEnd", { type: "test", success: true });
      } catch (e) { this._emit("printError", { type: "test", error: e }); throw e; }
    }

    async printText(text, opts = {}) {
      if (!this.isConnected) throw new Error("Not connected");
      if (this.effectiveMode === "tspl") {
        const c = this.config;
        let tspl = `SIZE ${c.labelWidth} mm, 40 mm\r\nCLS\r\n`;
        tspl += `TEXT ${c.tsplMarginX},${c.tsplMarginY},"3",0,1,1,"${escQ(text)}"\r\nPRINT 1\r\n`;
        await this._sendText(tspl);
      } else {
        const cmds = [CMD.INIT];
        if (opts.align === "center") cmds.push(CMD.ALIGN_CENTER);
        else if (opts.align === "right") cmds.push(CMD.ALIGN_RIGHT);
        else cmds.push(CMD.ALIGN_LEFT);
        if (opts.bold) cmds.push(CMD.BOLD_ON);
        if (opts.doubleSize) cmds.push(CMD.DOUBLE_SIZE_ON);
        await this._send(this._build(
          ...cmds, text + "\n\n\n", CMD.NORMAL_SIZE, CMD.BOLD_OFF, CMD.ALIGN_LEFT,
          ...(this.config.autoCut ? [CMD.CUT_PARTIAL] : [CMD.FEED_LINES(2)])
        ));
      }
    }

    async sendRaw(bytes) {
      if (!this.isConnected) throw new Error("Not connected");
      await this._send(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    }

    async openCashDrawer(pin) {
      if (!this.isConnected) throw new Error("Not connected");
      const p = pin || this.config.cashDrawerPin;
      await this._send(this._build(p === 5 ? CMD.DRAWER_PIN5 : CMD.DRAWER_PIN2));
      this._emit("drawerOpened", { pin: p });
    }

    /* ─── Config & Persistence ───────────────────────────────────────── */
    saveConfig() {
      const s = {};
      const keys = ["storeName","storeAddress","storePhone","storeNPWP","footerText",
                     "paperWidth","charsPerLine","autoCut","copies","openDrawerOnPrint",
                     "cashDrawerPin","chunkSize","chunkDelay","autoReconnect","commandMode",
                     "labelWidth","labelHeight","labelGap","labelDensity"];
      for (const k of keys) s[k] = this.config[k];
      this.store.saveSettings(s);
      this._emit("configSaved", s);

      // Also update device profile if connected
      if (this._device?.id) {
        this.store.save(this._device.id, {
          deviceName: this.deviceName,
          commandMode: this.effectiveMode,
          paperWidth: this.config.paperWidth,
          charsPerLine: this.config.charsPerLine,
          autoCut: this.config.autoCut,
          chunkSize: this.config.chunkSize,
          chunkDelay: this.config.chunkDelay,
          serviceUuid: this._service?.uuid,
          charUuid: this._char?.uuid,
          writeMethod: this._writeMethod,
          labelWidth: this.config.labelWidth,
          labelHeight: this.config.labelHeight,
        });
      }
    }

    updateConfig(cfg, save = true) {
      Object.assign(this.config, cfg);
      if (cfg.paperWidth && !cfg.charsPerLine) this.config.charsPerLine = PAPER_COLS[cfg.paperWidth] || 48;
      if (save) this.saveConfig();
    }

    resetConfig() {
      this.config = { ...DEFAULTS, storageKey: this.config.storageKey, apiEndpoint: this.config.apiEndpoint, apiHeaders: this.config.apiHeaders };
      try { localStorage.removeItem(this.config.storageKey + "_settings"); } catch {}
    }

    /** Get all known device profiles */
    getDeviceProfiles() { return this.store.getAll(); }

    /** Delete a device profile */
    deleteDeviceProfile(deviceId) { this.store.delete(deviceId); }

    getDiagnostics() {
      return {
        supported: PrinterManager.isSupported(),
        connected: this._connected,
        commandMode: this.effectiveMode,
        configMode: this.config.commandMode,
        deviceName: this.deviceName,
        deviceId: this.deviceId,
        serviceUuid: this._service?.uuid || null,
        charUuid: this._char?.uuid || null,
        writeMethod: this._writeMethod,
        paperWidth: this.config.paperWidth,
        charsPerLine: this.config.charsPerLine,
        labelSize: this.effectiveMode === "tspl" ? `${this.config.labelWidth}x${this.config.labelHeight}mm` : "n/a",
        autoCut: this.config.autoCut,
        chunkSize: this.config.chunkSize,
        chunkDelay: this.config.chunkDelay,
        charProps: this._char ? {
          write: this._char.properties.write,
          writeWithoutResponse: this._char.properties.writeWithoutResponse,
        } : null,
        savedProfiles: Object.keys(this.store.getAll()).length,
      };
    }

    /* ─── Static Utilities ───────────────────────────────────────────── */
    static formatCurrency(n) { return fmtCurrency(n); }
    static generateInvoiceNumber(pfx) { return genInvoice(pfx); }
    static formatDate(d) { return fmtDate(d); }
  }

  // Expose DeviceStore for advanced usage
  PrinterManager.DeviceStore = DeviceStore;

  return PrinterManager;
});


// ESM default export — works because UMD assigns to root (globalThis)
const _export = (typeof self !== 'undefined' ? self : globalThis).PrinterManager;
export default _export;
