import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Ensure we target the local emulator without requiring auth
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8081';
process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'florinportfolio';

initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
const db = getFirestore();

async function seed() {
  const ratesRef = db.collection('exchange_rates').doc('latest');
  await ratesRef.set({
    base: 'EUR',
    date: new Date().toISOString().slice(0, 10),
    rates: { USD: 1.1, RON: 4.95, GBP: 0.86 },
  });

  const stocks = db.collection('stocks');
  await stocks.doc('AAPL').set({ symbol: 'AAPL', currency: 'USD', shares: 10 });
  await stocks.doc('GOOGL').set({ symbol: 'GOOGL', currency: 'USD', shares: 5 });

  const deposits = db.collection('deposits');
  await deposits.add({ currency: 'EUR', amount: 1000, date: Date.now() });

  const dividends = db.collection('dividends');
  await dividends.add({ symbol: 'AAPL', amount: 5, currency: 'USD', date: Date.now() });

  console.log('Emulator seeded successfully');
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
