import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';
import path from 'node:path';

// Must point to emulator; safeguard against real writes
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Refusing to import: FIRESTORE_EMULATOR_HOST is not set. Start emulator and set env.');
  process.exit(1);
}

initializeApp();
const db = getFirestore();

const inputFile = process.env.IMPORT_FILE || path.resolve('backup-firestore.json');
if (!fs.existsSync(inputFile)) {
  console.error(`Input file not found: ${inputFile}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

async function importCollection(name, docs) {
  const batchSize = 500;
  let count = 0;
  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const batch = db.batch();
    for (const doc of chunk) {
      const id = doc.id || `${name}-${count}`;
      batch.set(db.collection(name).doc(id), doc.data);
      count++;
    }
    await batch.commit();
  }
  console.log(`Imported ${count} docs into ${name}`);
}

async function main() {
  for (const [name, docs] of Object.entries(data)) {
    if (!Array.isArray(docs)) continue;
    await importCollection(name, docs);
  }
  console.log('✅ Import into emulator completed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
