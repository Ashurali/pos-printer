/**
 * ============================================================================
 * GoldPOS Printer Manager v1.0.0
 * ============================================================================
 * Framework-agnostic Bluetooth thermal printer manager for POS systems.
 * Uses Web Bluetooth API + ESC/POS commands.
 *
 * Supports: 58mm & 80mm thermal printers, cash drawer kick.
 *
 * Usage:
 *   const printer = new PrinterManager();
 *   await printer.connect();
 *   await printer.printReceipt(receiptData);
 *   await printer.openCashDrawer();
 *
 * Events: 'connected', 'disconnected', 'printing', 'printed',
 *         'error', 'cashDrawerOpened', 'reconnecting', 'reconnected'
 *
 * License: MIT
 * ============================================================================
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PrinterManager = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // ESC/POS Command Constants
  // ---------------------------------------------------------------------------
  const ESC = 0x1B;
  const GS  = 0x1D;
  const LF  = 0x0A;
  const DLE = 0x10;

  const CMD = Object.freeze({
    INIT:             [ESC, 0x40],
    ALIGN_LEFT:       [ESC, 0x61, 0x00],
    ALIGN_CENTER:     [ESC, 0x61, 0x01],
    ALIGN_RIGHT:      [ESC, 0x61, 0x02],
    BOLD_ON:          [ESC, 0x45, 0x01],
    BOLD_OFF:         [ESC, 0x45, 0x00],
    UNDERLINE_ON:     [ESC, 0x2D, 0x01],
    UNDERLINE_OFF:    [ESC, 0x2D, 0x00],
    DOUBLE_HEIGHT:    [GS, 0x21, 0x01],
    DOUBLE_WIDTH:     [GS, 0x21, 0x10],
    DOUBLE_HW:        [GS, 0x21, 0x11],
    NORMAL_SIZE:      [GS, 0x21, 0x00],
    FONT_A:           [ESC, 0x4D, 0x00],
    FONT_B:           [ESC, 0x4D, 0x01],
    CUT_PAPER:        [GS, 0x56, 0x00],
    CUT_PAPER_PARTIAL:[GS, 0x56, 0x01],
    FEED_LINES:       (n) => [ESC, 0x64, n],
    LINE_SPACING:     (n) => [ESC, 0x33, n],
    CASH_DRAWER_PIN2: [ESC, 0x70, 0x00, 0x19, 0xFF],
    CASH_DRAWER_PIN5: [ESC, 0x70, 0x01, 0x19, 0xFF],
    BEEP:             [ESC, 0x42, 0x03, 0x02],
  });

  // Bluetooth Service/Characteristic UUIDs commonly used by thermal printers
  const BT_SERVICES = [
    '000018f0-0000-1000-8000-00805f9b34fb',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  ];

  const BT_CHARACTERISTICS_WRITE = [
    '00002af1-0000-1000-8000-00805f9b34fb',
    '49535343-8841-43f4-a8d4-ecbe34729bb3',
    'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
  ];

  // ---------------------------------------------------------------------------
  // Utility helpers
  // ---------------------------------------------------------------------------
  function textEncoder() {
    return new TextEncoder();
  }

  function encodeText(text) {
    return textEncoder().encode(text);
  }

  function mergeUint8Arrays(...arrays) {
    const flat = arrays.map(a => (a instanceof Uint8Array ? a : new Uint8Array(a)));
    const totalLength = flat.reduce((sum, a) => sum + a.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const a of flat) {
      result.set(a, offset);
      offset += a.length;
    }
    return result;
  }

  function formatCurrency(amount) {
    return 'Rp ' + Number(amount).toLocaleString('id-ID');
  }

  function padRight(str, len) {
    return (str + ' '.repeat(len)).substring(0, len);
  }

  function padLeft(str, len) {
    return (' '.repeat(len) + str).slice(-len);
  }

  function repeatChar(char, len) {
    return char.repeat(len);
  }

  function generateInvoiceNumber(prefix = 'INV') {
    const now = new Date();
    const y = now.getFullYear().toString().slice(-2);
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    return `${prefix}-${y}${m}${d}-${seq}`;
  }

  function currentDateTimeStr() {
    const now = new Date();
    const date = now.toLocaleDateString('id-ID', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    const time = now.toLocaleTimeString('id-ID', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    return `${date} ${time}`;
  }

  // ---------------------------------------------------------------------------
  // Event Emitter Mixin
  // ---------------------------------------------------------------------------
  class EventEmitter {
    constructor() {
      this._listeners = {};
    }

    on(event, fn) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(fn);
      return this;
    }

    off(event, fn) {
      if (!this._listeners[event]) return this;
      this._listeners[event] = this._listeners[event].filter(f => f !== fn);
      return this;
    }

    once(event, fn) {
      const wrapper = (...args) => {
        fn(...args);
        this.off(event, wrapper);
      };
      return this.on(event, wrapper);
    }

    emit(event, ...args) {
      if (!this._listeners[event]) return;
      for (const fn of this._listeners[event]) {
        try { fn(...args); } catch (e) { console.error(`Event handler error [${event}]:`, e); }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // PrinterManager
  // ---------------------------------------------------------------------------
  class PrinterManager extends EventEmitter {
    /**
     * @param {Object} options
     * @param {string} options.paperWidth     - '58mm' or '80mm' (default '80mm')
     * @param {number} options.chunkSize      - bytes per write (default 512)
     * @param {number} options.chunkDelay     - ms between chunks (default 50)
     * @param {boolean} options.autoReconnect - try reconnect on disconnect (default true)
     * @param {number} options.maxReconnectAttempts - (default 3)
     * @param {string} options.storageKey     - localStorage key (default 'goldpos_printer')
     */
    constructor(options = {}) {
      super();

      const defaults = {
        paperWidth: '80mm',
        chunkSize: 512,
        chunkDelay: 50,
        autoReconnect: true,
        maxReconnectAttempts: 3,
        storageKey: 'goldpos_printer',
      };

      this.options = { ...defaults, ...options };
      this.device = null;
      this.server = null;
      this.service = null;
      this.characteristic = null;
      this.isConnected = false;
      this._reconnectAttempts = 0;
      this._reconnecting = false;

      // Columns available for text (mono-spaced) based on paper width
      this.columns = this.options.paperWidth === '58mm' ? 32 : 48;
    }

    // -----------------------------------------------------------------------
    // Bluetooth Connection
    // -----------------------------------------------------------------------

    /**
     * Check if Web Bluetooth is supported.
     */
    static isSupported() {
      return !!(navigator && navigator.bluetooth);
    }

    /**
     * Scan, pair, and connect to a Bluetooth thermal printer.
     * @returns {Promise<Object>} Device info { name, id }
     */
    async connect() {
      if (!PrinterManager.isSupported()) {
        throw new Error('Web Bluetooth API is not supported in this browser. Use Chrome or Edge.');
      }

      try {
        this.device = await navigator.bluetooth.requestDevice({
          filters: [{ services: [BT_SERVICES[0]] }],
          optionalServices: BT_SERVICES,
          acceptAllDevices: false,
        }).catch(() => {
          // Fallback: accept all devices if service filter fails
          return navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: BT_SERVICES,
          });
        });

        if (!this.device) throw new Error('No device selected.');

        this.device.addEventListener('gattserverdisconnected', () => this._onDisconnected());

        this.server = await this.device.gatt.connect();

        // Try each known service UUID
        for (const svcUuid of BT_SERVICES) {
          try {
            this.service = await this.server.getPrimaryService(svcUuid);
            break;
          } catch (_) { /* try next */ }
        }

        if (!this.service) throw new Error('No compatible print service found on this device.');

        // Try each known characteristic UUID
        for (const charUuid of BT_CHARACTERISTICS_WRITE) {
          try {
            this.characteristic = await this.service.getCharacteristic(charUuid);
            break;
          } catch (_) { /* try next */ }
        }

        if (!this.characteristic) {
          // Fallback: find any writable characteristic
          const chars = await this.service.getCharacteristics();
          for (const c of chars) {
            if (c.properties.write || c.properties.writeWithoutResponse) {
              this.characteristic = c;
              break;
            }
          }
        }

        if (!this.characteristic) throw new Error('No writable characteristic found.');

        this.isConnected = true;
        this._reconnectAttempts = 0;

        const info = { name: this.device.name || 'Unknown Printer', id: this.device.id };
        this._saveConfig(info);
        this.emit('connected', info);

        return info;
      } catch (err) {
        this.emit('error', { type: 'connection', message: err.message, error: err });
        throw err;
      }
    }

    /**
     * Disconnect from the printer.
     */
    async disconnect() {
      this._reconnecting = false; // stop any reconnect loop
      if (this.device && this.device.gatt.connected) {
        this.device.gatt.disconnect();
      }
      this.isConnected = false;
      this.characteristic = null;
      this.service = null;
      this.server = null;
    }

    /**
     * Attempt to reconnect to the last known device.
     */
    async reconnect() {
      if (!this.device || !this.device.gatt) {
        throw new Error('No device to reconnect to. Call connect() first.');
      }

      this.emit('reconnecting', { attempt: this._reconnectAttempts + 1 });

      try {
        this.server = await this.device.gatt.connect();

        for (const svcUuid of BT_SERVICES) {
          try {
            this.service = await this.server.getPrimaryService(svcUuid);
            break;
          } catch (_) {}
        }

        if (this.service) {
          for (const charUuid of BT_CHARACTERISTICS_WRITE) {
            try {
              this.characteristic = await this.service.getCharacteristic(charUuid);
              break;
            } catch (_) {}
          }
        }

        if (!this.characteristic) throw new Error('Could not restore characteristic.');

        this.isConnected = true;
        this._reconnectAttempts = 0;
        this._reconnecting = false;
        this.emit('reconnected', { name: this.device.name });
      } catch (err) {
        this._reconnectAttempts++;
        if (this._reconnectAttempts < this.options.maxReconnectAttempts) {
          const delay = 1000 * this._reconnectAttempts;
          await new Promise(r => setTimeout(r, delay));
          return this.reconnect();
        }
        this._reconnecting = false;
        this.emit('error', { type: 'reconnect', message: 'Max reconnect attempts reached.', error: err });
        throw err;
      }
    }

    // -----------------------------------------------------------------------
    // Internal: disconnect handler
    // -----------------------------------------------------------------------
    _onDisconnected() {
      this.isConnected = false;
      this.emit('disconnected', { name: this.device?.name });

      if (this.options.autoReconnect && !this._reconnecting) {
        this._reconnecting = true;
        this._reconnectAttempts = 0;
        this.reconnect().catch(() => {});
      }
    }

    // -----------------------------------------------------------------------
    // Raw Data Sending
    // -----------------------------------------------------------------------

    /**
     * Send raw bytes to the printer in chunks.
     * @param {Uint8Array} data
     */
    async _sendRaw(data) {
      if (!this.isConnected || !this.characteristic) {
        throw new Error('Printer is not connected.');
      }

      const { chunkSize, chunkDelay } = this.options;
      for (let offset = 0; offset < data.length; offset += chunkSize) {
        const chunk = data.slice(offset, offset + chunkSize);
        try {
          if (this.characteristic.properties.writeWithoutResponse) {
            await this.characteristic.writeValueWithoutResponse(chunk);
          } else {
            await this.characteristic.writeValue(chunk);
          }
        } catch (err) {
          this.emit('error', { type: 'write', message: err.message, error: err });
          throw err;
        }
        if (chunkDelay > 0 && offset + chunkSize < data.length) {
          await new Promise(r => setTimeout(r, chunkDelay));
        }
      }
    }

    // -----------------------------------------------------------------------
    // ESC/POS Builder Helpers
    // -----------------------------------------------------------------------

    _cmd(...bytes) {
      return new Uint8Array(bytes.flat());
    }

    _text(str) {
      return encodeText(str);
    }

    _line(str) {
      return mergeUint8Arrays(encodeText(str), new Uint8Array([LF]));
    }

    _separator(char = '-') {
      return this._line(repeatChar(char, this.columns));
    }

    _emptyLine() {
      return new Uint8Array([LF]);
    }

    _twoColumn(left, right) {
      const maxLeft = this.columns - right.length - 1;
      const l = padRight(left, maxLeft);
      const r = padLeft(right, right.length);
      return this._line(l + ' ' + r);
    }

    _threeColumn(left, center, right) {
      const rightLen = right.length;
      const centerLen = center.length;
      const leftLen = this.columns - rightLen - centerLen - 2;
      return this._line(
        padRight(left, leftLen) + ' ' + padRight(center, centerLen) + ' ' + padLeft(right, rightLen)
      );
    }

    // -----------------------------------------------------------------------
    // Receipt Building: Gold Shop Specific
    // -----------------------------------------------------------------------

    /**
     * Build a complete receipt buffer for a gold shop transaction.
     *
     * @param {Object} data
     * @param {Object}   data.store       - { name, address, phone, npwp? }
     * @param {string}   data.invoiceNo   - e.g. 'INV-250214-0001'
     * @param {string}   data.cashierName - cashier name
     * @param {Array}    data.items       - [{ name, weight, karat, price, qty? }]
     * @param {number}   data.subtotal
     * @param {number}   data.discount    - (optional)
     * @param {number}   data.tax         - (optional, e.g. PPN 11%)
     * @param {number}   data.total
     * @param {number}   data.paid
     * @param {number}   data.change
     * @param {string}   data.paymentMethod - 'cash'|'debit'|'credit'|'transfer'
     * @param {string}   data.footer      - (optional)
     * @returns {Uint8Array}
     */
    buildReceipt(data) {
      const parts = [];

      // Initialize printer
      parts.push(this._cmd(CMD.INIT));

      // Store header (centered, bold, large)
      parts.push(this._cmd(CMD.ALIGN_CENTER));
      parts.push(this._cmd(CMD.BOLD_ON));
      parts.push(this._cmd(CMD.DOUBLE_HW));
      parts.push(this._line(data.store.name || 'TOKO EMAS'));
      parts.push(this._cmd(CMD.NORMAL_SIZE));
      parts.push(this._cmd(CMD.BOLD_OFF));

      if (data.store.address) {
        parts.push(this._line(data.store.address));
      }
      if (data.store.phone) {
        parts.push(this._line(`Telp: ${data.store.phone}`));
      }
      if (data.store.npwp) {
        parts.push(this._line(`NPWP: ${data.store.npwp}`));
      }

      parts.push(this._cmd(CMD.ALIGN_LEFT));
      parts.push(this._separator('='));

      // Invoice info
      parts.push(this._twoColumn('No', data.invoiceNo || generateInvoiceNumber()));
      parts.push(this._twoColumn('Tanggal', currentDateTimeStr()));
      if (data.cashierName) {
        parts.push(this._twoColumn('Kasir', data.cashierName));
      }

      parts.push(this._separator('-'));

      // Column header
      parts.push(this._cmd(CMD.BOLD_ON));
      parts.push(this._line('Item'));
      parts.push(this._cmd(CMD.BOLD_OFF));
      parts.push(this._separator('-'));

      // Items
      for (const item of (data.items || [])) {
        const qty = item.qty || 1;
        const itemName = item.name || 'Emas';

        // Line 1: item name
        parts.push(this._cmd(CMD.BOLD_ON));
        parts.push(this._line(itemName));
        parts.push(this._cmd(CMD.BOLD_OFF));

        // Line 2: weight, karat, qty
        const detail = `  ${item.weight || '0'}g | ${item.karat || '24'}K | x${qty}`;
        const priceStr = formatCurrency(item.price * qty);
        parts.push(this._twoColumn(detail, priceStr));
      }

      parts.push(this._separator('-'));

      // Subtotal
      parts.push(this._twoColumn('Subtotal', formatCurrency(data.subtotal || 0)));

      // Discount
      if (data.discount && data.discount > 0) {
        parts.push(this._twoColumn('Diskon', `- ${formatCurrency(data.discount)}`));
      }

      // Tax
      if (data.tax && data.tax > 0) {
        parts.push(this._twoColumn('Pajak (PPN)', formatCurrency(data.tax)));
      }

      parts.push(this._separator('='));

      // Total (bold, large)
      parts.push(this._cmd(CMD.BOLD_ON));
      parts.push(this._cmd(CMD.DOUBLE_HEIGHT));
      parts.push(this._twoColumn('TOTAL', formatCurrency(data.total || 0)));
      parts.push(this._cmd(CMD.NORMAL_SIZE));
      parts.push(this._cmd(CMD.BOLD_OFF));

      parts.push(this._separator('-'));

      // Payment info
      const methodLabels = {
        cash: 'Tunai', debit: 'Debit', credit: 'Kartu Kredit', transfer: 'Transfer',
      };
      const methodLabel = methodLabels[data.paymentMethod] || data.paymentMethod || 'Tunai';
      parts.push(this._twoColumn('Pembayaran', methodLabel));
      parts.push(this._twoColumn('Dibayar', formatCurrency(data.paid || 0)));

      if (data.paymentMethod === 'cash') {
        parts.push(this._twoColumn('Kembali', formatCurrency(data.change || 0)));
      }

      parts.push(this._separator('='));

      // Footer
      parts.push(this._cmd(CMD.ALIGN_CENTER));
      parts.push(this._emptyLine());
      parts.push(this._line(data.footer || 'Terima Kasih'));
      parts.push(this._line('Barang yang sudah dibeli'));
      parts.push(this._line('tidak dapat dikembalikan'));
      parts.push(this._emptyLine());

      // Feed and cut
      parts.push(this._cmd(CMD.FEED_LINES(4)));
      parts.push(this._cmd(CMD.CUT_PAPER_PARTIAL));

      return mergeUint8Arrays(...parts);
    }

    // -----------------------------------------------------------------------
    // Print Methods
    // -----------------------------------------------------------------------

    /**
     * Print a complete gold shop receipt.
     * @param {Object} receiptData - see buildReceipt() for structure
     * @param {number} copies      - number of copies (default 1)
     */
    async printReceipt(receiptData, copies = 1) {
      this.emit('printing', { type: 'receipt', copies });

      try {
        const buffer = this.buildReceipt(receiptData);
        for (let i = 0; i < copies; i++) {
          await this._sendRaw(buffer);
          if (i < copies - 1) {
            await new Promise(r => setTimeout(r, 300));
          }
        }
        this.emit('printed', { type: 'receipt', copies });
      } catch (err) {
        this.emit('error', { type: 'print', message: err.message, error: err });
        throw err;
      }
    }

    /**
     * Print raw text (utility).
     * @param {string} text
     */
    async printText(text) {
      this.emit('printing', { type: 'text' });
      const buffer = mergeUint8Arrays(
        this._cmd(CMD.INIT),
        this._text(text),
        new Uint8Array([LF]),
        this._cmd(CMD.FEED_LINES(3)),
        this._cmd(CMD.CUT_PAPER_PARTIAL),
      );
      await this._sendRaw(buffer);
      this.emit('printed', { type: 'text' });
    }

    /**
     * Test print: prints a diagnostic receipt.
     */
    async testPrint() {
      this.emit('printing', { type: 'test' });

      const parts = [];
      parts.push(this._cmd(CMD.INIT));

      parts.push(this._cmd(CMD.ALIGN_CENTER));
      parts.push(this._cmd(CMD.BOLD_ON));
      parts.push(this._cmd(CMD.DOUBLE_HW));
      parts.push(this._line('TEST PRINT'));
      parts.push(this._cmd(CMD.NORMAL_SIZE));
      parts.push(this._cmd(CMD.BOLD_OFF));

      parts.push(this._emptyLine());
      parts.push(this._line(`GoldPOS Printer Manager v1.0`));
      parts.push(this._line(`Printer: ${this.device?.name || 'Unknown'}`));
      parts.push(this._line(`Paper: ${this.options.paperWidth}`));
      parts.push(this._line(`Columns: ${this.columns}`));
      parts.push(this._line(`Time: ${currentDateTimeStr()}`));

      parts.push(this._cmd(CMD.ALIGN_LEFT));
      parts.push(this._emptyLine());
      parts.push(this._separator('='));

      // Character test
      parts.push(this._line('ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
      parts.push(this._line('abcdefghijklmnopqrstuvwxyz'));
      parts.push(this._line('0123456789'));
      parts.push(this._line('!@#$%^&*()_+-='));
      parts.push(this._separator('='));

      // Style test
      parts.push(this._cmd(CMD.BOLD_ON));
      parts.push(this._line('Bold Text'));
      parts.push(this._cmd(CMD.BOLD_OFF));
      parts.push(this._cmd(CMD.UNDERLINE_ON));
      parts.push(this._line('Underline Text'));
      parts.push(this._cmd(CMD.UNDERLINE_OFF));
      parts.push(this._cmd(CMD.DOUBLE_WIDTH));
      parts.push(this._line('Double Width'));
      parts.push(this._cmd(CMD.DOUBLE_HEIGHT));
      parts.push(this._line('Double Height'));
      parts.push(this._cmd(CMD.DOUBLE_HW));
      parts.push(this._line('Double Both'));
      parts.push(this._cmd(CMD.NORMAL_SIZE));

      parts.push(this._separator('='));

      // Two-column test
      parts.push(this._twoColumn('Left Column', 'Right'));
      parts.push(this._twoColumn('Emas 24K 5g', 'Rp 5.500.000'));

      parts.push(this._separator('='));

      parts.push(this._cmd(CMD.ALIGN_CENTER));
      parts.push(this._line('--- TEST COMPLETE ---'));
      parts.push(this._emptyLine());
      parts.push(this._cmd(CMD.BEEP));
      parts.push(this._cmd(CMD.FEED_LINES(4)));
      parts.push(this._cmd(CMD.CUT_PAPER_PARTIAL));

      const buffer = mergeUint8Arrays(...parts);
      await this._sendRaw(buffer);
      this.emit('printed', { type: 'test' });
    }

    // -----------------------------------------------------------------------
    // Cash Drawer
    // -----------------------------------------------------------------------

    /**
     * Open the cash drawer (via printer kick-out pins).
     * @param {number} pin - 2 or 5 (default 2)
     */
    async openCashDrawer(pin = 2) {
      try {
        const cmd = pin === 5 ? CMD.CASH_DRAWER_PIN5 : CMD.CASH_DRAWER_PIN2;
        await this._sendRaw(new Uint8Array(cmd));
        this.emit('cashDrawerOpened', { pin });
      } catch (err) {
        this.emit('error', { type: 'cashDrawer', message: err.message, error: err });
        throw err;
      }
    }

    // -----------------------------------------------------------------------
    // Configuration Persistence (localStorage)
    // -----------------------------------------------------------------------

    _saveConfig(info) {
      try {
        const config = {
          name: info.name,
          id: info.id,
          paperWidth: this.options.paperWidth,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(this.options.storageKey, JSON.stringify(config));
      } catch (_) { /* storage not available */ }
    }

    /**
     * Load last saved printer configuration.
     * @returns {Object|null}
     */
    loadConfig() {
      try {
        const raw = localStorage.getItem(this.options.storageKey);
        return raw ? JSON.parse(raw) : null;
      } catch (_) {
        return null;
      }
    }

    /**
     * Clear saved printer configuration.
     */
    clearConfig() {
      try {
        localStorage.removeItem(this.options.storageKey);
      } catch (_) {}
    }

    // -----------------------------------------------------------------------
    // Utility Getters
    // -----------------------------------------------------------------------

    get deviceName() {
      return this.device?.name || null;
    }

    get deviceId() {
      return this.device?.id || null;
    }

    get connectionState() {
      if (this._reconnecting) return 'reconnecting';
      return this.isConnected ? 'connected' : 'disconnected';
    }

    /**
     * Set paper width at runtime.
     */
    setPaperWidth(width) {
      if (width !== '58mm' && width !== '80mm') {
        throw new Error('Paper width must be "58mm" or "80mm".');
      }
      this.options.paperWidth = width;
      this.columns = width === '58mm' ? 32 : 48;
    }
  }

  // ---------------------------------------------------------------------------
  // Static Helpers exposed on the class
  // ---------------------------------------------------------------------------
  PrinterManager.isSupported = function () {
    return !!(navigator && navigator.bluetooth);
  };

  PrinterManager.formatCurrency = formatCurrency;
  PrinterManager.generateInvoiceNumber = generateInvoiceNumber;
  PrinterManager.VERSION = '1.0.0';

  return PrinterManager;
});
