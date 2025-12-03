import sqlite3pkg from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sqlite3 = sqlite3pkg.verbose();
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'portfolio.db');

const monthIndex = (name) => {
  const map = {
    January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
    July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
    Novermber: 11, Marach: 3
  };
  return map[name] || 1;
};

const data = [
  [2022,'June',27.37,'SNP','RON'],
  [2022,'June',19.03,'TLV','RON'],
  [2022,'September',35.44,'SNP','RON'],
  [2022,'September',2.85,'BIO','RON'],
  [2022,'September',8.07,'DIGI','RON'],
  [2022,'November',4.2,'ONE','RON'],
  [2022,'December',9.42,'AQ','RON'],
  [2023,'March',5.67,'SFG','RON'],
  [2023,'May',1.38,'US.O','USD'],
  [2023,'May',7.14,'ONE','RON'],
  [2023,'June',47.15,'FP','RON'],
  [2023,'June',13.6,'AQ','RON'],
  [2023,'June',146.3,'SNP','RON'],
  [2023,'June',11.13,'TTS','RON'],
  [2023,'June',10.15,'COTE','RON'],
  [2023,'June',1.38,'US.O','USD'],
  [2023,'June',11.92,'EL','RON'],
  [2023,'June',47.05,'SNN','RON'],
  [2023,'June',3.88,'BVB','RON'],
  [2023,'June',1.37,'DE.VUSA','USD'],
  [2023,'July',3.2,'SAFE','RON'],
  [2023,'July',1.38,'US.O','USD'],
  [2023,'July',37.35,'TGN','RON'],
  [2023,'July',129.22,'SNG','RON'],
  [2023,'July',6.81,'TEL','RON'],
  [2023,'August',2.39,'SMTL','RON'],
  [2023,'August',1.38,'US.O','USD'],
  [2023,'August',33.55,'WINE','RON'],
  [2023,'September',16.61,'BIO','RON'],
  [2023,'September',18.4,'DIGI','RON'],
  [2023,'September',1.38,'US.O','USD'],
  [2023,'September',6.95,'DE.VUSA','USD'],
  [2023,'September','1,621.11','FP','RON'],
  [2023,'October',16.01,'VNC','RON'],
  [2023,'October',11.76,'SFG','RON'],
  [2023,'October',1.38,'US.O','USD'],
  [2023,'October',176.16,'SNP','RON'],
  [2023,'October',8.39,'BENTO','RON'],
  [2023,'October',23.11,'TBM','RON'],
  [2023,'November',197.52,'TLV','RON'],
  [2023,'November',1.38,'US.O','USD'],
  [2023,'December',1.38,'US.O','USD'],
  [2023,'December',10.33,'DE.VUSA','USD'],
  [2024,'January',1.39,'US.O','USD'],
  [2024,'January',185.04,'BRD','RON'],
  [2024,'January',11.79,'ONE','RON'],
  [2024,'February',1.18,'US.O','USD'],
  [2024,'March',1.17,'US.O','USD'],
  [2024,'March',10.97,'DE.VUSA','USD'],
  [2024,'May',3.38,'ARS','RON'],
  [2024,'June',427.09,'SNP','RON'],
  [2024,'June',32.91,'AQ','RON'],
  [2024,'June',276.59,'BRD','RON'],
  [2024,'June',16.39,'SFG','RON'],
  [2024,'June',0.7,'MACO','RON'],
  [2024,'June',218.67,'FP','RON'],
  [2024,'June',40.95,'TTS','RON'],
  [2024,'June',8.8,'COTE','RON'],
  [2024,'June',182.81,'SNN','RON'],
  [2024,'June',403.7,'TLV','RON'],
  [2024,'June',11.97,'DE.VUSA','USD'],
  [2024,'June',2.08,'TEL','RON'],
  [2024,'June',471.46,'H2O','RON'],
  [2024,'July',10.8,'ONE','RON'],
  [2024,'July',32.18,'TGN','RON'],
  [2024,'July',10.93,'EL','RON'],
  [2024,'July',30.06,'DIGI','RON'],
  [2024,'July',28.08,'ALU','RON'],
  [2024,'July',127.36,'SNG','RON'],
  [2024,'July',19.71,'BENTO','RON'],
  [2024,'August',3.67,'BVB','RON'],
  [2024,'August',11.6,'ROCE','RON'],
  [2024,'September',358.37,'SNP','RON'],
  [2024,'September',29.6,'BIO','RON'],
  [2024,'September',13.15,'DE.VUSA','USD'],
  [2024,'September',7.5,'RMAH','RON'],
  [2024,'October',4.88,'ATB','RON'],
  [2024,'October',23.48,'TBM','RON'],
  [2024,'Novermber',15.9,'SFG','RON'],
  [2024,'Novermber',20.27,'ONE','RON'],
  [2025,'January',10.24,'SOCP','RON'],
  [2025,'May',358.25,'BRD','RON'],
  [2025,'May',20.7,'ONE','RON'],
  [2025,'May',13.95,'SPX','RON'],
  [2025,'Marach','1,086.85','SNP','RON'],
  [2025,'May',4.22,'MACO','RON'],
  [2025,'May',4.21,'ARS','RON'],
  [2025,'June',48.18,'AQ','RON'],
  [2025,'June',18.79,'SFG','RON'],
  [2025,'June',58.28,'TTS','RON'],
  [2025,'June',279.66,'SNN','RON'],
  [2025,'June',683.01,'H2O','RON'],
  [2025,'June',34.3,'EL','RON'],
  [2025,'June','1,211.72','TLV','RON'],
  [2025,'July',63.37,'DIGI','RON'],
  [2025,'July',154.93,'TGN','RON'],
  [2025,'July',227.75,'SNG','RON'],
  [2025,'July',57.74,'ALU','RON'],
  [2025,'July',119.15,'TEL','RON'],
  [2025,'May',40.54,'BIO','RON'],
  [2025,'September',0.01,'SOCP','RON'],
  [2025,'September',57.54,'RMAH','RON'],
  [2025,'August',6.76,'ATB','RON'],
  [2025,'October',28.58,'TBM','RON'],
  [2025,'Novermber',28.46,'ONE','RON']
];

function toNumber(value) {
  if (typeof value === 'string') {
    const v = value.replace(/,/g, '');
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const db = new sqlite3.Database(DB_PATH);
  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS dividends_monthly (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        month_index INTEGER NOT NULL,
        amount REAL NOT NULL,
        notes TEXT,
        symbol TEXT,
        currency TEXT
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });

  const stmt = db.prepare('INSERT INTO dividends_monthly (year, month_index, amount, symbol, currency) VALUES (?, ?, ?, ?, ?)');
  let inserted = 0;
  for (const [year, monthName, amount, symbol, currency] of data) {
    const mi = monthIndex(monthName);
    const amt = toNumber(amount);
    await new Promise((resolve, reject) => {
      stmt.run(year, mi, amt, String(symbol || ''), String(currency || 'RON'), (err) => {
        if (err) return reject(err);
        inserted++;
        resolve();
      });
    });
  }
  stmt.finalize();
  console.log(`Inserted ${inserted} monthly dividend rows into ${DB_PATH}`);
  db.close();
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
