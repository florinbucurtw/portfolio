import fs from 'fs';

const src = 'portfolio.db';
const dest = 'portfolio.test.db';

try {
  if (!fs.existsSync(src)) {
    console.error(`Source DB not found: ${src}`);
    process.exit(1);
  }
  fs.copyFileSync(src, dest);
  console.log(`✓ Cloned DB: ${src} → ${dest}`);
  // Optional: remove any SQLite journal files for a clean start
  ['portfolio.db-journal', 'portfolio.test.db-journal'].forEach((j) => {
    if (fs.existsSync(j)) {
      try { fs.unlinkSync(j); } catch {}
    }
  });
  process.exit(0);
} catch (err) {
  console.error('Failed to clone DB:', err.message);
  process.exit(1);
}
