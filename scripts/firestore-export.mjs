import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';
import path from 'node:path';

// Safeguard: only allow READS from a real project when explicitly opted in
const projectId = process.env.FIREBASE_PROJECT_ID;
const allowRealRead = process.env.ALLOW_REAL_FIRESTORE_READ === 'true';
if (!projectId || !allowRealRead) {
  console.error('Refusing to read real Firestore. Set FIREBASE_PROJECT_ID and ALLOW_REAL_FIRESTORE_READ=true');
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const collections = (process.env.EXPORT_COLLECTIONS || 'stocks,deposits,dividends,exchangeRates,snapshots,allocations').split(',').map(s => s.trim()).filter(Boolean);
const outFile = process.env.EXPORT_OUT || path.resolve('backup-firestore.json');

async function exportCollection(name) {
  const snap = await db.collection(name).get();
  return snap.docs.map(d => ({ id: d.id, data: d.data() }));
}

async function main() {
  const result = {};
  for (const c of collections) {
    console.log(`Exporting collection: ${c}`);
    result[c] = await exportCollection(c);
  }
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log(`✅ Exported ${collections.length} collections to ${outFile}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
