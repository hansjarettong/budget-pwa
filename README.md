# 💰 Budget Tracker PWA

A fast, lightweight, and offline-first personal budget tracker designed with a clean iOS-native aesthetic. It runs right in any modern web browser and can be installed directly to your iPhone or Android home screen without an app store.

---

## ✨ Features

- **🔒 100% Local & Private:** All transactions, categories, and custom limits stay on your device via browser `localStorage`. No accounts, no database, no servers, and zero tracking.
- **🛡️ Storage Durability (Automatic):** Leverages `navigator.storage.persist()` on launch to exempt budget data from automatic eviction during low disk space cleanups.
- **⚡ Offline-First PWA:** Full service worker caching (`sw.js`). Works seamlessly without internet or in airplane mode.
- **📊 Visual Spending Limits:** Real-time color-coded progress bars for each category showing budget consumption and remaining allowance.
- **⌨️ MoneyNote-Style Numpad:** Custom quick-add sheet with an integrated numpad for rapid, frictionless expense logging.
- **📅 Month-by-Month History & Quick Jump:** Easily navigate past and upcoming months with 1-tap `‹` and `›` buttons or tap the month title to open the 12-month calendar picker with year navigation and transaction indicator dots.
- **🌍 Multi-Currency Support (Default: JPY ¥):** Pre-configured with Japanese Yen (¥) and zero-decimal formatting, with support for USD ($), EUR (€), GBP (£), PHP (₱), and other international currencies.
- **☁️ Bring Your Own Cloud & Encryption:**
  - **Google Drive Sync (Serverless):** Connect your Google Drive to back up and restore across devices with zero backend servers.
  - **Military-Grade AES-GCM 256-bit Encryption:** End-to-end zero-knowledge encryption via Web Cryptography API (`crypto.subtle`) protects your backups with a personal passphrase before they ever leave your device.
  - **iCloud Drive / Dropbox Synced Folder:** 1-tap save directly into your desktop or mobile cloud synced folder.
  - **JSON & CSV Portability:** Plain and encrypted `.json` / `.enc` backups, plus CSV spreadsheet exports for Excel or Google Sheets.

---

## 📁 Project Structure

```text
budget-pwa/
├── index.html          # Semantic application shell and views (Dashboard, History, Limits, Settings)
├── manifest.json       # PWA manifest (app name, colors, icons, display: standalone)
├── sw.js               # Service Worker caching assets for offline capability (v5)
├── css/
│   ├── app.css         # Theme tokens, iOS layout, typography, navigation bars
│   └── components.css  # Budget bars, MoneyNote numpad sheet, transaction lists, modals, storage cards
├── js/
│   ├── app.js          # App initialization, tab router, modal bindings, event listeners
│   ├── calculations.js # Monthly aggregates, spending percentages, currency formatters
│   ├── cloud.js        # Serverless Google Drive & Synced Cloud Folder sync engine
│   ├── crypto.js       # Client-side Web Cryptography (AES-GCM 256 + PBKDF2) encryption
│   ├── numpad.js       # Custom keypad input handler with decimal precision
│   ├── store.js        # Data persistence layer (localStorage, storage persistence, export/import)
│   └── ui.js           # DOM rendering (dashboard cards, progress bars, history feed)
├── icons/              # App icons (192x192, 512x512, Apple touch icons, favicons)
├── test_suite.js       # Automated logic & unit tests (runs in Node or macOS JSC)
├── .gitignore          # Git exclusion rules for OS files, backups, and logs
└── README.md           # Project documentation
```

---

## 🚀 Getting Started Locally

Because this project is built entirely with vanilla web standards (HTML, CSS, JavaScript), no build steps or package managers (`npm`/`yarn`) are required.

To run locally on your computer:

```bash
# Using Python 3's built-in HTTP server:
python3 -m http.server 8000

# Open in your browser:
# http://localhost:8000
```

---

## 🧪 Running Tests

The test suite validates data persistence, currency formatting, budget aggregations, and numpad operations.

**On macOS (zero dependencies needed, uses built-in JavaScriptCore):**
```bash
/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc test_suite.js
```

**Using Node.js (if installed):**
```bash
node test_suite.js
```

---

## 🌐 Deploying Online with a Custom Domain

PWAs require **HTTPS** for service workers and home-screen installation. You can deploy this app for free with automatic SSL:

### Option 1: Netlify / Cloudflare Pages (Instant Drag & Drop)
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop) or [Cloudflare Pages](https://dash.cloudflare.com/).
2. Drag and drop the `budget-pwa` directory.
3. In **Domain Management**, add your custom domain (e.g. `budget.yourdomain.com`).
4. Add the provided CNAME record to your DNS provider.

### Option 2: GitHub + Vercel / Cloudflare Pages
1. Push this repository to GitHub:
   ```bash
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/<your-username>/budget-pwa.git
   git branch -M main
   git push -u origin main
   ```
2. Import the repo into [Vercel](https://vercel.com/) or [Cloudflare Pages](https://dash.cloudflare.com/) (Output directory: root `./`).
3. Connect your custom domain in the project settings.

---

## 📱 How to Install on Mobile

Once your site is live with HTTPS:

* **iPhone (iOS Safari):**
  1. Open your domain in Safari.
  2. Tap the **Share** button (box with an upward arrow).
  3. Tap **Add to Home Screen**, then tap **Add**.
* **Android (Chrome):**
  1. Open your domain in Chrome.
  2. Tap the banner prompt **"Add Budget to Home screen"** (or open the `⋮` menu > **Install App**).

---

## 🔒 Privacy Notice

This app does **not** collect telemetry, track usage, or connect to external backend databases. All financial records exist solely on the device using them.

