# ble-pos-printer Demo

Interactive demo & documentation for [ble-pos-printer](https://www.npmjs.com/package/ble-pos-printer) — a browser-native Bluetooth thermal printer SDK.

## Live Demo

[https://ble-pos-printer-demo.vercel.app](https://ble-pos-printer-demo.vercel.app)

## Features Demonstrated

- **Printer Detection** — auto-detect ESC/POS vs TSPL command language
- **Invoice Builder** — live preview + print with full receipt formatting
- **Device Profiles** — save/load settings per Bluetooth device (localStorage)
- **Configuration** — paper width, command mode, chunk size, TSPL label settings
- **Tools** — test print, custom text, cash drawer, raw bytes, diagnostics
- **Code Examples** — copy-paste integration for ESM, CDN, React, Rails, Laravel

## Deploy to Vercel

```bash
git init && git add . && git commit -m "init"
npx vercel
```

Or connect this repo to Vercel — it auto-detects Vite.

## Local Dev

```bash
npm install
npm run dev
```

## Tech

- Vite (build)
- Pure vanilla JS (no framework)
- [ble-pos-printer](https://www.npmjs.com/package/ble-pos-printer) (the library being demoed)
- Web Bluetooth API (Chrome 56+, Edge 79+)
