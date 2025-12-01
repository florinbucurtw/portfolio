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

## Notes

- `/api/debug-sql` is not supported on Firestore.
- Currency parsing, allocations, and PREM Yahoo/Google fallback are ported.
- Keep Cloudflare Worker live during transition; then update frontend `API_BASE` to Firebase URL.
