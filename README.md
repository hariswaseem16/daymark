# Daymark

A quiet, offline-first reminder and personal productivity app built with React, Vite, and Capacitor. The interface adapts to iPhone safe areas and uses native iOS notifications and SQLite when running as an installed app.

## Plan, architecture, and delivery status

| Phase | Deliverable | Status |
|---|---|---|
| 1. Project setup | Vite/React project, Yarn lockfile, Capacitor iOS target configuration | Implemented; iOS target generated below |
| 2. UI design system | Responsive, light/dark, iPhone-safe-area layout and reusable styles | Implemented |
| 3. Dashboard | Greeting, live clock, today list, progress, next reminder, overdue and upcoming sections | Implemented |
| 4. Reminder management | Create/edit/delete/complete/snooze, notes, priority, categories, multiple times and recurrence | Implemented |
| 5. Persistence | Native SQLite tables and browser IndexedDB with one-time migration from localStorage | Implemented |
| 6. Notifications | Native Capacitor notifications; optional server-backed Web Push client for installed PWAs | Native path implemented; Web Push needs a configured sender |
| 7. Calendar | Month/week/day views, date selection and calendar quick-add | Implemented |
| 8. Statistics | Daily/weekly/monthly activity, completion rate, missed reminders and streaks | Implemented |
| 9. Settings | Theme, notification permission, default time, week start, notification sound/haptics, export/import and reset | Implemented |
| 10. iOS testing and deployment | Xcode signing, physical-device testing and install/distribution | Requires a Mac with Xcode; Windows cannot compile or sign an iOS app |

### Source layout

```text
src/
  components/       Reminder editor and reusable reminder row
  data/             First-run lists, example reminders and default settings
  screens/          Dashboard, calendar, reminders, lists, insights and settings
  services/         SQLite/preferences persistence and local notification scheduling
  utils/            Local-date, recurrence and overdue helpers
  App.jsx           App shell, navigation and application state
  App.css           Component styles and responsive layouts
  index.css         Theme tokens and platform typography
```

### Persistence and notification notes

- On a native iPhone build, reminders, lists, settings, completion history, snoozes and the scheduled-notification index are stored in the `daymark` SQLite database. Preferences also stores the small settings object. Database changes are written transactionally. Native backups are shared using the iOS share sheet.
- In a browser or installed PWA, reminders, snoozes and settings use IndexedDB. Existing browser data in `daymark.local.v1` is migrated the first time the IndexedDB store is opened.
- The PWA caches its built app shell for offline reopening after its first successful online load. PWA browser reminders do **not** use native SQLite or pretend to provide local background scheduling.
- iOS keeps already scheduled local notifications when the app is closed and across device restarts. On launch and when the app returns to the foreground, Daymark reconciles pending notifications against SQLite and the device's current local timezone.
- Daily, weekly and monthly repeats use native repeating triggers; selected weekdays use native weekly triggers. Other custom intervals are expanded into one-shot notifications for the next 45 days and refreshed when the app opens. iOS allows a limited number of pending notifications; Daymark schedules at most 60 to leave headroom and prioritizes the nearest reminders. A custom-interval series therefore needs the app to be opened occasionally to keep its future queue refreshed.
- iOS permission prompts appear only after choosing **Enable notifications**. If permission has already been denied, enable it in **iPhone Settings → Notifications → Daymark**.
- Example first-run reminders are included so the screens are populated. They are stored only on first launch; use Settings → Reset all app data to start fresh.

## Install the PWA on iPhone

The PWA is a separate install path from the Capacitor app and does not need a Mac, Apple Developer membership, or paid hosting. Build the static site on Windows:

```powershell
cd "D:\React projects\daymark"
yarn install --frozen-lockfile
yarn build
```

Publish the contents of `dist/` to any static HTTPS host. For free GitHub Pages hosting, put the project in a public GitHub repository on the `main` branch and push it; the included `.github/workflows/deploy-pages.yml` builds and publishes `dist/`. In repository **Settings → Pages**, choose **GitHub Actions** as the source. The relative asset paths support the repository subpath. No server-side component is needed to install or use offline storage.

On iPhone, open the deployed HTTPS address in **Safari**, tap **Share → Add to Home Screen → Add**, then launch Daymark from its Home Screen icon. The first online load downloads the app shell; after that, the UI and IndexedDB data can be reopened offline. Safari must be used for installation.

### Web Push on Netlify

The repository includes Netlify Functions for authenticated subscription/schedule sync and push delivery, with Netlify Blobs for persistent schedules. Deploy the site to Netlify to use these functions; GitHub Pages and other static-only hosts do not run them. Keep the VAPID private key and API bearer token in Netlify environment variables and never commit them to source code. The API token is also entered into this device's Daymark settings.

1. Generate a VAPID key pair locally (the private key is printed only to your terminal):

   ```powershell
   cd "D:\React projects\daymark"
   node --input-type=module -e "import webpush from 'web-push'; console.log(JSON.stringify(webpush.generateVAPIDKeys(), null, 2))"
   ```

2. Generate a separate API token:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

