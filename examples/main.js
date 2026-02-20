import PrinterManager from 'ble-pos-printer';
import './style.css';

/* ═══════════════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════════════ */
const printer = new PrinterManager({
  storeName: 'TOKO EMAS JAYA',
  storeAddress: 'Jl. Pasar Baru No. 1',
  storePhone: '021-1234567',
  footerText: 'Terima Kasih atas Kunjungan Anda',
  paperWidth: 80,
  commandMode: 'auto',
  debug: true,
});

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const logs = [];

/* ═══════════════════════════════════════════════════════════════════════
   TABS
   ═══════════════════════════════════════════════════════════════════════ */
$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.remove('tab--active'));
    tab.classList.add('tab--active');
    $$('.panel').forEach(p => p.style.display = 'none');
    $(`#panel-${tab.dataset.tab}`).style.display = 'block';
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   CONNECTION
   ═══════════════════════════════════════════════════════════════════════ */
function updateConnUI(on) {
  const dot = $('#status-dot');
  dot.classList.toggle('on', on);
  $('#status-text').textContent = on ? `Connected: ${printer.deviceName}` : 'No printer connected';
  $('#status-mode').textContent = on ? `[${printer.effectiveMode.toUpperCase()}]` : '';
  $('#bar-disconnect').disabled = !on;

  // Enable/disable all printer-dependent buttons
  $$('[id^="btn-"]').forEach(b => {
    if (b.dataset.needsPrinter !== undefined || [
      'btn-detect', 'btn-test-print', 'btn-print-text', 'btn-print-receipt',
      'btn-open-drawer', 'btn-send-raw', 'btn-diag'
    ].includes(b.id)) {
      b.disabled = !on;
    }
  });
}

