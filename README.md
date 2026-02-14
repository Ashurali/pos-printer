# 💎 GoldPOS — Bluetooth Thermal Printer POS for Gold Shops

A complete Point of Sale module for Indonesian gold shops (toko emas) with Bluetooth thermal printer support, cash drawer control, and framework-agnostic JavaScript.

## Features

- **Web Bluetooth API** — direct browser-to-printer connection, no drivers needed
- **ESC/POS commands** — full thermal printer control (bold, sizes, alignment, cut, beep)
- **Gold shop receipts** — item name, weight (gram), karat, IDR currency formatting
- **Cash drawer kick** — open cash drawer via printer (Pin 2 / Pin 5)
- **Auto-reconnect** — reconnects automatically if Bluetooth drops
- **58mm & 80mm paper** — configurable column width
- **Multiple copies** — print 1-N copies per transaction
- **Event system** — subscribe to connected, disconnected, printing, error events
- **Framework-agnostic** — works with Rails, React, Vue, Angular, or vanilla JS
- **localStorage config** — remembers last paired printer
- **Production-ready** — error handling, chunked writes, input validation

---

## Quick Start

### 1. Standalone (No Framework)

Open `public/demo.html` in Chrome/Edge. That's it.

```html
<script src="lib/assets/javascripts/printer-manager.js"></script>
<script>
  const printer = new PrinterManager({ paperWidth: '80mm' });

  document.getElementById('connect').addEventListener('click', async () => {
    const info = await printer.connect();
    console.log('Connected:', info.name);
  });

  document.getElementById('print').addEventListener('click', async () => {
    await printer.printReceipt({
      store: { name: 'TOKO EMAS MULIA', address: 'Jl. Kemang No. 10', phone: '021-555' },
      invoiceNo: 'INV-260214-0001',
      cashierName: 'Sari',
      items: [
        { name: 'Cincin Emas', weight: 5.0, karat: '24K', price: 5500000, qty: 1 },
      ],
      subtotal: 5500000,
      total: 5500000,
      paid: 6000000,
      change: 500000,
      paymentMethod: 'cash',
    });
  });
</script>
```

### 2. Rails Integration

```bash
# Copy JS files to your Rails asset pipeline
cp lib/assets/javascripts/printer-manager.js app/javascript/
cp lib/assets/javascripts/printer-setup.js   app/javascript/

# Run migrations
rails db:migrate

# Add routes (see config/routes.rb)
# Add controllers, models, views from this repo
```

---

## Project Structure

```
pos-gold-shop/
├── lib/assets/javascripts/
│   ├── printer-manager.js    # Core Bluetooth printer class
│   └── printer-setup.js      # UI component for printer setup
├── app/
│   ├── models/
│   │   ├── printer_setting.rb
│   │   ├── sale.rb
│   │   └── sale_item.rb
│   ├── controllers/
│   │   ├── printer_settings_controller.rb
│   │   └── checkout_controller.rb
│   └── views/
│       ├── printer_settings/show.html.erb
│       └── checkout/
│           ├── new.html.erb
│           └── receipt.html.erb
├── db/migrate/
│   ├── 001_create_printer_settings.rb
│   └── 002_create_sales.rb
├── config/routes.rb
├── public/demo.html           # Standalone demo
├── examples/                  # Framework integration examples
└── README.md
```

---

## API Reference

### `PrinterManager`

#### Constructor

```javascript
const printer = new PrinterManager({
  paperWidth: '80mm',        // '58mm' | '80mm'
  chunkSize: 512,            // bytes per BLE write
  chunkDelay: 50,            // ms delay between chunks
  autoReconnect: true,       // auto-reconnect on disconnect
  maxReconnectAttempts: 3,   // max retries
  storageKey: 'goldpos_printer', // localStorage key
});
```

#### Static Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `PrinterManager.isSupported()` | `boolean` | Check Web Bluetooth availability |
| `PrinterManager.formatCurrency(amount)` | `string` | Format number as "Rp 1.000.000" |
| `PrinterManager.generateInvoiceNumber(prefix)` | `string` | Generate "INV-260214-0001" |

#### Instance Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `connect()` | `Promise<{name, id}>` | Scan + connect to Bluetooth printer |
| `disconnect()` | `Promise<void>` | Disconnect from printer |
| `reconnect()` | `Promise<void>` | Reconnect to last device |
| `printReceipt(data, copies?)` | `Promise<void>` | Print a gold shop receipt |
| `printText(text)` | `Promise<void>` | Print raw text |
| `testPrint()` | `Promise<void>` | Print diagnostic test page |
| `openCashDrawer(pin?)` | `Promise<void>` | Kick cash drawer (pin 2 or 5) |
| `loadConfig()` | `Object\|null` | Load saved config from localStorage |
| `clearConfig()` | `void` | Clear saved config |
| `setPaperWidth(width)` | `void` | Change paper width at runtime |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `isConnected` | `boolean` | Current connection status |
| `deviceName` | `string\|null` | Connected device name |
| `deviceId` | `string\|null` | Connected device ID |
| `connectionState` | `string` | 'connected' \| 'disconnected' \| 'reconnecting' |
| `columns` | `number` | Characters per line (32 or 48) |

