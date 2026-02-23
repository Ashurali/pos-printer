/**
 * ESM import test — ensures the ESM build exports correctly.
 * This catches the globalThis.PrinterManager bug that broke Vite/Rollup.
 * Run: node --test test/esm-import.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Mock browser globals before importing
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
};
// navigator is read-only in ESM scope, use defineProperty
try { Object.defineProperty(globalThis, 'navigator', { value: { bluetooth: null }, configurable: true }); } catch {};

// Import ESM build
import PrinterManager from "../dist/printer-manager.esm.mjs";

describe("ESM import", () => {
  it("default export is a constructor function", () => {
    assert.equal(typeof PrinterManager, "function");
    assert.equal(PrinterManager.name, "PrinterManager");
  });

  it("can instantiate with new", () => {
    const pm = new PrinterManager({ storeName: "ESM TEST" });
    assert.equal(pm.config.storeName, "ESM TEST");
    assert.equal(pm.config.paperWidth, 80);
  });

  it("static methods accessible", () => {
    assert.equal(typeof PrinterManager.isSupported, "function");
    assert.equal(typeof PrinterManager.getDetectionTests, "function");
    assert.equal(typeof PrinterManager.formatCurrency, "function");
    assert.equal(typeof PrinterManager.generateInvoiceNumber, "function");
    assert.equal(typeof PrinterManager.formatDate, "function");
    assert.equal(typeof PrinterManager.DeviceStore, "function");
  });

  it("getDetectionTests works from ESM", () => {
    const tests = PrinterManager.getDetectionTests();
    assert.ok(Array.isArray(tests));
    assert.ok(tests.length >= 4);
  });

  it("DeviceStore works from ESM", () => {
    storage.clear();
    const store = new PrinterManager.DeviceStore("esm_test");
    store.save("dev-1", { deviceName: "ESM Printer" });
    assert.equal(store.get("dev-1").deviceName, "ESM Printer");
  });
});
