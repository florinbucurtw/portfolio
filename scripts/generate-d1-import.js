// Script: generează INSERT-uri SQL pentru D1 din backup-data.json sau din SQLite
// Rulare: node scripts/generate-d1-import.js > d1-import.sql

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const BACKUP_JSON = path.join(process.cwd(), 'backup-data.json');
const SQLITE_DB = path.join(process.cwd(), 'portfolio.db');

function escapeValue(v) {
  if (v == null) return 'NULL';
  if (typeof v === 'number') return v;
  return `'${String(v).replace(/'/g, "''")}'`;
}

function generateFromJson() {
  if (!fs.existsSync(BACKUP_JSON)) return null;
  const data = JSON.parse(fs.readFileSync(BACKUP_JSON, 'utf8'));
  const stocks = data.stocks || [];
  const deposits = data.deposits || [];
  const lines = [];
  lines.push('-- Generated from backup-data.json');
  stocks.forEach((s) => {
    lines.push(
      `INSERT INTO stocks (symbol, weight, company, allocation, shares, share_price, broker, risk, sector) VALUES (${escapeValue(s.symbol)}, ${escapeValue(s.weight)}, ${escapeValue(s.company)}, ${escapeValue(s.allocation)}, ${escapeValue(s.shares)}, ${escapeValue(s.share_price)}, ${escapeValue(s.broker)}, ${escapeValue(s.risk)}, ${escapeValue(s.sector)});`
    );
  });
  deposits.forEach((d) => {
    lines.push(
      `INSERT INTO deposits (count, date, amount, account, month) VALUES (${escapeValue(d.count)}, ${escapeValue(d.date)}, ${escapeValue(d.amount)}, ${escapeValue(d.account)}, ${escapeValue(d.month)});`
    );
  });
  return lines.join('\n');
}

function generateFromSqlite() {
  if (!fs.existsSync(SQLITE_DB)) return null;
  return new Promise((resolve) => {
    const db = new sqlite3.Database(SQLITE_DB);
    const lines = ['-- Generated from portfolio.db'];
    db.all('SELECT * FROM stocks', [], (err, rows) => {
      if (!err && rows) {
        rows.forEach((s) => {
          lines.push(
            `INSERT INTO stocks (symbol, weight, company, allocation, shares, share_price, broker, risk, sector) VALUES (${escapeValue(s.symbol)}, ${escapeValue(s.weight)}, ${escapeValue(s.company)}, ${escapeValue(s.allocation)}, ${escapeValue(s.shares)}, ${escapeValue(s.share_price)}, ${escapeValue(s.broker)}, ${escapeValue(s.risk)}, ${escapeValue(s.sector)});`
          );
        });
      }
      db.all('SELECT * FROM deposits', [], (err2, rows2) => {
        if (!err2 && rows2) {
          rows2.forEach((d) => {
            lines.push(
              `INSERT INTO deposits (count, date, amount, account, month) VALUES (${escapeValue(d.count)}, ${escapeValue(d.date)}, ${escapeValue(d.amount)}, ${escapeValue(d.account)}, ${escapeValue(d.month)});`
            );
          });
        }
        db.all('SELECT * FROM dividends', [], (err3, rows3) => {
          if (!err3 && rows3) {
            rows3.forEach((v) => {
              lines.push(
                `INSERT INTO dividends (year, annual_dividend) VALUES (${escapeValue(v.year)}, ${escapeValue(v.annual_dividend)});`
              );
            });
          }
          db.close(() => resolve(lines.join('\n')));
        });
      });
    });
  });
}

(async () => {
  let sql = generateFromJson();
  if (!sql) {
    const fromDb = await generateFromSqlite();
    sql = fromDb;
  }
  if (!sql) {
    console.error('Nu există backup-data.json sau portfolio.db pentru export.');
    process.exit(1);
  }
  console.log(sql);
})();