#### Events

```javascript
printer.on('connected', (info) => { /* { name, id } */ });
printer.on('disconnected', (info) => { /* { name } */ });
printer.on('reconnecting', (data) => { /* { attempt } */ });
printer.on('reconnected', (data) => { /* { name } */ });
printer.on('printing', (data) => { /* { type, copies? } */ });
printer.on('printed', (data) => { /* { type, copies? } */ });
printer.on('cashDrawerOpened', (data) => { /* { pin } */ });
printer.on('error', (data) => { /* { type, message, error } */ });
```

#### Receipt Data Format

```javascript
{
  store: {
    name: 'TOKO EMAS MULIA',
    address: 'Jl. Pasar Baru No. 123',
    phone: '021-5551234',
    npwp: '12.345.678.9-012.000',  // optional
  },
  invoiceNo: 'INV-260214-0001',
  cashierName: 'Admin',
  items: [
    { name: 'Cincin Emas', weight: 5.25, karat: '24K', price: 5775000, qty: 1 },
    { name: 'Gelang Emas', weight: 10.0, karat: '18K', price: 7500000, qty: 2 },
  ],
  subtotal: 20775000,
  discount: 275000,     // optional
  tax: 2255000,         // optional
  total: 22755000,
  paid: 23000000,
  change: 245000,
  paymentMethod: 'cash', // 'cash' | 'debit' | 'credit' | 'transfer'
  footer: 'Terima Kasih!', // optional
}
```

---

### `PrinterSetup`

Self-contained UI widget for printer management.

```javascript
const setup = new PrinterSetup(document.getElementById('container'), {
  printerManager: existingPrinter,  // optional, creates new if omitted
  onConnected: (info) => {},
  onDisconnected: () => {},
  onConfigSaved: (config) => {},
});

setup.getPrinterManager(); // get underlying PrinterManager
setup.destroy();           // remove from DOM
```

---

## Rails Installation Guide

### Step 1: Copy files

```bash
# JavaScript (choose your pipeline)
# For importmap:
cp lib/assets/javascripts/printer-manager.js app/javascript/
cp lib/assets/javascripts/printer-setup.js   app/javascript/

# For Sprockets:
cp lib/assets/javascripts/*.js app/assets/javascripts/

# Models
cp app/models/printer_setting.rb app/models/
cp app/models/sale.rb            app/models/
cp app/models/sale_item.rb       app/models/

# Controllers
cp app/controllers/printer_settings_controller.rb app/controllers/
cp app/controllers/checkout_controller.rb          app/controllers/

# Views
cp -r app/views/printer_settings app/views/
cp -r app/views/checkout         app/views/
```

### Step 2: Migrations

```bash
cp db/migrate/*.rb db/migrate/
rails db:migrate
```

### Step 3: Routes

Add to `config/routes.rb`:

```ruby
resource :printer_settings, only: [:show, :update] do
  get :config, on: :member, defaults: { format: :json }
end

resources :checkout, only: [:new, :create] do
  member do
    get  :receipt
    post :void
  end
end
```

### Step 4: Environment Variables (optional)

```bash
# .env or config/application.yml
STORE_NAME=TOKO EMAS SEJAHTERA
STORE_ADDRESS=Jl. Pasar Baru No. 123, Jakarta
STORE_PHONE=021-5551234
STORE_NPWP=12.345.678.9-012.000
```

---

## Framework Integration Examples

### React

```jsx
import { useRef, useState, useEffect, useCallback } from 'react';

// Import the module (copy printer-manager.js to your src/)
// Or: import PrinterManager from './printer-manager';

function usePrinter(options = {}) {
  const printerRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState(null);

  useEffect(() => {
    const pm = new PrinterManager(options);
    printerRef.current = pm;

    pm.on('connected', (info) => { setIsConnected(true); setDeviceName(info.name); });
    pm.on('disconnected', () => { setIsConnected(false); setDeviceName(null); });

    return () => { pm.disconnect(); };
  }, []);

  const connect = useCallback(async () => {
    return printerRef.current?.connect();
  }, []);

  const printReceipt = useCallback(async (data, copies) => {
    return printerRef.current?.printReceipt(data, copies);
  }, []);

  const openCashDrawer = useCallback(async () => {
    return printerRef.current?.openCashDrawer();
  }, []);

  return { printer: printerRef.current, isConnected, deviceName, connect, printReceipt, openCashDrawer };
}

// Usage in component:
function POSCheckout() {
  const { isConnected, deviceName, connect, printReceipt, openCashDrawer } = usePrinter({ paperWidth: '80mm' });

  return (
    <div>
      <button onClick={connect}>
        {isConnected ? `Connected: ${deviceName}` : 'Connect Printer'}
      </button>
      <button onClick={() => printReceipt(myReceiptData)} disabled={!isConnected}>
        Print Receipt
      </button>
    </div>
  );
}
```

