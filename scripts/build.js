#!/usr/bin/env node
/**
 * Build script for pos-printer.
 * Creates UMD, ESM, and minified bundles in dist/.
 * Run: node scripts/build.js
 */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "src");
const dist = path.join(__dirname, "..", "dist");

// Ensure dist/ exists
if (!fs.existsSync(dist)) fs.mkdirSync(dist, { recursive: true });

// ─── Copy UMD files (source is already UMD) ───
const files = ["printer-manager", "printer-setup"];

for (const name of files) {
  const source = fs.readFileSync(path.join(src, `${name}.js`), "utf-8");

  // UMD: copy as-is
  fs.writeFileSync(path.join(dist, `${name}.umd.js`), source);
  console.log(`✅ dist/${name}.umd.js`);

  // ESM: extract factory and re-export as default
  const esm = createESM(name, source);
  fs.writeFileSync(path.join(dist, `${name}.esm.js`), esm);
  console.log(`✅ dist/${name}.esm.js`);
}

// ─── Create ESM index ───
const indexESM = `export { default as PrinterManager } from './printer-manager.esm.js';
export { default as PrinterSetup } from './printer-setup.esm.js';
`;
fs.writeFileSync(path.join(dist, "index.esm.js"), indexESM);
console.log("✅ dist/index.esm.js");

// ─── Create TypeScript declarations ───
fs.writeFileSync(path.join(dist, "printer-manager.d.ts"), getTypesManager());
fs.writeFileSync(path.join(dist, "printer-setup.d.ts"), getTypesSetup());
console.log("✅ dist/*.d.ts");

// ─── Minify (simple — strip comments + collapse whitespace) ───
// For production minification, use: npx esbuild dist/printer-manager.umd.js --minify --outfile=dist/printer-manager.min.js
for (const name of files) {
  try {
    const esbuild = require("esbuild");
    esbuild.buildSync({
      entryPoints: [path.join(dist, `${name}.umd.js`)],
      outfile: path.join(dist, `${name}.min.js`),
      minify: true,
      bundle: false,
    });
    console.log(`✅ dist/${name}.min.js (minified)`);
  } catch {
    // esbuild not installed — skip minification
    console.log(`⏭️  dist/${name}.min.js skipped (install esbuild for minification)`);
  }
}

console.log("\n🎉 Build complete!\n");

// ─── Helpers ───

function createESM(name, umdSource) {
  // The UMD source uses: (function(root, factory) { ... })(self, function() { ... return CLASS; });
  // We extract the factory body and wrap it as ESM.
  return `// ESM build of ${name} — auto-generated from UMD source
// Import: import PrinterManager from 'pos-printer/${name}';

${umdSource}

// ESM default export — works because UMD assigns to root (globalThis)
const _export = (typeof self !== 'undefined' ? self : globalThis).${name === 'printer-manager' ? 'PrinterManager' : 'PrinterSetup'};
export default _export;
`;
}

// ─── TypeScript Declarations ───

