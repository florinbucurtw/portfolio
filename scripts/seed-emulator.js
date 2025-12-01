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
    rates: { EUR: 1.0, USD: 1.1, RON: 4.95, GBP: 0.86 },
  });

  const stocks = db.collection('stocks');
  await stocks.doc('AAPL').set({ symbol: 'AAPL', company: 'Apple Inc.', broker: 'XTB-USD', sector: 'Technology', risk: '🟨 Medium-Safe', shares: 10, share_price: '$190.00', allocation: '€1727.27' });
  await stocks.doc('GOOGL').set({ symbol: 'GOOGL', company: 'Alphabet Inc.', broker: 'Trading212', sector: 'Technology', risk: '🟦 Safe', shares: 5, share_price: '$140.00', allocation: '€636.36' });
  await stocks.doc('SXR8.DE').set({ symbol: 'SXR8.DE', company: 'iShares Core S&P 500', broker: 'XTB-EURO', sector: 'ETF - S&P 500', risk: '🟦 Safe', shares: 3, share_price: '€500.00', allocation: '€1500.00' });
  await stocks.doc('NUKL.DE').set({ symbol: 'NUKL.DE', company: 'HANetf Nuclear Energy', broker: 'XTB-EURO', sector: 'ETF - Nuclear Energy', risk: '🟨 Medium-Safe', shares: 10, share_price: '€10.00', allocation: '€100.00' });
  await stocks.doc('Cash Tradeville').set({ symbol: 'Cash Tradeville', company: 'Cash', broker: 'Tradeville', sector: 'Cash', risk: '🟩 Very Safe', shares: 1, share_price: 'RON 1000.00', allocation: '€202.02' });
  await stocks.doc('DFNS.UK').set({ symbol: 'DFNS.UK', company: 'HANetf Defense', broker: 'XTB-EURO', sector: 'ETF - Defense', risk: '🟦 Safe', shares: 7, share_price: '€20.00', allocation: '€140.00' });
  await stocks.doc('VGWL.DE').set({ symbol: 'VGWL.DE', company: 'Vanguard FTSE All-World', broker: 'XTB-EURO', sector: 'ETF - All World', risk: '🟦 Safe', shares: 2, share_price: '€110.00', allocation: '€220.00' });
  await stocks.doc('BTC').set({ symbol: 'BTC', company: 'Bitcoin', broker: 'Crypto', sector: 'Cryptocurrency', risk: '🟥 High Risk', shares: 0.05, share_price: '$70000.00', allocation: '€3181.82' });
  await stocks.doc('ESP0.DE').set({ symbol: 'ESP0.DE', company: 'iShares MSCI Spain', broker: 'XTB-EURO', sector: 'ETF - Countries', risk: '🟨 Medium-Safe', shares: 15, share_price: '€6.00', allocation: '€90.00' });

  const deposits = db.collection('deposits');
  await deposits.add({ amount: '1000', account: 'XTB-EURO', month: 'January', date: '01/01/2024' });
  await deposits.add({ amount: '500', account: 'Trading212', month: 'February', date: '01/02/2024' });
  await deposits.add({ amount: '300', account: 'Bank Deposit', month: 'March', date: '01/03/2024' });

  const dividends = db.collection('dividends');
  await dividends.add({ year: 2023, annual_dividend: 120 });
  await dividends.add({ year: 2024, annual_dividend: 240 });
  await dividends.add({ year: 2025, annual_dividend: 360 });

  console.log('Emulator seeded successfully');
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
