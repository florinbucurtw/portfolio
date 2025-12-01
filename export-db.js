import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { exportData } = require('./db-backup.cjs');

console.log('📦 Exporting database...');
exportData()
  .then(() => {
    console.log('✅ Export complete!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Export failed:', err);
    process.exit(1);
  });
