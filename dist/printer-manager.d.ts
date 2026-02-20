// Type declarations for goldpos-printer/printer-manager

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
