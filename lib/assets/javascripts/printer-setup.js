/**
 * ============================================================================
 * GoldPOS Printer Setup UI v1.0.0
 * ============================================================================
 * Framework-agnostic UI component for printer setup, testing, and
 * configuration. Renders into any container element.
 *
 * Usage:
 *   const setup = new PrinterSetup(document.getElementById('printer-setup'), {
 *     printerManager: myPrinterManager,
 *     onConfigSaved: (config) => { ... },
 *   });
 *
 * License: MIT
 * ============================================================================
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['./printer-manager'], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./printer-manager'));
  } else {
    root.PrinterSetup = factory(root.PrinterManager);
  }
})(typeof self !== 'undefined' ? self : this, function (PrinterManager) {
  'use strict';

  // ---------------------------------------------------------------------------
  // CSS Styles (injected once)
  // ---------------------------------------------------------------------------
  const STYLES_ID = 'goldpos-printer-setup-styles';

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;

    const css = `
      .gpos-setup { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; }
      .gpos-setup * { box-sizing: border-box; }

      .gpos-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
      .gpos-card h3 { margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #1a202c; }

      .gpos-status { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; font-weight: 500; }
      .gpos-status--disconnected { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
      .gpos-status--connected { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
      .gpos-status--reconnecting { background: #fffbeb; color: #92400e; border: 1px solid #fed7aa; }
      .gpos-status-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
      .gpos-status--disconnected .gpos-status-dot { background: #dc2626; }
      .gpos-status--connected .gpos-status-dot { background: #16a34a; animation: gpos-pulse 2s infinite; }
      .gpos-status--reconnecting .gpos-status-dot { background: #f59e0b; animation: gpos-blink 1s infinite; }

      @keyframes gpos-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
      @keyframes gpos-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

      .gpos-info-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
      .gpos-info-row:last-child { border-bottom: none; }
      .gpos-info-label { color: #64748b; }
      .gpos-info-value { color: #1e293b; font-weight: 500; }

      .gpos-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 20px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all .15s ease; min-width: 120px; }
      .gpos-btn:disabled { opacity: .5; cursor: not-allowed; }
      .gpos-btn--primary { background: #c9a84c; color: #fff; }
      .gpos-btn--primary:hover:not(:disabled) { background: #b8932f; }
      .gpos-btn--danger { background: #ef4444; color: #fff; }
      .gpos-btn--danger:hover:not(:disabled) { background: #dc2626; }
      .gpos-btn--secondary { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
      .gpos-btn--secondary:hover:not(:disabled) { background: #e2e8f0; }
      .gpos-btn--sm { padding: 6px 14px; font-size: 13px; min-width: 80px; }

      .gpos-btn-group { display: flex; gap: 8px; flex-wrap: wrap; }

      .gpos-select { padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; background: #fff; color: #1e293b; cursor: pointer; }

      .gpos-log { max-height: 200px; overflow-y: auto; background: #0f172a; border-radius: 8px; padding: 12px; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; line-height: 1.6; }
      .gpos-log-entry { color: #94a3b8; }
      .gpos-log-entry--info { color: #38bdf8; }
      .gpos-log-entry--success { color: #4ade80; }
      .gpos-log-entry--error { color: #f87171; }
      .gpos-log-entry--warn { color: #fbbf24; }
    `;

    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // PrinterSetup Component
  // ---------------------------------------------------------------------------
  class PrinterSetup {
    /**
     * @param {HTMLElement} container
     * @param {Object} options
     * @param {PrinterManager} options.printerManager - existing instance (optional)
     * @param {Function} options.onConfigSaved        - callback(config)
     * @param {Function} options.onConnected           - callback(info)
     * @param {Function} options.onDisconnected        - callback()
     */
    constructor(container, options = {}) {
      if (!container) throw new Error('PrinterSetup requires a container element.');

      this.container = container;
      this.options = options;
      this.printer = options.printerManager || new PrinterManager();
      this.logEntries = [];

      injectStyles();
      this._bindPrinterEvents();
      this._render();
      this._checkSavedConfig();
    }

    // -----------------------------------------------------------------------
    // Printer Event Binding
    // -----------------------------------------------------------------------
    _bindPrinterEvents() {
      this.printer.on('connected', (info) => {
        this._log(`Connected to: ${info.name}`, 'success');
        this._updateUI();
        if (this.options.onConnected) this.options.onConnected(info);
      });

      this.printer.on('disconnected', () => {
        this._log('Printer disconnected', 'warn');
        this._updateUI();
        if (this.options.onDisconnected) this.options.onDisconnected();
      });

      this.printer.on('reconnecting', (data) => {
        this._log(`Reconnecting... attempt ${data.attempt}`, 'warn');
        this._updateUI();
      });

      this.printer.on('reconnected', (data) => {
        this._log(`Reconnected to: ${data.name}`, 'success');
        this._updateUI();
      });

      this.printer.on('printing', (data) => {
        this._log(`Printing ${data.type}...`, 'info');
      });

      this.printer.on('printed', (data) => {
        this._log(`Print complete: ${data.type}`, 'success');
      });

      this.printer.on('cashDrawerOpened', () => {
        this._log('Cash drawer opened', 'success');
      });

      this.printer.on('error', (data) => {
        this._log(`Error [${data.type}]: ${data.message}`, 'error');
      });
    }

    // -----------------------------------------------------------------------
    // Rendering
    // -----------------------------------------------------------------------
    _render() {
      this.container.innerHTML = '';
      this.container.classList.add('gpos-setup');

      // Status card
      this._statusEl = this._createStatusCard();
      this.container.appendChild(this._statusEl);

      // Info card (shown when connected)
      this._infoCard = this._createInfoCard();
      this.container.appendChild(this._infoCard);

      // Settings card
      this._settingsCard = this._createSettingsCard();
      this.container.appendChild(this._settingsCard);

      // Actions card
      this._actionsCard = this._createActionsCard();
      this.container.appendChild(this._actionsCard);

      // Log card
      this._logCard = this._createLogCard();
      this.container.appendChild(this._logCard);

      this._updateUI();
    }

    _createStatusCard() {
      const card = document.createElement('div');
      card.className = 'gpos-card';
      card.innerHTML = `
        <div class="gpos-status gpos-status--disconnected" id="gpos-status-bar">
          <span class="gpos-status-dot"></span>
          <span id="gpos-status-text">Tidak terhubung</span>
        </div>
        <div class="gpos-btn-group">
          <button class="gpos-btn gpos-btn--primary" id="gpos-btn-connect">
            🔗 Hubungkan Printer
          </button>
          <button class="gpos-btn gpos-btn--danger gpos-btn--sm" id="gpos-btn-disconnect" style="display:none">
            Putuskan
          </button>
        </div>
      `;

      card.querySelector('#gpos-btn-connect').addEventListener('click', () => this._handleConnect());
      card.querySelector('#gpos-btn-disconnect').addEventListener('click', () => this._handleDisconnect());

      return card;
    }

    _createInfoCard() {
      const card = document.createElement('div');
      card.className = 'gpos-card';
      card.style.display = 'none';
      card.innerHTML = `
        <h3>📡 Informasi Printer</h3>
        <div id="gpos-info-rows"></div>
      `;
      return card;
    }

    _createSettingsCard() {
      const card = document.createElement('div');
      card.className = 'gpos-card';
      card.innerHTML = `
        <h3>⚙️ Pengaturan</h3>
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
          <label style="font-size:14px; color:#475569; min-width:100px;">Lebar Kertas</label>
          <select class="gpos-select" id="gpos-paper-width">
            <option value="80mm" ${this.printer.options.paperWidth === '80mm' ? 'selected' : ''}>80mm</option>
            <option value="58mm" ${this.printer.options.paperWidth === '58mm' ? 'selected' : ''}>58mm</option>
          </select>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <label style="font-size:14px; color:#475569; min-width:100px;">Auto-reconnect</label>
          <input type="checkbox" id="gpos-auto-reconnect" ${this.printer.options.autoReconnect ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer;">
        </div>
      `;

      card.querySelector('#gpos-paper-width').addEventListener('change', (e) => {
        this.printer.setPaperWidth(e.target.value);
        this._log(`Paper width set to ${e.target.value}`, 'info');
      });

      card.querySelector('#gpos-auto-reconnect').addEventListener('change', (e) => {
        this.printer.options.autoReconnect = e.target.checked;
        this._log(`Auto-reconnect: ${e.target.checked ? 'ON' : 'OFF'}`, 'info');
      });

      return card;
    }

    _createActionsCard() {
      const card = document.createElement('div');
      card.className = 'gpos-card';
      card.innerHTML = `
        <h3>🖨️ Aksi</h3>
        <div class="gpos-btn-group">
          <button class="gpos-btn gpos-btn--secondary gpos-btn--sm" id="gpos-btn-test">Test Print</button>
          <button class="gpos-btn gpos-btn--secondary gpos-btn--sm" id="gpos-btn-receipt">Sample Receipt</button>
          <button class="gpos-btn gpos-btn--secondary gpos-btn--sm" id="gpos-btn-drawer">Buka Laci</button>
          <button class="gpos-btn gpos-btn--secondary gpos-btn--sm" id="gpos-btn-clear">Reset Config</button>
        </div>
      `;

      card.querySelector('#gpos-btn-test').addEventListener('click', () => this._handleTestPrint());
      card.querySelector('#gpos-btn-receipt').addEventListener('click', () => this._handleSampleReceipt());
      card.querySelector('#gpos-btn-drawer').addEventListener('click', () => this._handleOpenDrawer());
      card.querySelector('#gpos-btn-clear').addEventListener('click', () => this._handleClearConfig());

      return card;
    }

    _createLogCard() {
      const card = document.createElement('div');
      card.className = 'gpos-card';
      card.innerHTML = `
        <h3>📋 Log Aktivitas</h3>
        <div class="gpos-log" id="gpos-log"></div>
      `;
      return card;
    }

    // -----------------------------------------------------------------------
    // UI Updates
    // -----------------------------------------------------------------------
    _updateUI() {
      const state = this.printer.connectionState;
      const statusBar = this.container.querySelector('#gpos-status-bar');
      const statusText = this.container.querySelector('#gpos-status-text');
      const btnConnect = this.container.querySelector('#gpos-btn-connect');
      const btnDisconnect = this.container.querySelector('#gpos-btn-disconnect');

      // Status bar
      statusBar.className = `gpos-status gpos-status--${state}`;

      const labels = {
        connected: `Terhubung: ${this.printer.deviceName}`,
        disconnected: 'Tidak terhubung',
        reconnecting: 'Menghubungkan ulang...',
      };
      statusText.textContent = labels[state] || 'Tidak terhubung';

      // Buttons
      btnConnect.style.display = state === 'connected' ? 'none' : '';
      btnDisconnect.style.display = state === 'connected' ? '' : 'none';

      // Info card
      if (state === 'connected') {
        this._infoCard.style.display = '';
        const rows = this._infoCard.querySelector('#gpos-info-rows');
        rows.innerHTML = `
          <div class="gpos-info-row"><span class="gpos-info-label">Nama</span><span class="gpos-info-value">${this.printer.deviceName}</span></div>
          <div class="gpos-info-row"><span class="gpos-info-label">ID</span><span class="gpos-info-value" style="font-size:11px;">${this.printer.deviceId || '-'}</span></div>
          <div class="gpos-info-row"><span class="gpos-info-label">Lebar Kertas</span><span class="gpos-info-value">${this.printer.options.paperWidth}</span></div>
          <div class="gpos-info-row"><span class="gpos-info-label">Kolom</span><span class="gpos-info-value">${this.printer.columns}</span></div>
        `;
      } else {
        this._infoCard.style.display = 'none';
      }

      // Action buttons
      const actionBtns = this._actionsCard.querySelectorAll('.gpos-btn');
      actionBtns.forEach(btn => {
        if (btn.id !== 'gpos-btn-clear') {
          btn.disabled = state !== 'connected';
        }
      });
    }

    // -----------------------------------------------------------------------
    // Event Handlers
    // -----------------------------------------------------------------------
    async _handleConnect() {
      try {
        const btn = this.container.querySelector('#gpos-btn-connect');
        btn.disabled = true;
        btn.textContent = 'Mencari...';
        await this.printer.connect();
      } catch (err) {
        this._log(`Connection failed: ${err.message}`, 'error');
      } finally {
        const btn = this.container.querySelector('#gpos-btn-connect');
        btn.disabled = false;
        btn.innerHTML = '🔗 Hubungkan Printer';
        this._updateUI();
      }
    }

    async _handleDisconnect() {
      await this.printer.disconnect();
      this._log('Disconnected by user', 'info');
      this._updateUI();
    }

    async _handleTestPrint() {
      try { await this.printer.testPrint(); }
      catch (err) { this._log(`Test print failed: ${err.message}`, 'error'); }
    }

    async _handleSampleReceipt() {
      const sampleData = {
        store: {
          name: 'TOKO EMAS SEJAHTERA',
          address: 'Jl. Pasar Baru No. 123, Jakarta',
          phone: '021-5551234',
        },
        invoiceNo: PrinterManager.generateInvoiceNumber('INV'),
        cashierName: 'Admin',
        items: [
          { name: 'Cincin Emas', weight: 5.25, karat: '24K', price: 5775000, qty: 1 },
          { name: 'Gelang Emas', weight: 10.0, karat: '18K', price: 7500000, qty: 1 },
          { name: 'Kalung Emas', weight: 3.5, karat: '22K', price: 3465000, qty: 1 },
        ],
        subtotal: 16740000,
        discount: 240000,
        tax: 1815000,
        total: 18315000,
        paid: 19000000,
        change: 685000,
        paymentMethod: 'cash',
        footer: 'Terima Kasih atas Kunjungan Anda!',
      };

      try { await this.printer.printReceipt(sampleData); }
      catch (err) { this._log(`Sample receipt failed: ${err.message}`, 'error'); }
    }

    async _handleOpenDrawer() {
      try { await this.printer.openCashDrawer(); }
      catch (err) { this._log(`Cash drawer failed: ${err.message}`, 'error'); }
    }

    _handleClearConfig() {
      this.printer.clearConfig();
      this._log('Saved config cleared', 'info');
    }

    _checkSavedConfig() {
      const saved = this.printer.loadConfig();
      if (saved) {
        this._log(`Saved config found: ${saved.name} (${saved.paperWidth})`, 'info');
        if (saved.paperWidth) {
          this.printer.setPaperWidth(saved.paperWidth);
          const select = this.container.querySelector('#gpos-paper-width');
          if (select) select.value = saved.paperWidth;
        }
      }
    }

    // -----------------------------------------------------------------------
    // Logging
    // -----------------------------------------------------------------------
    _log(message, level = 'info') {
      const time = new Date().toLocaleTimeString('id-ID');
      const entry = { time, message, level };
      this.logEntries.push(entry);

      const logEl = this.container.querySelector('#gpos-log');
      if (logEl) {
        const div = document.createElement('div');
        div.className = `gpos-log-entry gpos-log-entry--${level}`;
        div.textContent = `[${time}] ${message}`;
        logEl.appendChild(div);
        logEl.scrollTop = logEl.scrollHeight;
      }
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /** Get the underlying PrinterManager instance. */
    getPrinterManager() {
      return this.printer;
    }

    /** Destroy the component and clean up. */
    destroy() {
      this.container.innerHTML = '';
      this.container.classList.remove('gpos-setup');
    }
  }

  return PrinterSetup;
});