async function connect() {
  const btn = $('#bar-connect');
  btn.disabled = true; btn.textContent = '⏳ ...';
  try { await printer.connect(); }
  catch (e) { if (e.message !== 'Selection cancelled.') toast(e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Connect'; }
}

$('#hero-connect').addEventListener('click', connect);
$('#bar-connect').addEventListener('click', connect);
$('#bar-disconnect').addEventListener('click', () => printer.disconnect());

/* ═══════════════════════════════════════════════════════════════════════
   PRINTER EVENTS
   ═══════════════════════════════════════════════════════════════════════ */
printer.on('connected', (d) => {
  updateConnUI(true);
  log('success', `Connected: ${d.device} [${d.commandMode}]`);
  if (d.hasProfile) log('info', 'Device profile loaded from storage');
  loadConfigToForm();
  renderDevices();
});

printer.on('disconnected', (d) => {
  updateConnUI(false);
  log('warning', d.manual ? 'Disconnected' : 'Connection lost');
});

printer.on('reconnecting', (d) => log('info', `Reconnecting ${d.attempt}/${d.max}...`));
printer.on('reconnected', (d) => { updateConnUI(true); log('success', `Reconnected: ${d.device}`); });
printer.on('error', (d) => log('error', `${d.type}: ${d.error.message}`));
printer.on('printStart', (d) => log('info', `Printing ${d.type}...`));
printer.on('printEnd', (d) => { log('success', `Print ${d.type} OK`); toast('Print successful!', 'success'); });
printer.on('printError', (d) => { log('error', `Print failed: ${d.error.message}`); toast('Print failed', 'error'); });
printer.on('drawerOpened', () => log('success', 'Cash drawer opened'));
printer.on('profileSaved', () => { log('success', 'Device profile saved'); renderDevices(); });
printer.on('configSaved', () => log('info', 'Config saved'));
printer.on('stateChange', () => updateConnUI(printer.isConnected));

/* ═══════════════════════════════════════════════════════════════════════
   DETECTION WIZARD
   ═══════════════════════════════════════════════════════════════════════ */
$('#btn-detect').addEventListener('click', async () => {
  const btn = $('#btn-detect');
  const grid = $('#detect-tests');
  const save = $('#detect-save');
  btn.disabled = true; btn.textContent = '⏳ Running tests...';
  save.style.display = 'none';

  const tests = PrinterManager.getDetectionTests();

  grid.innerHTML = tests.map(t => `
    <div class="detect-test" id="dt-${t.id}">
      <span class="detect-test__status" id="ds-${t.id}">⏳</span>
      <div class="detect-test__body">
        <div class="detect-test__name">${t.label}</div>
        <div class="detect-test__desc">${t.desc}</div>
        <div class="detect-test__check" id="dc-${t.id}" style="display:none">
          <label class="check"><input type="checkbox" id="dx-${t.id}" /> Printed correctly on paper</label>
        </div>
      </div>
    </div>`).join('');

  for (const t of tests) {
    $(`#ds-${t.id}`).textContent = '🔄';
    try {
      const r = await printer.runDetectionTest(t.id);
      $(`#ds-${t.id}`).textContent = '✅';
      $(`#dc-${t.id}`).style.display = 'block';
      $(`#dt-${t.id}`).classList.add('pass');
      log('success', `Sent: ${t.label} [${r.uid}]`);
    } catch (e) {
      $(`#ds-${t.id}`).textContent = '❌';
      $(`#dt-${t.id}`).classList.add('fail');
      log('error', `${t.label}: ${e.message}`);
    }
    await sleep(2000);
  }

  save.style.display = 'block';
  btn.disabled = false;
  btn.textContent = '🔄 Run Again';
});

$('#btn-detect-save').addEventListener('click', () => {
  const tests = PrinterManager.getDetectionTests();
  const passed = tests.filter(t => {
    const c = $(`#dx-${t.id}`);
    return c && c.checked;
  }).map(t => t.id);

  if (!passed.length) { toast('Check at least one test!', 'error'); return; }

  const priority = ['escpos_full', 'escpos_size', 'escpos_fmt', 'escpos_basic', 'tspl', 'raw'];
  let best = 'raw';
  for (const p of priority) { if (passed.includes(p)) { best = p; break; } }

  const ov = {};
  if (best === 'tspl') { ov.autoCut = false; ov.paperWidth = 100; }

  const result = printer.saveDetectionResult(best, ov);
  loadConfigToForm();
  updateConnUI(true);
  toast(`Detected: ${result.mode.toUpperCase()} (via ${best})`, 'success');
  log('success', `Detection saved: ${result.mode} via ${best}`);
  $('#detect-save').style.display = 'none';
});

/* ═══════════════════════════════════════════════════════════════════════
   INVOICE BUILDER
   ═══════════════════════════════════════════════════════════════════════ */
let invoiceItems = [
  { name: 'Cincin Emas 24K', qty: 1, weight: 5.0, karat: '24K', ppg: 1100000, disc: 0 },
];

function renderItems() {
  const el = $('#inv-items');
  el.innerHTML = invoiceItems.map((it, i) => `
    <div class="invoice-item">
      <div class="field" style="flex:2"><label>Name</label><input type="text" value="${it.name}" data-idx="${i}" data-key="name" /></div>
      <div class="field" style="flex:.6"><label>Qty</label><input type="number" value="${it.qty}" data-idx="${i}" data-key="qty" min="1" /></div>
      <div class="field" style="flex:.8"><label>Weight(g)</label><input type="number" value="${it.weight}" data-idx="${i}" data-key="weight" step="0.01" /></div>
      <div class="field" style="flex:.6"><label>Karat</label><input type="text" value="${it.karat}" data-idx="${i}" data-key="karat" /></div>
      <div class="field" style="flex:1"><label>Rp/gram</label><input type="number" value="${it.ppg}" data-idx="${i}" data-key="ppg" /></div>
      <div class="field" style="flex:.8"><label>Discount</label><input type="number" value="${it.disc}" data-idx="${i}" data-key="disc" /></div>
      <button class="btn-remove" data-remove="${i}">✕</button>
    </div>`).join('');

  // Bind inputs
  el.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = parseInt(inp.dataset.idx);
      const key = inp.dataset.key;
      const v = inp.type === 'number' ? parseFloat(inp.value) || 0 : inp.value;
      invoiceItems[idx][key] = v;
      updatePreview();
    });
  });

  // Bind remove
  el.querySelectorAll('.btn-remove').forEach(b => {
    b.addEventListener('click', () => {
      invoiceItems.splice(parseInt(b.dataset.remove), 1);
      renderItems();
    });
  });

  updatePreview();
}

