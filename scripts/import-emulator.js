import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';

const BACKUP = 'backup-data.json';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('FIRESTORE_EMULATOR_HOST must be set to import into emulator');
  process.exit(1);
}

const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'florinportfolio';
initializeApp({ projectId });
const db = getFirestore();

async function importToEmulator() {
  if (!fs.existsSync(BACKUP)) {
    console.error(`Backup file ${BACKUP} not found.`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(BACKUP, 'utf-8'));
  const stocks = Array.isArray(data) ? data : (data.stocks || []);
  const deposits = Array.isArray(data) ? [] : (data.deposits || []);

  console.log(`Importing ${stocks.length} stocks and ${deposits.length} deposits into emulator...`);

  const stocksCol = db.collection('stocks');
  for (let i = 0; i < stocks.length; i++) {
    const s = stocks[i];
    let id = (s.symbol || s.id || `stock-${i}`).toString().trim();
    if (!id) id = `stock-${i}`;
    await stocksCol.doc(id).set(s);
  }

  const depositsCol = db.collection('deposits');
  for (let i = 0; i < deposits.length; i++) {
    const d = deposits[i];
    let id = (d.id || `deposit-${i}`).toString().trim();
    if (!id) id = `deposit-${i}`;
    await depositsCol.doc(id).set(d);
  }

  console.log('✅ Import completed');
}

importToEmulator().catch((e) => {
  console.error('❌ Import failed:', e);
  process.exit(1);
});
