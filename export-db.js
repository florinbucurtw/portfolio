const { exportData } = require('./db-backup');

console.log('📦 Exporting database...');
exportData().then(() => {
  console.log('✅ Export complete!');
  process.exit(0);
}).catch(err => {
  console.error('❌ Export failed:', err);
  process.exit(1);
});