$('#btn-add-item').addEventListener('click', () => {
  invoiceItems.push({ name: 'New Item', qty: 1, weight: 1.0, karat: '24K', ppg: 1000000, disc: 0 });
  renderItems();
});

function fmtCur(n) { return 'Rp ' + Number(n).toLocaleString('id-ID'); }

function updatePreview() {
  const store = $('#inv-store').value || 'TOKO EMAS';
  const addr = $('#inv-addr').value;
  const phone = $('#inv-phone').value;
  const inv = $('#inv-number').value || PrinterManager.generateInvoiceNumber();
  const cashier = $('#inv-cashier').value;
  const customer = $('#inv-customer').value;
  const footer = $('#inv-footer').value;
  const disc = parseFloat($('#inv-discount').value) || 0;
  const tax = parseFloat($('#inv-tax').value) || 0;
  const paid = parseFloat($('#inv-paid').value) || 0;
  const method = $('#inv-payment').value;
  const methods = { cash: 'Tunai', debit: 'Kartu Debit', credit: 'Kartu Kredit', transfer: 'Transfer Bank' };

  let grand = 0;
  let itemsHtml = '';
  for (const it of invoiceItems) {
    const sub = it.weight * it.ppg * it.qty - it.disc;
    grand += sub;
    itemsHtml += `${it.name}\n`;
    itemsHtml += `  ${it.qty}x ${it.weight}g ${it.karat} @${fmtCur(it.ppg)}/g\n`;
    itemsHtml += `${' '.repeat(20)}${fmtCur(sub + it.disc)}\n`;
    if (it.disc > 0) itemsHtml += `  Diskon${' '.repeat(14)}-${fmtCur(it.disc)}\n`;
    itemsHtml += '\n';
  }

  if (disc > 0) grand -= disc;
  let taxAmt = 0;
  if (tax > 0) { taxAmt = Math.round(grand * tax / 100); grand += taxAmt; }
  const change = Math.max(0, paid - grand);

  const sep = '─'.repeat(32);
  const dsep = '═'.repeat(32);

  const paper = $('#receipt-paper');
  paper.innerHTML = '';
  paper.innerHTML = `<div class="r-store">${store}</div>` +
    (addr ? `<div class="r-sub">${addr}</div>` : '') +
    (phone ? `<div class="r-sub">Telp: ${phone}</div>` : '') +
    `\n<span class="r-sep">${dsep}</span>\n` +
    `No. Invoice     ${inv}\n` +
    `Tanggal         ${PrinterManager.formatDate()}\n` +
    (cashier ? `Kasir           ${cashier}\n` : '') +
    (customer ? `Pelanggan       ${customer}\n` : '') +
    `<span class="r-sep">${dsep}</span>\n` +
    itemsHtml +
    `<span class="r-sep">${sep}</span>\n` +
    `Subtotal        ${fmtCur(grand - taxAmt + disc)}\n` +
    (disc > 0 ? `Diskon          -${fmtCur(disc)}\n` : '') +
    (tax > 0 ? `PPN (${tax}%)      ${fmtCur(taxAmt)}\n` : '') +
    `<span class="r-sep">${dsep}</span>\n` +
    `<span class="r-total">TOTAL           ${fmtCur(grand)}</span>\n` +
    `<span class="r-sep">${sep}</span>\n` +
    `Pembayaran      ${methods[method] || method}\n` +
    (method === 'cash' && paid ? `Dibayar         ${fmtCur(paid)}\nKembali         ${fmtCur(change)}\n` : '') +
    `<div class="r-footer">${footer}\nBarang yang sudah dibeli tidak dapat\ndikembalikan / ditukar</div>`;
}

// Bind preview updates
['inv-store', 'inv-addr', 'inv-phone', 'inv-number', 'inv-cashier', 'inv-customer',
 'inv-footer', 'inv-discount', 'inv-tax', 'inv-paid', 'inv-payment'].forEach(id => {
  $(`#${id}`).addEventListener('input', updatePreview);
  $(`#${id}`).addEventListener('change', updatePreview);
});

