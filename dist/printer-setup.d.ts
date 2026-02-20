// Type declarations for goldpos-printer/printer-setup
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
