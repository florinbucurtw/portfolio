const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const BACKUP_FILE = 'backup-data.json';

function exportData(dbPath = process.env.DB_PATH || 'portfolio.db') {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.log('No existing database to export from');
        resolve({ stocks: [], deposits: [] });
        return;
      }
    });

    db.all('SELECT * FROM stocks', [], (err, stocksRows) => {
      if (err) {
        console.log('No stocks data to export');
        stocksRows = [];
      }

      db.all('SELECT * FROM deposits', [], (err, depositsRows) => {
        if (err) {
          console.log('No deposits data to export');
          depositsRows = [];
        }

        const backupData = {
          stocks: stocksRows,
          deposits: depositsRows,
        };

        fs.writeFileSync(BACKUP_FILE, JSON.stringify(backupData, null, 2));
        console.log(
          `✅ Exported ${stocksRows.length} stocks and ${depositsRows.length} deposits to ${BACKUP_FILE}`
        );
        resolve(backupData);
        db.close();
      });
    });
  });
}

function importData(db) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(BACKUP_FILE)) {
      console.log('No backup found, using seed data for stocks...');
      const seedData = require('./seed-data.js');
      insertStocksRecords(db, seedData, resolve, reject);
      return;
    }

    const data = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));

    let stocksData = [];
    let depositsData = [];

    if (Array.isArray(data)) {
      stocksData = data;
    } else {
      stocksData = data.stocks || [];
      depositsData = data.deposits || [];
    }

    if (stocksData.length === 0) {
      console.log('Backup stocks empty, using seed data...');
      const seedData = require('./seed-data.js');
      stocksData = seedData;
    }

    console.log(
      `📥 Importing ${stocksData.length} stocks and ${depositsData.length} deposits from ${BACKUP_FILE}...`
    );

    insertStocksRecords(
      db,
      stocksData,
      () => {
        if (depositsData.length > 0) {
          insertDepositsRecords(db, depositsData, resolve, reject);
        } else {
          resolve();
        }
      },
      reject
    );
  });
}

function insertStocksRecords(db, data, resolve, reject) {
  const stmt = db.prepare(`
    INSERT INTO stocks (symbol, weight, company, allocation, shares, share_price, broker, risk)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  data.forEach((record) => {
    stmt.run(
      record.symbol,
      record.weight,
      record.company,
      record.allocation,
      record.shares,
      record.share_price,
      record.broker || '-',
      record.risk,
      (err) => {
        if (err) {
          console.error('Error inserting record:', err);
        } else {
          inserted++;
        }
      }
    );
  });

  stmt.finalize((err) => {
    if (err) {
      reject(err);
    } else {
      console.log(`✅ Successfully imported ${inserted} stocks`);
      resolve(inserted);
    }
  });
}

function insertDepositsRecords(db, data, resolve, reject) {
  const stmt = db.prepare(`
    INSERT INTO deposits (count, date, amount, account, month)
    VALUES (?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  data.forEach((record) => {
    stmt.run(record.count, record.date, record.amount, record.account, record.month, (err) => {
      if (err) {
        console.error('Error inserting deposit:', err);
      } else {
        inserted++;
      }
    });
  });

  stmt.finalize((err) => {
    if (err) {
      reject(err);
    } else {
      console.log(`✅ Successfully imported ${inserted} deposits`);
      resolve(inserted);
    }
  });
}

module.exports = { exportData, importData };