$('#btn-print-receipt').addEventListener('click', async () => {
  const btn = $('#btn-print-receipt');
  btn.disabled = true; btn.textContent = '⏳ Printing...';
  try {
    // Apply store settings from form
    printer.updateConfig({
      storeName: $('#inv-store').value,
      storeAddress: $('#inv-addr').value,
      storePhone: $('#inv-phone').value,
      footerText: $('#inv-footer').value,
    }, false);

    await printer.printReceipt({
      invoiceNumber: $('#inv-number').value || undefined,
      date: new Date(),
      cashier: $('#inv-cashier').value,
      customer: $('#inv-customer').value,
      items: invoiceItems.map(it => ({
        name: it.name, qty: it.qty, weight: it.weight,
        karat: it.karat, pricePerGram: it.ppg, discount: it.disc,
      })),
      tax: parseFloat($('#inv-tax').value) || 0,
      discount: parseFloat($('#inv-discount').value) || 0,
      paymentMethod: $('#inv-payment').value,
      amountPaid: parseFloat($('#inv-paid').value) || 0,
    }, { copies: parseInt($('#inv-copies').value) || 1 });
  } catch (e) { toast(e.message, 'error'); }
  finally { btn.disabled = !printer.isConnected; btn.textContent = '🖨️ Print Receipt'; }
});

renderItems();

/* ═══════════════════════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════════════════════ */
function loadConfigToForm() {
  const c = printer.config;
  $('#cfg-mode').value = c.commandMode || 'auto';
  $('#cfg-paper').value = String(c.paperWidth);
  $('#cfg-autocut').checked = c.autoCut;
  $('#cfg-drawer').checked = c.openDrawerOnPrint;
  $('#cfg-pin').value = String(c.cashDrawerPin);
  $('#cfg-lw').value = String(c.labelWidth || 100);
  $('#cfg-lh').value = String(c.labelHeight || 150);
  $('#cfg-density').value = String(c.labelDensity || 8);
  $('#cfg-chunk').value = String(c.chunkSize);
  $('#cfg-delay').value = String(c.chunkDelay);
  $('#cfg-reconnect').checked = c.autoReconnect;
  $('#cfg-debug').checked = c.debug;
  $('#cfg-api').value = c.apiEndpoint || '';
}

function collectConfig() {
  printer.updateConfig({
    commandMode: $('#cfg-mode').value,
    paperWidth: parseInt($('#cfg-paper').value),
    autoCut: $('#cfg-autocut').checked,
    openDrawerOnPrint: $('#cfg-drawer').checked,
    cashDrawerPin: parseInt($('#cfg-pin').value),
    labelWidth: parseInt($('#cfg-lw').value) || 100,
    labelHeight: parseInt($('#cfg-lh').value) || 150,
    labelDensity: parseInt($('#cfg-density').value) || 8,
    chunkSize: parseInt($('#cfg-chunk').value) || 80,
    chunkDelay: parseInt($('#cfg-delay').value) || 40,
    autoReconnect: $('#cfg-reconnect').checked,
    debug: $('#cfg-debug').checked,
    apiEndpoint: $('#cfg-api').value || null,
  }, false);
}

$('#btn-save-cfg').addEventListener('click', () => {
  collectConfig();
  printer.saveConfig();
  toast('Settings saved!', 'success');
});

$('#btn-reset-cfg').addEventListener('click', () => {
  if (!confirm('Reset all settings to defaults?')) return;
  printer.resetConfig();
  loadConfigToForm();
  toast('Reset to defaults', 'info');
});

loadConfigToForm();

/* ═══════════════════════════════════════════════════════════════════════
   DEVICES
   ═══════════════════════════════════════════════════════════════════════ */
