# Firebase Functions Migration

This repo includes a Firebase Cloud Functions implementation of your API to avoid Cloudflare Workers daily limits.

## Stack

- Firebase Functions (Node 20, region `europe-west1`)
- Firestore (Free tier) as storage for: `stocks`, `deposits`, `dividends`, `exchange_rates`, `performance_snapshots`
- Express for routing
- Vitest for unit tests

## Setup

1. Install Firebase CLI:

```zsh
npm i -g firebase-tools
```

2. Login and set project:

```zsh
firebase login
firebase projects:create --display-name "Portfolio" portfolio-app
firebase use portfolio-app
```

3. Install deps and build:

```zsh
cd functions
npm install
npm run build
```

4. Run locally (emulators):

```zsh
npm run serve
```

API base: `http://localhost:5001/portfolio-app/europe-west1/api`

## Deploy

```zsh
cd functions
npm run deploy
```

Your HTTPS function will be available at:
`https://europe-west1-<PROJECT_ID>.cloudfunctions.net/api`

## Data import

- Create Firestore collections: `stocks`, `deposits`, `dividends`, `exchange_rates`, `performance_snapshots`.
- For `exchange_rates`, add docs with `{ code: 'USD', rate_eur: 0.92 }`, `{ code: 'GBP', rate_eur: 1.16 }`, `{ code: 'RON', rate_eur: 0.20 }`.
- You can export from Cloudflare D1 to JSON and import via a one-off script or Firebase Console.

## Emulator-Only Testing

Ensure tests and local runs use Firebase Emulator to prevent writes to production.

1. Start emulators:

```zsh
firebase emulators:start
```

2. Seed emulator with local JSON:

```zsh
node scripts/import-emulator.js
```

3. Option A – Clone real Firestore to Emulator:
	 - Export from real project (read-only):
		 - Set `FIREBASE_PROJECT_ID` and `ALLOW_REAL_FIRESTORE_READ=true`
		 - Optionally set `EXPORT_COLLECTIONS` and `EXPORT_OUT`
		 - Run:

```zsh
npm run firestore:export
```

	 - Import into emulator:
		 - Ensure `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` (or your host)
		 - Optionally set `IMPORT_FILE`
		 - Run:

```zsh
npm run firestore:import:emulator
```

4. Run tests:

```zsh
npm run test:e2e
```

### Safeguards
- The export script refuses to run unless `ALLOW_REAL_FIRESTORE_READ=true` is set.
- The import script refuses to run unless `FIRESTORE_EMULATOR_HOST` is set.
- Never run tests pointing at production; use `API_BASE_OVERRIDE` to target the emulator.

## Notes

- `/api/debug-sql` is not supported on Firestore.
- Currency parsing, allocations, and PREM Yahoo/Google fallback are ported.
- Keep Cloudflare Worker live during transition; then update frontend `API_BASE` to Firebase URL.
