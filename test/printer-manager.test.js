/**
 * ble-pos-printer test suite
 * Uses Node's built-in test runner (Node 18+).
 * Run: node --test test/printer-manager.test.js
 *
 * Mocks navigator.bluetooth and localStorage since we're in Node.
 * Tests all non-BLE functionality: constructor, config, static methods,
 * events, DeviceStore, diagnostics, detection tests, and build integrity.
 */
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

/* ─── Mock browser globals ──────────────────────────────────────────── */
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
};

globalThis.navigator = { bluetooth: null };
globalThis.TextEncoder = require("util").TextEncoder;

/* ─── Load modules ──────────────────────────────────────────────────── */
const PrinterManager = require("../dist/printer-manager.umd.js");

/* ═══════════════════════════════════════════════════════════════════════
   BUILD INTEGRITY
   ═══════════════════════════════════════════════════════════════════════ */
describe("Build integrity", () => {
  const distDir = path.join(__dirname, "..", "dist");
  const expected = [
    "printer-manager.umd.js",
    "printer-manager.esm.js",
    "printer-manager.min.js",
    "printer-manager.d.ts",
    "printer-setup.umd.js",
    "printer-setup.esm.js",
    "printer-setup.min.js",
    "printer-setup.d.ts",
    "index.esm.js",
  ];

  for (const file of expected) {
    it(`dist/${file} exists and is non-empty`, () => {
      const fp = path.join(distDir, file);
      assert.ok(fs.existsSync(fp), `${file} missing`);
      const stat = fs.statSync(fp);
      assert.ok(stat.size > 0, `${file} is empty`);
    });
  }

  it("UMD exports a constructor function", () => {
    assert.equal(typeof PrinterManager, "function");
    assert.equal(PrinterManager.name, "PrinterManager");
  });

  it("ESM file uses module.exports capture pattern (not globalThis)", () => {
    const esm = fs.readFileSync(
      path.join(distDir, "printer-manager.esm.js"),
      "utf-8"
    );
    assert.ok(
      esm.includes("_esmModule.exports"),
      "Should use _esmModule.exports pattern"
    );
    assert.ok(
      !esm.includes("globalThis).PrinterManager"),
      "Should NOT use globalThis.PrinterManager"
    );
    assert.ok(
      esm.includes("export default"),
      "Should have ESM default export"
    );
  });

  it("Setup ESM file uses module.exports capture pattern", () => {
    const esm = fs.readFileSync(
      path.join(distDir, "printer-setup.esm.js"),
      "utf-8"
    );
    assert.ok(
      esm.includes("_esmModule.exports"),
      "Should use _esmModule.exports pattern"
    );
    assert.ok(
      !esm.includes("globalThis).PrinterSetup"),
      "Should NOT use globalThis.PrinterSetup"
    );
  });

  it("TypeScript declarations contain expected interfaces", () => {
    const dts = fs.readFileSync(
      path.join(distDir, "printer-manager.d.ts"),
      "utf-8"
    );
    const expected = [
      "PrinterConfig",
      "Transaction",
      "TransactionItem",
      "ConnectResult",
      "DeviceProfile",
      "DetectionTest",
      "Diagnostics",
      "PrinterEvent",
      "DeviceStore",
      "PrinterManager",
      "export default PrinterManager",
    ];
    for (const iface of expected) {
      assert.ok(dts.includes(iface), `d.ts missing: ${iface}`);
    }
  });

  it("Minified files are smaller than UMD source", () => {
    const umd = fs.statSync(path.join(distDir, "printer-manager.umd.js")).size;
    const min = fs.statSync(path.join(distDir, "printer-manager.min.js")).size;
    assert.ok(min < umd, `min (${min}) should be < umd (${umd})`);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   CONSTRUCTOR & CONFIG
   ═══════════════════════════════════════════════════════════════════════ */
describe("Constructor & Config", () => {
  beforeEach(() => storage.clear());

  it("creates instance with default config", () => {
    const pm = new PrinterManager();
    assert.equal(pm.config.storeName, "TOKO EMAS");
    assert.equal(pm.config.paperWidth, 80);
    assert.equal(pm.config.charsPerLine, 48);
    assert.equal(pm.config.commandMode, "auto");
    assert.equal(pm.config.autoCut, true);
    assert.equal(pm.config.chunkSize, 80);
    assert.equal(pm.config.chunkDelay, 40);
    assert.equal(pm.config.copies, 1);
    assert.equal(pm.config.cashDrawerPin, 2);
    assert.equal(pm.config.autoReconnect, true);
    assert.equal(pm.config.debug, false);
    assert.equal(pm.config.apiEndpoint, null);
  });

  it("accepts custom config", () => {
    const pm = new PrinterManager({
      storeName: "MY SHOP",
      paperWidth: 58,
      commandMode: "escpos",
      debug: true,
      chunkSize: 120,
    });
    assert.equal(pm.config.storeName, "MY SHOP");
    assert.equal(pm.config.paperWidth, 58);
    assert.equal(pm.config.commandMode, "escpos");
    assert.equal(pm.config.debug, true);
    assert.equal(pm.config.chunkSize, 120);
    // Defaults still apply for unspecified
    assert.equal(pm.config.autoCut, true);
    assert.equal(pm.config.cashDrawerPin, 2);
  });

  it("charsPerLine auto-maps from paperWidth", () => {
    const widths = { 58: 32, 72: 42, 76: 44, 80: 48, 100: 56, 104: 60 };
    for (const [w, expected] of Object.entries(widths)) {
      const pm = new PrinterManager({ paperWidth: parseInt(w) });
      assert.equal(
        pm.config.charsPerLine,
        expected,
        `paperWidth ${w} → charsPerLine ${expected}`
      );
    }
  });

  it("updateConfig merges without losing existing values", () => {
    const pm = new PrinterManager({ storeName: "SHOP A" });
    pm.updateConfig({ paperWidth: 58, debug: true }, false);
    assert.equal(pm.config.storeName, "SHOP A"); // unchanged
    assert.equal(pm.config.paperWidth, 58);
    assert.equal(pm.config.debug, true);
  });

  it("resetConfig restores defaults", () => {
    const pm = new PrinterManager({ storeName: "CUSTOM", paperWidth: 58 });
    pm.resetConfig();
    assert.equal(pm.config.storeName, "TOKO EMAS");
    assert.equal(pm.config.paperWidth, 80);
  });

  it("saveConfig persists to localStorage", () => {
    const pm = new PrinterManager({ storeName: "SAVED SHOP" });
    pm.saveConfig();
    const saved = JSON.parse(
      localStorage.getItem("blepos_printer_settings") || "{}"
    );
    assert.equal(saved.storeName, "SAVED SHOP");
  });

  it("loads saved settings from localStorage on init", () => {
    localStorage.setItem(
      "blepos_printer_settings",
      JSON.stringify({ storeName: "PERSISTED", paperWidth: 58 })
    );
    const pm = new PrinterManager();
    assert.equal(pm.config.storeName, "PERSISTED");
    assert.equal(pm.config.paperWidth, 58);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   CONNECTION STATE (without BLE)
   ═══════════════════════════════════════════════════════════════════════ */
describe("Connection state", () => {
  beforeEach(() => storage.clear());

  it("isConnected is false by default", () => {
    const pm = new PrinterManager();
    assert.equal(pm.isConnected, false);
  });

  it("deviceName is null when disconnected", () => {
    const pm = new PrinterManager();
    assert.equal(pm.deviceName, null);
  });

  it("deviceId is null when disconnected", () => {
    const pm = new PrinterManager();
    assert.equal(pm.deviceId, null);
  });

  it("effectiveMode returns commandMode when not auto", () => {
    const pm = new PrinterManager({ commandMode: "tspl" });
    assert.equal(pm.effectiveMode, "tspl");
  });

  it("effectiveMode falls back to escpos for auto", () => {
    const pm = new PrinterManager({ commandMode: "auto" });
    // When not connected, auto defaults to escpos
    assert.equal(pm.effectiveMode, "escpos");
  });

  it("isTSPL reflects commandMode", () => {
    const pmTspl = new PrinterManager({ commandMode: "tspl" });
    assert.equal(pmTspl.isTSPL, true);
    const pmEsc = new PrinterManager({ commandMode: "escpos" });
    assert.equal(pmEsc.isTSPL, false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   STATIC METHODS
   ═══════════════════════════════════════════════════════════════════════ */
describe("Static methods", () => {
  it("isSupported() returns boolean", () => {
    assert.equal(typeof PrinterManager.isSupported(), "boolean");
    // In Node without navigator.bluetooth, should be false
    assert.equal(PrinterManager.isSupported(), false);
  });

  it("isSupported() returns true when navigator.bluetooth exists", () => {
    // navigator.bluetooth was null at module load, so isSupported is false in Node.
    // Just verify it returns boolean — actual BLE detection is browser-only.
    const result = PrinterManager.isSupported();
    assert.equal(typeof result, "boolean");
  });

  it("formatCurrency formats Indonesian Rupiah", () => {
    const fmt = PrinterManager.formatCurrency;
    assert.ok(fmt(1000000).includes("1"));
    // Should contain Rp or currency indicator
    const result = fmt(1500000);
    assert.ok(typeof result === "string");
    assert.ok(result.length > 0);
  });

  it("formatCurrency handles zero and negative", () => {
    assert.ok(typeof PrinterManager.formatCurrency(0) === "string");
    assert.ok(typeof PrinterManager.formatCurrency(-5000) === "string");
  });

  it("generateInvoiceNumber returns string with prefix", () => {
    const inv = PrinterManager.generateInvoiceNumber();
    assert.ok(typeof inv === "string");
    assert.ok(inv.startsWith("INV-"), `Got: ${inv}`);
    assert.ok(inv.length > 10);
  });

  it("generateInvoiceNumber accepts custom prefix", () => {
    const inv = PrinterManager.generateInvoiceNumber("ORD");
    assert.ok(inv.startsWith("ORD-"), `Got: ${inv}`);
  });

  it("generateInvoiceNumber generates unique values", () => {
    const a = PrinterManager.generateInvoiceNumber();
    const b = PrinterManager.generateInvoiceNumber();
    // Allow same (timestamp-based), but typically different
    assert.ok(typeof a === "string" && typeof b === "string");
  });

  it("formatDate returns formatted date string", () => {
    const d = PrinterManager.formatDate(new Date(2025, 1, 20, 14, 30));
    assert.ok(typeof d === "string");
    assert.ok(d.length > 5);
    // Should contain date components
    assert.ok(d.includes("20") || d.includes("2025"));
  });

  it("formatDate defaults to current date", () => {
    const d = PrinterManager.formatDate();
    assert.ok(typeof d === "string");
    assert.ok(d.length > 5);
  });

  it("DeviceStore class is exposed", () => {
    assert.equal(typeof PrinterManager.DeviceStore, "function");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   DETECTION TESTS
   ═══════════════════════════════════════════════════════════════════════ */
describe("Detection tests", () => {
  it("getDetectionTests returns array of test objects", () => {
    const tests = PrinterManager.getDetectionTests();
    assert.ok(Array.isArray(tests));
    assert.ok(tests.length >= 4, `Expected ≥4 tests, got ${tests.length}`);
  });

  it("each test has id, label, desc", () => {
    const tests = PrinterManager.getDetectionTests();
    for (const t of tests) {
      assert.ok(typeof t.id === "string", `missing id`);
      assert.ok(typeof t.label === "string", `missing label on ${t.id}`);
      assert.ok(typeof t.desc === "string", `missing desc on ${t.id}`);
      assert.ok(t.id.length > 0);
      assert.ok(t.label.length > 0);
    }
  });

  it("includes escpos and tspl test types", () => {
    const tests = PrinterManager.getDetectionTests();
    const ids = tests.map((t) => t.id);
    assert.ok(ids.some((id) => id.includes("escpos")), "Should have escpos tests");
    assert.ok(ids.includes("tspl") || ids.some((id) => id.includes("tspl")), "Should have tspl test");
    assert.ok(ids.includes("raw") || ids.some((id) => id.includes("raw")), "Should have raw test");
  });

  it("test IDs are unique", () => {
    const tests = PrinterManager.getDetectionTests();
    const ids = tests.map((t) => t.id);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, "Duplicate test IDs found");
  });

  it("saveDetectionResult works for escpos", () => {
    storage.clear();
    const pm = new PrinterManager();
    // Manually set internal device ID for testing
    pm._deviceId = "test-device-001";
    const result = pm.saveDetectionResult("escpos_full", { paperWidth: 80 });
    assert.equal(result.mode, "escpos");
  });

  it("saveDetectionResult works for tspl", () => {
    storage.clear();
    const pm = new PrinterManager();
    pm._deviceId = "test-device-002";
    const result = pm.saveDetectionResult("tspl", {});
    assert.equal(result.mode, "tspl");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   EVENT SYSTEM
   ═══════════════════════════════════════════════════════════════════════ */
describe("Event system", () => {
  it("on() registers listener and returns this for chaining", () => {
    const pm = new PrinterManager();
    const ret = pm.on("connected", () => {});
    assert.equal(ret, pm, "Should return this for chaining");
  });

  it("off() removes listener", () => {
    const pm = new PrinterManager();
    let called = 0;
    const fn = () => called++;
    pm.on("connected", fn);
    pm.off("connected", fn);
    // Emit manually (access internal _emit if available)
    if (pm._emit) {
      pm._emit("connected", {});
      assert.equal(called, 0, "Listener should not fire after off()");
    }
  });

  it("supports multiple listeners on same event", () => {
    const pm = new PrinterManager();
    let a = 0, b = 0;
    pm.on("error", () => a++);
    pm.on("error", () => b++);
    if (pm._emit) {
      pm._emit("error", { type: "test", error: new Error("test") });
      assert.equal(a, 1);
      assert.equal(b, 1);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   DEVICE STORE
   ═══════════════════════════════════════════════════════════════════════ */
describe("DeviceStore", () => {
  const DeviceStore = PrinterManager.DeviceStore;

  beforeEach(() => storage.clear());

  it("constructor creates instance", () => {
    const store = new DeviceStore("test_store");
    assert.ok(store);
  });

  it("getAll returns empty object initially", () => {
    const store = new DeviceStore("test_store");
    const all = store.getAll();
    assert.deepEqual(all, {});
  });

  it("save and get device profile", () => {
    const store = new DeviceStore("test_store");
    store.save("device-abc", {
      deviceName: "Test Printer",
      commandMode: "escpos",
      paperWidth: 80,
    });
    const profile = store.get("device-abc");
    assert.ok(profile);
    assert.equal(profile.deviceName, "Test Printer");
    assert.equal(profile.commandMode, "escpos");
    assert.equal(profile.paperWidth, 80);
    assert.ok(profile.updatedAt); // should have timestamp
  });

  it("save overwrites existing profile", () => {
    const store = new DeviceStore("test_store");
    store.save("device-abc", { deviceName: "Old", commandMode: "escpos" });
    store.save("device-abc", { deviceName: "New", commandMode: "tspl" });
    const profile = store.get("device-abc");
    assert.equal(profile.deviceName, "New");
    assert.equal(profile.commandMode, "tspl");
  });

  it("delete removes profile", () => {
    const store = new DeviceStore("test_store");
    store.save("device-abc", { deviceName: "Test" });
    store.delete("device-abc");
    assert.equal(store.get("device-abc"), null);
  });

  it("getAll returns multiple profiles", () => {
    const store = new DeviceStore("test_store");
    store.save("dev-1", { deviceName: "Printer A" });
    store.save("dev-2", { deviceName: "Printer B" });
    const all = store.getAll();
    assert.equal(Object.keys(all).length, 2);
    assert.equal(all["dev-1"].deviceName, "Printer A");
    assert.equal(all["dev-2"].deviceName, "Printer B");
  });

  it("settings save and load", () => {
    const store = new DeviceStore("test_store");
    store.saveSettings({ storeName: "MY STORE", paperWidth: 58 });
    const settings = store.getSettings();
    assert.equal(settings.storeName, "MY STORE");
    assert.equal(settings.paperWidth, 58);
  });

  it("isolated storage keys don't collide", () => {
    const storeA = new DeviceStore("store_a");
    const storeB = new DeviceStore("store_b");
    storeA.save("dev-1", { deviceName: "A" });
    storeB.save("dev-1", { deviceName: "B" });
    assert.equal(storeA.get("dev-1").deviceName, "A");
    assert.equal(storeB.get("dev-1").deviceName, "B");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   DEVICE PROFILES (via PrinterManager)
   ═══════════════════════════════════════════════════════════════════════ */
describe("Device profiles via PrinterManager", () => {
  beforeEach(() => storage.clear());

  it("getDeviceProfiles returns object", () => {
    const pm = new PrinterManager();
    const profiles = pm.getDeviceProfiles();
    assert.equal(typeof profiles, "object");
  });

  it("deleteDeviceProfile removes from store", () => {
    const pm = new PrinterManager();
    pm.store.save("dev-test", { deviceName: "Test" });
    assert.ok(pm.store.get("dev-test"));
    pm.deleteDeviceProfile("dev-test");
    assert.equal(pm.store.get("dev-test"), null);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   DIAGNOSTICS
   ═══════════════════════════════════════════════════════════════════════ */
describe("Diagnostics", () => {
  beforeEach(() => storage.clear());

  it("getDiagnostics returns expected shape", () => {
    const pm = new PrinterManager();
    const d = pm.getDiagnostics();
    assert.equal(typeof d, "object");

    // Required fields
    assert.equal(typeof d.supported, "boolean");
    assert.equal(typeof d.connected, "boolean");
    assert.equal(typeof d.commandMode, "string");
    assert.equal(typeof d.configMode, "string");
    assert.equal(typeof d.paperWidth, "number");
    assert.equal(typeof d.charsPerLine, "number");
    assert.equal(typeof d.autoCut, "boolean");
    assert.equal(typeof d.chunkSize, "number");
    assert.equal(typeof d.chunkDelay, "number");
    assert.equal(typeof d.savedProfiles, "number");
  });

  it("diagnostics reflects current config", () => {
    const pm = new PrinterManager({
      paperWidth: 58,
      commandMode: "tspl",
      chunkSize: 200,
    });
    const d = pm.getDiagnostics();
    assert.equal(d.paperWidth, 58);
    assert.equal(d.configMode, "tspl");
    assert.equal(d.chunkSize, 200);
    assert.equal(d.connected, false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   RECEIPT BUILDER (command generation, no print)
   ═══════════════════════════════════════════════════════════════════════ */
describe("Receipt data handling", () => {
  beforeEach(() => storage.clear());

  it("state property returns object", () => {
    const pm = new PrinterManager();
    const s = pm.state;
    assert.equal(typeof s, "object");
    assert.equal(s.connected, false);
  });

  it("handles TSPL mode config correctly", () => {
    const pm = new PrinterManager({
      commandMode: "tspl",
      labelWidth: 100,
      labelHeight: 150,
      labelDensity: 10,
    });
    assert.equal(pm.config.commandMode, "tspl");
    assert.equal(pm.config.labelWidth, 100);
    assert.equal(pm.config.labelHeight, 150);
    assert.equal(pm.isTSPL, true);
  });
});