### Vue 3

```vue
<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const printer = ref(null);
const isConnected = ref(false);
const deviceName = ref(null);

onMounted(() => {
  printer.value = new PrinterManager({ paperWidth: '80mm' });
  printer.value.on('connected', (info) => { isConnected.value = true; deviceName.value = info.name; });
  printer.value.on('disconnected', () => { isConnected.value = false; deviceName.value = null; });
});

onUnmounted(() => { printer.value?.disconnect(); });

async function connectPrinter() { await printer.value.connect(); }
async function printReceipt(data) { await printer.value.printReceipt(data); }
async function openDrawer() { await printer.value.openCashDrawer(); }
</script>

<template>
  <button @click="connectPrinter">
    {{ isConnected ? `Connected: ${deviceName}` : 'Connect Printer' }}
  </button>
  <button @click="printReceipt(receiptData)" :disabled="!isConnected">Print</button>
  <button @click="openDrawer" :disabled="!isConnected">Open Drawer</button>
</template>
```

### Angular

```typescript
// printer.service.ts
import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

declare const PrinterManager: any;

@Injectable({ providedIn: 'root' })
export class PrinterService implements OnDestroy {
  private printer: any;
  isConnected$ = new BehaviorSubject<boolean>(false);
  deviceName$ = new BehaviorSubject<string | null>(null);

  constructor() {
    this.printer = new PrinterManager({ paperWidth: '80mm' });
    this.printer.on('connected', (info: any) => {
      this.isConnected$.next(true);
      this.deviceName$.next(info.name);
    });
    this.printer.on('disconnected', () => {
      this.isConnected$.next(false);
      this.deviceName$.next(null);
    });
  }

  async connect() { return this.printer.connect(); }
  async printReceipt(data: any, copies = 1) { return this.printer.printReceipt(data, copies); }
  async openCashDrawer() { return this.printer.openCashDrawer(); }
  async testPrint() { return this.printer.testPrint(); }

  ngOnDestroy() { this.printer?.disconnect(); }
}
```

---

## Database Schema

### printer_settings

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| id | bigint | auto | Primary key |
| device_name | string | null | Last connected device name |
| device_id | string | null | Bluetooth device ID |
| paper_width | string | '80mm' | '58mm' or '80mm' |
| auto_reconnect | boolean | true | Auto-reconnect on drop |
| chunk_size | integer | 512 | Bytes per BLE write |
| chunk_delay | integer | 50 | Delay between chunks (ms) |
| cash_drawer_pin | integer | 2 | Cash drawer pin (2 or 5) |
| meta | jsonb | {} | Additional config |
| user_id | bigint | null | Optional user FK |

### sales

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| id | bigint | auto | Primary key |
| invoice_number | string | generated | Unique invoice (INV-YYMMDD-NNNN) |
| cashier_name | string | null | Who processed the sale |
| customer_name | string | null | Optional customer info |
| customer_phone | string | null | Optional |
| payment_method | string | 'cash' | cash/debit/credit/transfer |
| subtotal | decimal(15,2) | 0 | Sum of line items |
| discount | decimal(15,2) | 0 | Discount amount |
| tax | decimal(15,2) | 0 | Tax (PPN) |
| total | decimal(15,2) | 0 | Final total |
| paid | decimal(15,2) | 0 | Amount paid |
| change | decimal(15,2) | 0 | Change returned |
| status | string | 'completed' | completed/voided/refunded |
| notes | text | null | Optional notes |

### sale_items

| Column | Type | Description |
|--------|------|-------------|
| id | bigint | Primary key |
| sale_id | bigint | FK to sales |
| name | string | Item name ("Cincin Emas") |
| sku | string | Optional SKU |
| weight | decimal(10,3) | Weight in grams |
| karat | string | Gold purity (24K, 22K, 18K...) |
| price_per_gram | decimal(15,2) | Optional price/gram |
| price | decimal(15,2) | Unit price |
| quantity | integer | Default 1 |
| line_total | decimal(15,2) | price × quantity |

---

## Browser Compatibility

Web Bluetooth API requires:
- **Chrome 56+** (Windows, macOS, Linux, Android)
- **Edge 79+**
- **Opera 43+**
- **Chrome on Android**

Not supported: Safari (iOS/macOS), Firefox.

For production iOS support, consider a companion native app or Capacitor plugin.

---

## Tested Printers

Works with most ESC/POS Bluetooth thermal printers:
- EPSON TM-series (with Bluetooth adapter)
- Xprinter XP-series
- GOOJPRT PT-series
- RPP02N / RPP300
- MHT-P8001
- Generic 58mm/80mm Bluetooth printers from Tokopedia/Shopee

---

## License

MIT — free for commercial and personal use.