function renderDevices() {
  const profiles = printer.getDeviceProfiles();
  const keys = Object.keys(profiles);
  const list = $('#devices-list');
  const empty = $('#devices-empty');

  if (!keys.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = keys.map(id => {
    const p = profiles[id];
    const active = printer.deviceId === id;
    const dt = p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '?';
    return `
      <div class="device-card ${active ? 'active' : ''}">
        <div class="device-card__info">
          <span class="device-card__name">${p.deviceName || 'Unknown'}</span>
          ${active ? '<span class="badge badge--active">CONNECTED</span>' : ''}
          <span class="badge badge--${p.commandMode === 'tspl' ? 'tspl' : 'escpos'}">${(p.commandMode || '?').toUpperCase()}</span>
          <span class="device-card__meta">${p.paperWidth || '?'}mm · chunk ${p.chunkSize || '?'}B · ${p.detectedVia ? 'via ' + p.detectedVia : ''} · ${dt}</span>
        </div>
        <button class="btn btn--sm btn--red" data-del-device="${id}">🗑️</button>
      </div>`;
  }).join('');

  list.querySelectorAll('[data-del-device]').forEach(b => {
    b.addEventListener('click', () => {
      if (!confirm('Delete this device profile?')) return;
      printer.deleteDeviceProfile(b.dataset.delDevice);
      renderDevices();
      toast('Device profile deleted', 'info');
    });
  });
}
renderDevices();

/* ═══════════════════════════════════════════════════════════════════════
   TOOLS
   ═══════════════════════════════════════════════════════════════════════ */
$('#btn-test-print').addEventListener('click', async () => {
  const b = $('#btn-test-print');
  b.disabled = true; b.textContent = '⏳...';
  try { collectConfig(); await printer.printTest(); }
  catch (e) { toast(e.message, 'error'); }
  finally { b.disabled = !printer.isConnected; b.textContent = 'Print Test Page'; }
});

$('#btn-print-text').addEventListener('click', async () => {
  const text = $('#tool-text').value;
  if (!text) { toast('Enter some text first', 'error'); return; }
  try {
    await printer.printText(text, {
      align: $('#tool-align').value,
      bold: $('#tool-bold').checked,
      doubleSize: $('#tool-big').checked,
    });
  } catch (e) { toast(e.message, 'error'); }
});

$('#btn-open-drawer').addEventListener('click', async () => {
  try { await printer.openCashDrawer(); toast('Drawer command sent', 'success'); }
  catch (e) { toast(e.message, 'error'); }
});

$('#btn-send-raw').addEventListener('click', async () => {
  const hex = $('#tool-raw').value.trim();
  if (!hex) { toast('Enter hex bytes', 'error'); return; }
  try {
    const bytes = hex.split(/[\s,]+/).map(h => parseInt(h, 16)).filter(n => !isNaN(n));
    await printer.sendRaw(new Uint8Array(bytes));
    toast(`Sent ${bytes.length} bytes`, 'success');
    log('info', `Raw: sent ${bytes.length} bytes`);
  } catch (e) { toast(e.message, 'error'); }
});

$('#btn-diag').addEventListener('click', () => {
  const d = printer.getDiagnostics();
  $('#diag-output').textContent = JSON.stringify(d, null, 2);
  log('info', 'Diagnostics refreshed');
});

$('#btn-clear-log').addEventListener('click', () => {
  logs.length = 0;
  $('#event-log').innerHTML = '';
});

/* ═══════════════════════════════════════════════════════════════════════
   COPY BUTTONS
   ═══════════════════════════════════════════════════════════════════════ */
$$('.copy-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const text = btn.dataset.copy || btn.previousElementSibling?.textContent || '';
    try {
      await navigator.clipboard.writeText(text.replace(/\\n/g, '\n'));
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
    } catch { /* fallback */ }
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════ */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(type, msg) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  logs.unshift({ type, msg, ts });
  if (logs.length > 100) logs.pop();

  const el = $('#event-log');
  if (el) {
    el.innerHTML = logs.map(l =>
      `<div class="event-log__entry event-log--${l.type}"><span class="event-log__time">${l.ts}</span><span>${icons[l.type] || ''} ${l.msg}</span></div>`
    ).join('');
  }
}

let toastTimer;
function toast(msg, type = 'info') {
  let el = $('.toast');
  if (el) el.remove();
  el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3000);
}

// Browser support check
if (!PrinterManager.isSupported()) {
  toast('Web Bluetooth not supported in this browser. Use Chrome or Edge.', 'error');
}

// Expose for console debugging
window.printer = printer;
window.PrinterManager = PrinterManager;

log('info', 'ble-pos-printer demo loaded. Printer instance available as window.printer');
