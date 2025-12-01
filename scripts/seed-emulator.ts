import admin from 'firebase-admin';

async function main() {
  // Use emulator by default if FIRESTORE_EMULATOR_HOST is set by firebase emulators
  admin.initializeApp({ projectId: 'florinportfolio' });
  const db = admin.firestore();

  // exchange_rates
  const rates = [
    { code: 'USD', rate_eur: 0.92 },
    { code: 'GBP', rate_eur: 1.16 },
    { code: 'RON', rate_eur: 0.2 },
  ];
  for (const r of rates) {
    await db.collection('exchange_rates').doc(r.code).set(r);
  }

  // stocks sample
  const stocks = [
    {
      symbol: 'PREM.L',
      company: 'Premier Test',
      shares: 100,
      share_price: '£1.23',
      broker: 'Test',
      sector: 'Misc',
      risk: 'Medium',
      allocation: '',
    },
    {
      symbol: 'ABCD.RO',
      company: 'Romania Test',
      shares: 50,
      share_price: 'RON 12.50',
      broker: 'Test',
      sector: 'Finance',
      risk: 'Low',
      allocation: '',
    },
  ];
  for (const s of stocks) {
    await db.collection('stocks').add(s);
  }

  // deposits
  const deposits = [
    { amount: 1000, currency: 'EUR', date: '2025-01-01' },
    { amount: 500, currency: 'USD', date: '2025-02-01' },
  ];
  for (const d of deposits) {
    await db.collection('deposits').add(d);
  }

  // dividends
  const dividends = [{ amount: 15, currency: 'GBP', date: '2025-03-01', symbol: 'PREM.L' }];
  for (const dv of dividends) {
    await db.collection('dividends').add(dv);
  }

  console.log('Seed completed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
