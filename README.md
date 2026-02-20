# ble-pos-printer

Backend-agnostic **Bluetooth thermal/label printer manager** for POS systems.

Connect to BLE receipt/label printers directly from the browser using Web Bluetooth, with zero backend dependencies.

## Features

- 🖨️ **Dual command mode** — ESC/POS (receipt printers) + TSPL (label printers)
- 🧪 **Auto-detect wizard** — tests which command language the printer supports
- 📱 **Device profiles** — save settings per printer (by Bluetooth device ID)
- 🔄 **Backend-agnostic persistence** — localStorage by default, optional REST API sync
- 📡 **BLE chunked writes** — with retry logic, method fallback, and busy lock
- 🎨 **Drop-in Setup UI** — pre-built config panel with detection wizard
- 📦 **Zero dependencies** — works with any framework or vanilla JS

## Install

```bash
npm install ble-pos-printer
```

Or via CDN:

```html
<script src="https://unpkg.com/ble-pos-printer/dist/printer-manager.umd.js"></script>
<script src="https://unpkg.com/ble-pos-printer/dist/printer-setup.umd.js"></script>
```

## Quick Start

### ESM (Vite, webpack, Rollup)

```javascript
import PrinterManager from 'ble-pos-printer';

const printer = new PrinterManager({
  storeName: 'TOKO EMAS JAYA',
  paperWidth: 80,
  debug: true,
});

await printer.connect();
await printer.printTest();
```

### Script Tag (Vanilla, Rails, Laravel Blade)

```html
<script src="https://unpkg.com/ble-pos-printer/dist/printer-manager.umd.js"></script>
<script>
  const printer = new PrinterManager({ storeName: 'MY SHOP' });
  document.getElementById('btn').onclick = async () => {
    await printer.connect();
    await printer.printTest();
  };
</script>
```

## Setup UI

Drop-in configuration panel with detection wizard, device profiles, and all settings:

```html
<div id="printer-setup"></div>

<script src="https://unpkg.com/ble-pos-printer/dist/printer-manager.umd.js"></script>
<script src="https://unpkg.com/ble-pos-printer/dist/printer-setup.umd.js"></script>
<script>
  const setup = new PrinterSetup('#printer-setup', null, {
    theme: 'dark',
    onSave: (config) => console.log('Saved:', config),
    onDetected: (result) => console.log('Detected:', result.mode),
  });

  // Access the PrinterManager instance
  const printer = setup.getPrinterManager();
</script>
```

## Print a Receipt

```javascript
await printer.printReceipt({
  invoiceNumber: 'INV-250220-0001',
  date: new Date(),
  cashier: 'Admin',
  customer: 'John Doe',
  items: [
    {
      name: 'Cincin Emas 24K',
      qty: 1,
      weight: 5.0,
      karat: '24K',
      pricePerGram: 1100000,
      discount: 0,
    },
    {
      name: 'Gelang Emas 22K',
      qty: 1,
      weight: 12.5,
      karat: '22K',
      pricePerGram: 950000,
      discount: 50000,
    },
  ],
  tax: 0,
  discount: 0,
  paymentMethod: 'cash',
  amountPaid: 18000000,
});
```

## Auto-Detection Wizard

Test which command language the printer supports:

```javascript
// Programmatic detection (without Setup UI)
const tests = PrinterManager.getDetectionTests();
// → [{id: "raw", label: "Raw Text", desc: "..."}, {id: "escpos_basic", ...}, ...]

// Run each test
for (const test of tests) {
  await printer.runDetectionTest(test.id);
  // Check physical printout, then save the best result:
}

// Save result (persists to device profile)
printer.saveDetectionResult('escpos_full', { paperWidth: 80 });
```

## Device Profiles & Backend Sync

### localStorage Only (default)

```javascript
const printer = new PrinterManager();
// Profiles auto-save to localStorage keyed by BLE device ID.
// When reconnecting, settings load automatically.
```

### With REST API Sync

```javascript
const printer = new PrinterManager({
  apiEndpoint: '/api/printer_profiles',
  apiHeaders: {
    'X-CSRF-Token': document.querySelector('meta[name=csrf-token]').content,
  },
});
```

**REST API contract** (implement in any backend):

| Method | Endpoint                        | Description          |
|--------|---------------------------------|----------------------|
| GET    | `/api/printer_profiles`         | List all profiles    |
| PUT    | `/api/printer_profiles/:id`     | Create/update profile|
| DELETE | `/api/printer_profiles/:id`     | Delete profile       |

**Profile payload:**

