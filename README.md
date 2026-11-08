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

- On a native iPhone build, reminders, lists, settings, completion history and the scheduled-notification index are stored in the `daymark` SQLite database. Preferences also stores the small settings object. Database changes are written transactionally. Native backups are shared using the iOS share sheet.
- In a browser or installed PWA, reminders and settings use IndexedDB. Existing browser data in `daymark.local.v1` is migrated the first time the IndexedDB store is opened.
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

### Optional Web Push setup

The PWA includes a Web Push client, but Daymark does not bundle or configure a push sender. Until you operate a compatible HTTPS sender and verify delivery on a real device, do not rely on background reminders. iPhone Web Push requires iOS/iPadOS 16.4 or later and the installed Home Screen web app; permission must be granted. A static host such as GitHub Pages cannot send pushes by itself.

To connect a sender, enter its HTTPS POST URL and **VAPID public key** in Settings. Never put the VAPID private key in Daymark. Reminder titles, descriptions and scheduled times are sent to the configured endpoint, so only use a server you control and trust. The endpoint must allow the PWA origin through CORS and implement these JSON operations:

- `{"action":"sync","subscription":...,"timeZone":"...","reminders":[...]}` — replace/update pending deliveries for the subscription and return `{"ok":true,"scheduled":N}`. Each reminder occurrence has an `id`, `reminderId`, `title`, `body`, and ISO-8601 `scheduledAt`. Daymark sends upcoming occurrences for the next 45 days when opened or brought to the foreground.
- `{"action":"unsubscribe","subscription":...}` — cancel server-side deliveries and return `{"ok":true}`.
- `{"action":"snooze","subscription":...,"reminderId":"...","minutes":10,"timeZone":"..."}` — enqueue a snoozed delivery and return `{"ok":true}`.

The sender must store subscriptions, schedule pushes at the supplied times, send valid Web Push payloads (`title`, `body`, and optionally `url`/`id`), remove expired subscriptions, handle CORS preflights, and keep its VAPID private key server-side. It must also reconcile/cancel previously queued occurrences when handling `sync`. Since the browser refreshes the 45-day horizon only when the app runs, recurring reminders beyond that window require the app to be opened periodically, unless your sender independently implements recurrence. Web Push requires an internet connection and cannot provide offline delivery. Test permission denial, server failure, lock-screen delivery, app termination, snooze, rescheduling, timezone changes, and recurrence on the actual installed iPhone PWA before relying on it.

## Develop on Windows

Install Node.js LTS and Yarn Classic (the project lockfile is `yarn.lock`). In PowerShell:

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