function getTypesManager() { return `// Type declarations for pos-printer/printer-manager

export interface PrinterConfig {
  commandMode: 'auto' | 'escpos' | 'tspl';
  paperWidth: number;
  charsPerLine: number;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeNPWP: string;
  footerText: string;
  autoCut: boolean;
  labelWidth: number;
  labelHeight: number;
  labelGap: number;
  labelDensity: number;
  tsplDpi: number;
  tsplMarginX: number;
  tsplMarginY: number;
  openDrawerOnPrint: boolean;
  cashDrawerPin: number;
  copies: number;
  autoReconnect: boolean;
  reconnectInterval: number;
  reconnectMaxAttempts: number;
  chunkSize: number;
  chunkDelay: number;
  connectDelay: number;
  writeRetries: number;
  storageKey: string;
  apiEndpoint: string | null;
  apiHeaders: Record<string, string>;
  debug: boolean;
}

export interface TransactionItem {
  name: string;
  qty?: number;
  weight?: number;
  karat?: string;
  pricePerGram?: number;
  discount?: number;
}

export interface Transaction {
  invoiceNumber?: string;
  date?: Date;
  cashier?: string;
  customer?: string;
  items?: TransactionItem[];
  tax?: number;
  discount?: number;
  paymentMethod?: 'cash' | 'debit' | 'credit' | 'transfer';
  amountPaid?: number;
  cardLast4?: string;
  bankName?: string;
}

export interface ConnectResult {
  success: boolean;
  device: string | null;
  deviceId: string | null;
  service: string | null;
  characteristic: string | null;
  writeMethod: string | null;
  commandMode: string;
  hasProfile: boolean;
  alreadyConnected?: boolean;
}

export interface DeviceProfile {
  deviceId: string;
  deviceName: string;
  commandMode: string;
  paperWidth: number;
  charsPerLine: number;
  autoCut: boolean;
  chunkSize: number;
  chunkDelay: number;
  serviceUuid: string | null;
  charUuid: string | null;
  writeMethod: string | null;
  labelWidth?: number;
  labelHeight?: number;
  detectedVia?: string;
  updatedAt: string;
}

export interface DetectionTest {
  id: string;
  label: string;
  desc: string;
}

export interface Diagnostics {
  supported: boolean;
  connected: boolean;
  commandMode: string;
  configMode: string;
  deviceName: string | null;
  deviceId: string | null;
  serviceUuid: string | null;
  charUuid: string | null;
  writeMethod: string | null;
  paperWidth: number;
  charsPerLine: number;
  labelSize: string;
  autoCut: boolean;
  chunkSize: number;
  chunkDelay: number;
  charProps: { write: boolean; writeWithoutResponse: boolean } | null;
  savedProfiles: number;
}

export type PrinterEvent =
  | 'connected' | 'disconnected' | 'reconnecting' | 'reconnected'
  | 'stateChange' | 'error' | 'printStart' | 'printEnd' | 'printError'
  | 'drawerOpened' | 'configSaved' | 'profileSaved';

declare class DeviceStore {
  constructor(storageKey?: string, apiEndpoint?: string | null, apiHeaders?: Record<string, string>);
  getAll(): Record<string, DeviceProfile>;
  get(deviceId: string): DeviceProfile | null;
  save(deviceId: string, profile: Partial<DeviceProfile>): DeviceProfile;
  delete(deviceId: string): void;
  getSettings(): Partial<PrinterConfig>;
  saveSettings(settings: Partial<PrinterConfig>): void;
  syncFromApi(): Promise<Record<string, DeviceProfile> | undefined>;
}

declare class PrinterManager {
  constructor(opts?: Partial<PrinterConfig>);

  config: PrinterConfig;
  store: DeviceStore;

  // Status
  static isSupported(): boolean;
  readonly isConnected: boolean;
  readonly deviceName: string | null;
  readonly deviceId: string | null;
  readonly isTSPL: boolean;
  readonly effectiveMode: string;
  readonly state: Record<string, any>;

  // Connection
  connect(): Promise<ConnectResult>;
  disconnect(): Promise<void>;

  // Printing
  printReceipt(tx: Transaction, opts?: { copies?: number; openDrawer?: boolean }): Promise<void>;
  printTest(): Promise<void>;
  printText(text: string, opts?: { align?: 'left' | 'center' | 'right'; bold?: boolean; doubleSize?: boolean; cut?: boolean }): Promise<void>;
  sendRaw(bytes: Uint8Array | number[]): Promise<void>;

  // Cash Drawer
  openCashDrawer(pin?: number): Promise<void>;

  // Detection
  static getDetectionTests(): DetectionTest[];
  runDetectionTest(testId: string): Promise<{ testId: string; uid: string }>;
  saveDetectionResult(bestTest: string, overrides?: Partial<PrinterConfig>): { mode: string; deviceId: string | null };

  // Config
  saveConfig(): void;
  updateConfig(cfg: Partial<PrinterConfig>, save?: boolean): void;
  resetConfig(): void;

  // Device Profiles
  getDeviceProfiles(): Record<string, DeviceProfile>;
  deleteDeviceProfile(deviceId: string): void;
  getDiagnostics(): Diagnostics;

  // Events
  on(event: PrinterEvent, fn: (data: any) => void): this;
  off(event: PrinterEvent, fn: (data: any) => void): this;

  // Static utilities
  static formatCurrency(n: number): string;
  static generateInvoiceNumber(prefix?: string): string;
  static formatDate(d?: Date): string;
  static DeviceStore: typeof DeviceStore;
}

export default PrinterManager;
`; }

function getTypesSetup() { return `// Type declarations for pos-printer/printer-setup
import PrinterManager from './printer-manager';

export interface SetupOptions {
  showTestPrint?: boolean;
  showCashDrawer?: boolean;
  showAdvanced?: boolean;
  showDetectWizard?: boolean;
  showDeviceProfiles?: boolean;
  theme?: 'light' | 'dark';
  locale?: string;
  onSave?: (config: any) => void;
  onConnect?: (data: any) => void;
  onDisconnect?: (data: any) => void;
  onDetected?: (result: { mode: string; deviceId: string | null }) => void;
}

declare class PrinterSetup {
  constructor(container: string | HTMLElement, printerManager?: PrinterManager, options?: SetupOptions);
  getPrinterManager(): PrinterManager;
  destroy(): void;
}

export default PrinterSetup;
`; }