```json
{
  "deviceId": "abc123...",
  "deviceName": "XP-D4601B",
  "commandMode": "escpos",
  "paperWidth": 80,
  "charsPerLine": 48,
  "autoCut": true,
  "chunkSize": 80,
  "chunkDelay": 40,
  "writeMethod": "writeValue",
  "updatedAt": "2025-02-20T14:30:00Z"
}
```

## Framework Integration

### Ruby on Rails

**With Importmaps (Rails 7+):**

```ruby
# config/importmap.rb
pin "ble-pos-printer", to: "https://unpkg.com/ble-pos-printer/dist/printer-manager.umd.js"
```

```javascript
// app/javascript/controllers/printer_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["setup"]

  connect() {
    this.printer = new PrinterManager({
      apiEndpoint: '/api/printer_profiles',
      apiHeaders: {
        'X-CSRF-Token': document.querySelector('meta[name=csrf-token]').content,
      },
    });
  }

  async print() {
    if (!this.printer.isConnected) await this.printer.connect();
    await this.printer.printReceipt(this.transactionData);
  }
}
```

**With Sprockets (asset pipeline):**

```ruby
# Copy printer-manager.js to app/assets/javascripts/
# In application.js:
//= require printer-manager
//= require printer-setup
```

**Rails API Controller:**

```ruby
# app/controllers/api/printer_profiles_controller.rb
class Api::PrinterProfilesController < ApplicationController
  def index
    profiles = current_user.printer_profiles.index_by(&:device_id)
    render json: profiles
  end

  def update
    profile = current_user.printer_profiles.find_or_initialize_by(device_id: params[:id])
    profile.assign_attributes(profile_params)
    profile.save!
    render json: profile
  end

  def destroy
    current_user.printer_profiles.find_by(device_id: params[:id])&.destroy
    head :no_content
  end

  private

  def profile_params
    params.permit(:device_name, :command_mode, :paper_width, :chars_per_line,
                  :auto_cut, :chunk_size, :chunk_delay, :write_method,
                  :service_uuid, :char_uuid, :label_width, :label_height,
                  :detected_via, :updated_at)
  end
end
```

```ruby
# db/migrate/xxx_create_printer_profiles.rb
class CreatePrinterProfiles < ActiveRecord::Migration[7.0]
  def change
    create_table :printer_profiles do |t|
      t.references :user, null: false, foreign_key: true
      t.string :device_id, null: false
      t.string :device_name
      t.string :command_mode, default: 'escpos'
      t.integer :paper_width, default: 80
      t.integer :chars_per_line, default: 48
      t.boolean :auto_cut, default: true
      t.integer :chunk_size, default: 80
      t.integer :chunk_delay, default: 40
      t.string :write_method
      t.string :service_uuid
      t.string :char_uuid
      t.integer :label_width
      t.integer :label_height
      t.string :detected_via
      t.timestamps
    end
    add_index :printer_profiles, [:user_id, :device_id], unique: true
  end
end
```

### Laravel

**With Vite:**

```bash
npm install ble-pos-printer
```

```javascript
// resources/js/printer.js
import PrinterManager from 'ble-pos-printer';

window.printer = new PrinterManager({
  apiEndpoint: '/api/printer-profiles',
  apiHeaders: {
    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content,
    'Accept': 'application/json',
  },
});
```

**Blade:**

```html
<div id="printer-setup"></div>

@vite(['resources/js/printer.js'])
<script type="module">
  import PrinterSetup from 'ble-pos-printer/setup';
  new PrinterSetup('#printer-setup', window.printer, { theme: 'dark' });
</script>
```

**Laravel Controller + Migration:**

```php
// app/Http/Controllers/Api/PrinterProfileController.php
class PrinterProfileController extends Controller
{
    public function index() {
        return auth()->user()->printerProfiles->keyBy('device_id');
    }

    public function update(Request $request, string $id) {
        $profile = auth()->user()->printerProfiles()->updateOrCreate(
            ['device_id' => $id],
            $request->only([
                'device_name', 'command_mode', 'paper_width', 'chars_per_line',
                'auto_cut', 'chunk_size', 'chunk_delay', 'write_method',
                'service_uuid', 'char_uuid', 'label_width', 'label_height',
                'detected_via',
            ])
        );
        return response()->json($profile);
    }

    public function destroy(string $id) {
        auth()->user()->printerProfiles()->where('device_id', $id)->delete();
        return response()->noContent();
    }
}
```