3. In **Netlify → Site configuration → Environment variables**, set:
   - `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` to the generated pair.
   - `VAPID_SUBJECT` to a contact URI such as `mailto:you@example.com`.
   - `PUSH_API_TOKEN` to the generated API token.
   - `PUSH_ALLOWED_ORIGIN` to the exact deployed Daymark origin, for example `https://daymark-by-haris.netlify.app` (no trailing slash).
   - `PUSH_APP_URL` to the deployed Daymark URL.

4. Deploy the repository to Netlify with the included `netlify.toml` (build command `yarn build`, publish directory `dist`). The scheduled function checks for due reminders every five minutes. Netlify Blobs is provisioned by the function at runtime; it stores subscription data, recurrence rules and pending delivery records.
5. In Daymark Settings → Little nudges, use the default `/.netlify/functions/push-api` URL for the same Netlify site, paste the `PUSH_API_TOKEN`, save, and enable Web Push. The VAPID public key is fetched from the server; do not enter either VAPID key in Daymark.

The API token is stored with this device's local Daymark settings and is omitted from exported backups. Rotate it in Netlify and update Daymark if it is exposed. Reminder titles, descriptions, schedule rules, timezone and the browser's push subscription are sent to your Netlify site. Netlify's Free plan currently advertises 300 monthly credits; Blobs reads/writes and scheduled/function execution are subject to plan quotas and credit usage, and pricing can change. A five-minute schedule invokes the dispatcher about 8,640 times per 30-day month, before normal API use; check Netlify's current pricing and usage dashboard, and do not assume ongoing delivery will stay within a free allowance. Scheduled function execution is time-limited (currently 30 seconds), and push timing may be delayed by the five-minute polling interval, provider TTL and device connectivity.

The dispatcher converts recurring local wall times using the submitted IANA timezone and sends UTC instants without applying the offset again. During daylight-saving gaps it uses the next valid local time; during an ambiguous repeated time it uses the earlier instant. A timezone change is learned when the PWA next runs and syncs; the server cannot detect a device change while the PWA is closed. Snoozes are separate persisted one-shot events, so the original reminder and recurrence rule are not modified. If Web Push is unavailable or not configured, snoozing is saved locally but cannot generate a closed-app browser notification.

iPhone Web Push requires iOS/iPadOS 16.4 or later, a Home Screen-installed PWA, HTTPS, and granted notification permission. iOS 15 remains usable for Daymark's UI, IndexedDB and in-app reminder management, but does not support Web Push delivery while closed. Web Push also requires connectivity; Netlify's five-minute polling, device connectivity, browser/OS delivery policies and provider TTL make timing best-effort, not exact or guaranteed. Test lock-screen delivery, app termination, permission denial, expiry, recurrence, timezone changes, snoozing and server outages on an installed iOS 16.4+ device before relying on it. Native Capacitor local notifications are unchanged.

## Develop on Windows

Install Node.js 22.12.0 or newer and Yarn Classic (the project lockfile is `yarn.lock`; Netlify Blobs requires Node 22.12+). In PowerShell:

```powershell
cd "D:\React projects\daymark"
yarn install --frozen-lockfile
yarn dev
```

Vite prints a local URL (normally `http://localhost:5173`). Open it on the Windows computer to preview and exercise the interface. Use **Ctrl+C** in that terminal to stop the dev server.

Validate the project:

```powershell
cd "D:\React projects\daymark"
yarn test
yarn lint
yarn build
```

To make a production web bundle and refresh the Capacitor project:

```powershell
yarn build
yarn cap sync ios
```

`yarn cap sync ios` copies the bundle and plugin configuration; it is **not** an iOS build.

The PWA service worker is registered only in a web browser. It is not registered in the Capacitor iOS app, and the existing native SQLite and Local Notifications paths are unchanged.

## Build and install on iPhone (requires macOS)

Apple requires macOS and Xcode to compile, sign, run on a physical iPhone, or distribute an iOS application. A Windows PC cannot produce or sign the installable iOS app. The iOS project files can be created on Windows with Capacitor, but the remaining build and installation steps must be performed on a Mac.

1. On Windows, run `yarn build` and `yarn cap sync ios`.
2. Transfer the `daymark` folder to a Mac using a private Git remote or another trusted file-transfer method. Include `ios/`, `src/`, `public/`, `package.json`, `yarn.lock`, `vite.config.js` and `capacitor.config.json`; omit `node_modules/`.
3. On the Mac, install Node.js LTS, Yarn Classic, Xcode, Xcode command-line tools, and CocoaPods (for example, `brew install cocoapods` after installing Homebrew). Then run:

   ```sh
   cd /path/to/daymark
   yarn install --frozen-lockfile
   yarn build
   yarn cap sync ios
   yarn cap open ios
   ```

4. In Xcode, select the **App** target, set a unique bundle identifier and your Apple Developer Team under **Signing & Capabilities**. Connect and trust the iPhone, select it as the run destination, and press **Run**. For distribution, create an Archive and upload it using an Apple Developer account.
5. On the iPhone, allow notifications when prompted. Test lock-screen delivery, app termination, reboot, a denied-then-enabled permission, snooze/complete actions, recurrence and timezone changes. Real-device/Xcode verification cannot be completed from Windows.

The bundle identifier starts as `com.daymark.personal`. Change it in Xcode before signing if it is already in use by another app.