```php
// database/migrations/xxx_create_printer_profiles_table.php
Schema::create('printer_profiles', function (Blueprint $table) {
    $table->id();
    $table->foreignId('user_id')->constrained()->cascadeOnDelete();
    $table->string('device_id');
    $table->string('device_name')->nullable();
    $table->string('command_mode')->default('escpos');
    $table->integer('paper_width')->default(80);
    $table->integer('chars_per_line')->default(48);
    $table->boolean('auto_cut')->default(true);
    $table->integer('chunk_size')->default(80);
    $table->integer('chunk_delay')->default(40);
    $table->string('write_method')->nullable();
    $table->string('service_uuid')->nullable();
    $table->string('char_uuid')->nullable();
    $table->integer('label_width')->nullable();
    $table->integer('label_height')->nullable();
    $table->string('detected_via')->nullable();
    $table->timestamps();
    $table->unique(['user_id', 'device_id']);
});
```

### React / Next.js

```jsx
import { useEffect, useRef, useState } from 'react';
import PrinterManager from 'ble-pos-printer';

export function usePrinter(opts = {}) {
  const pmRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [deviceName, setDeviceName] = useState(null);

  useEffect(() => {
    pmRef.current = new PrinterManager(opts);
    pmRef.current.on('connected', (d) => { setConnected(true); setDeviceName(d.device); });
    pmRef.current.on('disconnected', () => { setConnected(false); setDeviceName(null); });
    return () => pmRef.current?.disconnect();
  }, []);

  return {
    printer: pmRef.current,
    connected,
    deviceName,
    connect: () => pmRef.current?.connect(),
    disconnect: () => pmRef.current?.disconnect(),
    printTest: () => pmRef.current?.printTest(),
    printReceipt: (tx) => pmRef.current?.printReceipt(tx),
  };
}
```

```jsx
function POSPage() {
  const { printer, connected, deviceName, connect, printReceipt } = usePrinter({
    storeName: 'TOKO EMAS',
    paperWidth: 80,
  });

  return (
    <div>
      <p>{connected ? `Connected: ${deviceName}` : 'Disconnected'}</p>
      <button onClick={connect}>Connect</button>
      <button onClick={() => printReceipt(myTransaction)} disabled={!connected}>
        Print Receipt
      </button>
    </div>
  );
}
```

## Supported Printers

Tested with BLE thermal printers including:

- **Xprinter** XP-D4601B, XP-365B, XP-420B
- **GOOJPRT** PT-210, MTP-II
- **Milestone** MHT-P58A/P80A
- **MUNBYN** ITPP047
- Most Chinese BLE printers with ESC/POS or TSPL firmware

**BLE Services auto-discovered:**

| UUID (short) | Type |
|---|---|
| `18f0` | Nordic UART |
| `e781` | Custom BLE |
| `4953` | ISSC / Xprinter |
| `ff00` | Generic |
| `fee7` | Tencent/WeChat |

## API Reference

### `new PrinterManager(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `commandMode` | `'auto'\|'escpos'\|'tspl'` | `'auto'` | Command language |
| `paperWidth` | `number` | `80` | Paper width in mm |
| `storeName` | `string` | `'TOKO EMAS'` | Store name for receipts |
| `autoCut` | `boolean` | `true` | Auto-cut after print (ESC/POS) |
| `chunkSize` | `number` | `80` | BLE write chunk size (bytes) |
| `chunkDelay` | `number` | `40` | Delay between chunks (ms) |
| `apiEndpoint` | `string\|null` | `null` | REST API for profile sync |
| `apiHeaders` | `object` | `{}` | Extra headers for API calls |
| `debug` | `boolean` | `false` | Console debug logging |

### Methods

| Method | Returns | Description |
|---|---|---|
| `connect()` | `Promise<ConnectResult>` | Open BLE device picker and connect |
| `disconnect()` | `Promise<void>` | Disconnect from printer |
| `printReceipt(tx)` | `Promise<void>` | Print a formatted receipt |
| `printTest()` | `Promise<void>` | Print a test page |
| `printText(text, opts)` | `Promise<void>` | Print custom text |
| `sendRaw(bytes)` | `Promise<void>` | Send raw bytes |
| `openCashDrawer()` | `Promise<void>` | Open cash drawer |
| `runDetectionTest(id)` | `Promise<{testId, uid}>` | Send one detection test |
| `saveDetectionResult(test, overrides)` | `{mode, deviceId}` | Save detected mode |
| `saveConfig()` | `void` | Persist settings |
| `getDiagnostics()` | `Diagnostics` | Connection & config details |

### Events

```javascript
printer.on('connected', (data) => {});
printer.on('disconnected', (data) => {});
printer.on('printStart', (data) => {});
printer.on('printEnd', (data) => {});
printer.on('printError', (data) => {});
printer.on('profileSaved', (data) => {});
printer.on('error', (data) => {});
```

## Browser Support

Requires **Web Bluetooth API**: Chrome 56+, Edge 79+, Opera 43+, Chrome Android.

Not supported: Firefox, Safari (as of 2025).

## License

MIT
