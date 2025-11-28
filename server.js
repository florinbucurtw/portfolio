const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { exportData, importData } = require('./db-backup');

const app = express();
let PORT = parseInt(process.env.PORT || '3000', 10);

// Fetch shim: use global fetch if available (Node 18+), else node-fetch v2
let fetchFn = global.fetch;
if (!fetchFn) {
  fetchFn = require('node-fetch');
}

// Initialize SQLite database
const db = new sqlite3.Database('portfolio.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
  }
});

// Function to remove duplicate stocks (keeps the first occurrence)
function removeDuplicateStocks() {
  db.all(`
    SELECT symbol, MIN(id) as keep_id, COUNT(*) as count
    FROM stocks
    WHERE symbol != '-'
    GROUP BY symbol
    HAVING COUNT(*) > 1
  `, [], (err, duplicates) => {
    if (err) {
      console.error('Error finding duplicates:', err);
      return;
    }
    
    if (duplicates.length > 0) {
      console.log(`Found ${duplicates.length} duplicate symbols, removing...`);
      
      duplicates.forEach(dup => {
        db.run(`
          DELETE FROM stocks 
          WHERE symbol = ? AND id != ?
        `, [dup.symbol, dup.keep_id], (err) => {
          if (err) {
            console.error(`Error removing duplicates for ${dup.symbol}:`, err);
          } else {
            console.log(`✓ Removed ${dup.count - 1} duplicate(s) of ${dup.symbol}`);
          }
        });
      });
    } else {
      console.log('No duplicate stocks found');
    }
  });
}

// Create stocks table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT UNIQUE,
    weight TEXT,
    company TEXT,
    allocation TEXT,
    shares TEXT,
    share_price TEXT,
    broker TEXT,
    risk TEXT,
    sector TEXT
  )
`, (err) => {
  if (err) {
    console.error('Error creating stocks table:', err);
  } else {
    // Add sector column if it doesn't exist (for existing databases)
    db.run(`ALTER TABLE stocks ADD COLUMN sector TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Error adding sector column:', err);
      } else if (!err) {
        console.log('✓ Added sector column to stocks table');
      }
    });
    
    // Check if table is empty and import data if needed
    db.get('SELECT COUNT(*) as count FROM stocks', [], (err, row) => {
      if (!err && row.count === 0) {
        console.log('Stocks table is empty, importing data...');
        importData(db);
      } else {
        // Remove duplicates on startup
        removeDuplicateStocks();
      }
    });
  }
});

// Create deposits table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    count INTEGER,
    date TEXT,
    amount TEXT,
    account TEXT,
    month TEXT
  )
`, (err) => {
  if (err) {
    console.error('Error creating deposits table:', err);
  } else {
    console.log('Deposits table ready');
  }
});

// Create dividends table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS dividends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    annual_dividend REAL NOT NULL
  )
`, (err) => {
  if (err) {
    console.error('Error creating dividends table:', err);
  } else {
    console.log('Dividends table ready');
  }
});

// Create performance_snapshots table for tracking portfolio performance over time
db.run(`
  CREATE TABLE IF NOT EXISTS performance_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    portfolio_percent REAL NOT NULL,
    deposits_percent REAL NOT NULL,
    sp500_percent REAL NOT NULL,
    bet_percent REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('Error creating performance_snapshots table:', err);
  } else {
    console.log('Performance snapshots table ready');
  }
});

// Create baseline table to store initial values (T0)
db.run(`
  CREATE TABLE IF NOT EXISTS performance_baseline (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    timestamp INTEGER NOT NULL,
    portfolio_balance REAL NOT NULL,
    total_deposits REAL NOT NULL,
    sp500_price REAL NOT NULL,
    bet_price REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('Error creating performance_baseline table:', err);
  } else {
    console.log('Performance baseline table ready');
  }
});

// Create ETF sectors table
db.run(`
  CREATE TABLE IF NOT EXISTS etf_sectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    isin TEXT NOT NULL,
    etf_name TEXT,
    sector_name TEXT NOT NULL,
    percentage REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('Error creating etf_sectors table:', err);
  } else {
    console.log('ETF sectors table ready');
    
    // Check if table is empty and populate with data
    db.get('SELECT COUNT(*) as count FROM etf_sectors', [], (err, row) => {
      if (!err && row.count === 0) {
        console.log('Populating ETF sectors data...');
        populateETFSectors();
      }
    });
  }
});

// Create ETF countries table
db.run(`
  CREATE TABLE IF NOT EXISTS etf_countries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    isin TEXT NOT NULL,
    etf_name TEXT,
    country_name TEXT NOT NULL,
    percentage REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('Error creating etf_countries table:', err);
  } else {
    console.log('ETF countries table ready');
    
    // Check if table is empty and populate with data
    db.get('SELECT COUNT(*) as count FROM etf_countries', [], (err, row) => {
      if (!err && row.count === 0) {
        console.log('Populating ETF countries data...');
        populateETFCountries();
      }
    });
  }
});

// Function to populate ETF sectors data
function populateETFSectors() {
  const etfSectorsData = [
    // IE00B8GKDB10 - Vanguard FTSE All-World High Dividend Yield
    { isin: 'IE00B8GKDB10', name: 'Vanguard FTSE All-World High Dividend Yield', sectors: [
      { name: 'Financials', pct: 28.06 }, { name: 'Industrials', pct: 11.47 }, { name: 'Health Care', pct: 10.01 },
      { name: 'Consumer Staples', pct: 8.88 }, { name: 'Energy', pct: 7.84 }, { name: 'Consumer Discretionary', pct: 7.43 },
      { name: 'Information Technology', pct: 6.91 }, { name: 'Materials', pct: 6.31 }, { name: 'Communication Services', pct: 4.90 },
      { name: 'Utilities', pct: 4.28 }, { name: 'Real Estate', pct: 3.91 }
    ]},
    // IE00B3RBWM25 - Vanguard FTSE All-World
    { isin: 'IE00B3RBWM25', name: 'Vanguard FTSE All-World', sectors: [
      { name: 'Technology', pct: 27.70 }, { name: 'Financials', pct: 15.33 }, { name: 'Consumer Discretionary', pct: 10.62 },
      { name: 'Industrials', pct: 9.96 }, { name: 'Health Care', pct: 9.21 }, { name: 'Consumer Staples', pct: 7.09 },
      { name: 'Communication Services', pct: 6.40 }, { name: 'Energy', pct: 4.67 }, { name: 'Materials', pct: 3.71 },
      { name: 'Utilities', pct: 2.27 }, { name: 'Real Estate', pct: 2.04 }
    ]},
    // NL0011683594 - VanEck Morningstar Developed Markets Dividend Leaders
    { isin: 'NL0011683594', name: 'VanEck Morningstar Developed Markets Dividend Leaders', sectors: [
      { name: 'Financials', pct: 40.92 }, { name: 'Health Care', pct: 16.27 }, { name: 'Utilities', pct: 8.16 },
      { name: 'Energy', pct: 8.10 }, { name: 'Communication Services', pct: 7.00 }, { name: 'Consumer Staples', pct: 6.18 },
      { name: 'Materials', pct: 5.42 }, { name: 'Industrials', pct: 4.14 }, { name: 'Real Estate', pct: 2.81 }
    ]},
    // IE000M7V94E1 - VanEck Uranium and Nuclear Technologies
    { isin: 'IE000M7V94E1', name: 'VanEck Uranium and Nuclear Technologies', sectors: [
      { name: 'Energy', pct: 38.52 }, { name: 'Industrials', pct: 31.61 }, { name: 'Financials', pct: 5.06 },
      { name: 'Technology', pct: 1.00 }, { name: 'Materials', pct: 23.81 }
    ]},
    // IE000OJ5TQP4 - HANetf Future of Defence
    { isin: 'IE000OJ5TQP4', name: 'HANetf Future of Defence', sectors: [
      { name: 'Industrials', pct: 61.28 }, { name: 'Technology', pct: 31.30 }, { name: 'Health Care', pct: 3.71 },
      { name: 'Communication Services', pct: 3.71 }
    ]},
    // IE00BYWQWR46 - VanEck Video Gaming and eSports
    { isin: 'IE00BYWQWR46', name: 'VanEck Video Gaming and eSports', sectors: [
      { name: 'Communication Services', pct: 69.40 }, { name: 'Consumer Discretionary', pct: 16.78 },
      { name: 'Technology', pct: 5.98 }, { name: 'Financials', pct: 7.84 }
    ]},
    // IE000YU9K6K2 - VanEck Space Innovators
    { isin: 'IE000YU9K6K2', name: 'VanEck Space Innovators', sectors: [
      { name: 'Communication Services', pct: 24.86 }, { name: 'Industrials', pct: 22.98 },
      { name: 'Technology', pct: 14.72 }, { name: 'Consumer Discretionary', pct: 37.44 }
    ]},
    // IE00B5BMR087 - iShares Core S&P 500
    { isin: 'IE00B5BMR087', name: 'iShares Core S&P 500', sectors: [
      { name: 'Technology', pct: 36.70 }, { name: 'Financials', pct: 10.94 }, { name: 'Consumer Discretionary', pct: 10.64 },
      { name: 'Communication Services', pct: 10.05 }, { name: 'Health Care', pct: 9.99 }, { name: 'Industrials', pct: 7.67 },
      { name: 'Consumer Staples', pct: 5.62 }, { name: 'Energy', pct: 3.39 }, { name: 'Utilities', pct: 2.33 },
      { name: 'Materials', pct: 1.99 }, { name: 'Real Estate', pct: 0.68 }
    ]},
    // IE00BGV5VN51 - Xtrackers Artificial Intelligence & Big Data
    { isin: 'IE00BGV5VN51', name: 'Xtrackers Artificial Intelligence & Big Data', sectors: [
      { name: 'Technology', pct: 67.65 }, { name: 'Communication Services', pct: 15.42 },
      { name: 'Financials', pct: 8.93 }, { name: 'Consumer Discretionary', pct: 4.70 }, { name: 'Industrials', pct: 3.30 }
    ]}
  ];

  const stmt = db.prepare('INSERT INTO etf_sectors (isin, etf_name, sector_name, percentage) VALUES (?, ?, ?, ?)');
  
  etfSectorsData.forEach(etf => {
    etf.sectors.forEach(sector => {
      stmt.run(etf.isin, etf.name, sector.name, sector.pct);
    });
  });
  
  stmt.finalize();
  console.log('✓ ETF sectors data populated');
}

// Function to populate ETF countries data
function populateETFCountries() {
  const etfCountriesData = [
    // IE00B8GKDB10 - Vanguard FTSE All-World High Dividend Yield
    { isin: 'IE00B8GKDB10', name: 'Vanguard FTSE All-World High Dividend Yield', countries: [
      { name: 'United States', pct: 38.43 }, { name: 'Japan', pct: 8.79 }, { name: 'United Kingdom', pct: 6.47 },
      { name: 'Switzerland', pct: 4.40 }, { name: 'Canada', pct: 4.09 }, { name: 'Australia', pct: 3.92 },
      { name: 'Germany', pct: 3.47 }, { name: 'France', pct: 3.42 }, { name: 'China', pct: 2.76 },
      { name: 'Taiwan', pct: 2.47 }, { name: 'South Korea', pct: 1.87 }, { name: 'Other', pct: 19.91 }
    ]},
    // IE00B3RBWM25 - Vanguard FTSE All-World
    { isin: 'IE00B3RBWM25', name: 'Vanguard FTSE All-World', countries: [
      { name: 'United States', pct: 59.18 }, { name: 'Japan', pct: 5.60 }, { name: 'China', pct: 3.36 },
      { name: 'United Kingdom', pct: 3.08 }, { name: 'Canada', pct: 2.86 }, { name: 'France', pct: 2.54 },
      { name: 'Switzerland', pct: 2.28 }, { name: 'Germany', pct: 2.08 }, { name: 'India', pct: 1.96 },
      { name: 'Australia', pct: 1.86 }, { name: 'Taiwan', pct: 1.77 }, { name: 'South Korea', pct: 1.41 },
      { name: 'Other', pct: 12.02 }
    ]},
    // NL0011683594 - VanEck Morningstar Developed Markets Dividend Leaders
    { isin: 'NL0011683594', name: 'VanEck Morningstar Developed Markets Dividend Leaders', countries: [
      { name: 'France', pct: 14.12 }, { name: 'United States', pct: 13.96 }, { name: 'United Kingdom', pct: 11.07 },
      { name: 'Italy', pct: 9.42 }, { name: 'Germany', pct: 8.23 }, { name: 'Spain', pct: 7.63 },
      { name: 'Switzerland', pct: 6.95 }, { name: 'Canada', pct: 5.49 }, { name: 'Japan', pct: 4.93 },
      { name: 'Australia', pct: 4.15 }, { name: 'Other', pct: 14.05 }
    ]},
    // IE000M7V94E1 - VanEck Uranium and Nuclear Technologies
    { isin: 'IE000M7V94E1', name: 'VanEck Uranium and Nuclear Technologies', countries: [
      { name: 'United States', pct: 31.31 }, { name: 'Canada', pct: 26.62 }, { name: 'Japan', pct: 20.36 },
      { name: 'South Korea', pct: 5.49 }, { name: 'France', pct: 5.45 }, { name: 'Kazakhstan', pct: 5.32 },
      { name: 'Australia', pct: 5.45 }
    ]},
    // IE000OJ5TQP4 - HANetf Future of Defence
    { isin: 'IE000OJ5TQP4', name: 'HANetf Future of Defence', countries: [
      { name: 'United States', pct: 56.83 }, { name: 'France', pct: 9.05 }, { name: 'United Kingdom', pct: 7.46 },
      { name: 'Germany', pct: 6.22 }, { name: 'Israel', pct: 4.20 }, { name: 'Japan', pct: 3.83 },
      { name: 'Italy', pct: 3.81 }, { name: 'South Korea', pct: 3.58 }, { name: 'Canada', pct: 2.78 },
      { name: 'Other', pct: 2.24 }
    ]},
    // IE00BYWQWR46 - VanEck Video Gaming and eSports
    { isin: 'IE00BYWQWR46', name: 'VanEck Video Gaming and eSports', countries: [
      { name: 'United States', pct: 29.00 }, { name: 'Japan', pct: 27.63 }, { name: 'China', pct: 9.86 },
      { name: 'Taiwan', pct: 6.24 }, { name: 'Poland', pct: 5.60 }, { name: 'South Korea', pct: 5.56 },
      { name: 'United Kingdom', pct: 5.12 }, { name: 'Sweden', pct: 4.92 }, { name: 'Australia', pct: 4.94 },
      { name: 'Other', pct: 1.13 }
    ]},
    // IE000YU9K6K2 - VanEck Space Innovators
    { isin: 'IE000YU9K6K2', name: 'VanEck Space Innovators', countries: [
      { name: 'United States', pct: 43.83 }, { name: 'South Korea', pct: 4.64 }, { name: 'Japan', pct: 4.21 },
      { name: 'Taiwan', pct: 3.98 }, { name: 'Luxembourg', pct: 11.03 }, { name: 'France', pct: 10.42 },
      { name: 'United Kingdom', pct: 8.50 }, { name: 'Canada', pct: 6.43 }, { name: 'Bermuda', pct: 6.96 }
    ]},
    // IE00B5BMR087 - iShares Core S&P 500
    { isin: 'IE00B5BMR087', name: 'iShares Core S&P 500', countries: [
      { name: 'United States', pct: 95.84 }, { name: 'Ireland', pct: 1.32 }, { name: 'Switzerland', pct: 1.04 },
      { name: 'United Kingdom', pct: 0.81 }, { name: 'Netherlands', pct: 0.53 }, { name: 'Other', pct: 0.46 }
    ]},
    // IE00BGV5VN51 - Xtrackers Artificial Intelligence & Big Data
    { isin: 'IE00BGV5VN51', name: 'Xtrackers Artificial Intelligence & Big Data', countries: [
      { name: 'United States', pct: 82.64 }, { name: 'South Korea', pct: 6.01 }, { name: 'Germany', pct: 3.59 },
      { name: 'China', pct: 1.50 }, { name: 'France', pct: 1.44 }, { name: 'Netherlands', pct: 1.40 },
      { name: 'Taiwan', pct: 1.26 }, { name: 'Israel', pct: 1.24 }, { name: 'Japan', pct: 0.92 }
    ]}
  ];

  const stmt = db.prepare('INSERT INTO etf_countries (isin, etf_name, country_name, percentage) VALUES (?, ?, ?, ?)');
  
  etfCountriesData.forEach(etf => {
    etf.countries.forEach(country => {
      stmt.run(etf.isin, etf.name, country.name, country.pct);
    });
  });
  
  stmt.finalize();
  console.log('✓ ETF countries data populated');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// API Routes

// Get all stocks
app.get('/api/stocks', (req, res) => {
  db.all('SELECT * FROM stocks', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Add new stock
app.post('/api/stocks', (req, res) => {
  const { symbol, weight, company, allocation, shares, share_price, broker, risk, sector } = req.body;
  
  // Check if symbol already exists
  db.get('SELECT id FROM stocks WHERE symbol = ?', [symbol], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (row) {
      res.status(409).json({ error: `Stock with symbol '${symbol}' already exists` });
      return;
    }
    
    // Insert new stock if no duplicate found
    db.run(
      `INSERT INTO stocks (symbol, weight, company, allocation, shares, share_price, broker, risk, sector)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [symbol, weight, company, allocation, shares, share_price, broker, risk, sector || null],
      function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({ id: this.lastID, ...req.body });
      }
    );
  });
});

// Update stock
app.put('/api/stocks/:id', (req, res) => {
  const { id } = req.params;
  const { symbol, weight, company, allocation, shares, share_price, broker, risk, sector } = req.body;
  
  // If only share_price is provided, update only that field
  if (Object.keys(req.body).length === 1 && share_price !== undefined) {
    db.run(
      `UPDATE stocks SET share_price = ? WHERE id = ?`,
      [share_price, id],
      function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({ id: parseInt(id), share_price });
      }
    );
  } else {
    // Full update - check for duplicate symbol (excluding current stock)
    if (symbol && symbol !== '-') {
      db.get('SELECT id FROM stocks WHERE symbol = ? AND id != ?', [symbol, id], (err, row) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        
        if (row) {
          res.status(409).json({ error: `Stock with symbol '${symbol}' already exists` });
          return;
        }
        
        // Perform update if no duplicate found
        db.run(
          `UPDATE stocks 
           SET symbol = ?, weight = ?, company = ?, allocation = ?, shares = ?, share_price = ?, broker = ?, risk = ?, sector = ?
           WHERE id = ?`,
          [symbol, weight, company, allocation, shares, share_price, broker, risk, sector, id],
          function(err) {
            if (err) {
              res.status(500).json({ error: err.message });
              return;
            }
            res.json({ id: parseInt(id), ...req.body });
          }
        );
      });
    } else {
      // No symbol check needed for empty or "-" symbols
      db.run(
        `UPDATE stocks 
         SET symbol = ?, weight = ?, company = ?, allocation = ?, shares = ?, share_price = ?, broker = ?, risk = ?, sector = ?
         WHERE id = ?`,
        [symbol, weight, company, allocation, shares, share_price, broker, risk, sector, id],
        function(err) {
          if (err) {
            res.status(500).json({ error: err.message });
            return;
          }
          res.json({ id: parseInt(id), ...req.body });
        }
      );
    }
  }
});

// Delete stock
app.delete('/api/stocks/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM stocks WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'Stock deleted successfully' });
  });
});

// Cache for exchange rates (refresh every 15 minutes)
let exchangeRatesCache = null;
let lastFetchTime = 0;

// Fetch RON rate from BNR (Romanian National Bank)
async function fetchBNRRate() {
  try {
    const response = await fetch('https://www.bnr.ro/nbrfxrates.xml');
    const xmlText = await response.text();
    
    // Parse XML to get EUR rate
    // Format: <Rate currency="EUR">5.0901</Rate>
    const eurMatch = xmlText.match(/<Rate currency="EUR">([0-9.]+)<\/Rate>/);
    if (eurMatch && eurMatch[1]) {
      const bnrRate = parseFloat(eurMatch[1]);
      // Add 0.09% markup to BNR rate (broker commission/spread)
      const adjustedRate = bnrRate * 1.0009;
      console.log(`📈 BNR rate: ${bnrRate.toFixed(4)} → Adjusted: ${adjustedRate.toFixed(4)} (+0.09%)`);
      return adjustedRate;
    }
    return null;
  } catch (error) {
    console.error('Error fetching BNR rate:', error);
    return null;
  }
}

// Fetch exchange rates
async function getExchangeRates() {
  const now = Date.now();
  // Refresh cache every 15 minutes (900000 ms)
  if (exchangeRatesCache && (now - lastFetchTime) < 900000) {
    return exchangeRatesCache;
  }
  
  try {
    // Using global fetch (Node 18+)
    
    // Fetch RON rate from BNR (official Romanian rate)
    const bnrRate = await fetchBNRRate();
    
    // Fetch USD rate from exchangerate-api.com
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/EUR');
    const data = await response.json();
    
    exchangeRatesCache = {
      USD: data.rates.USD || 1.16,
      GBP: data.rates.GBP || 0.86,
      RON: bnrRate || data.rates.RON || 5.09  // Priority: BNR > exchangerate-api > fallback
    };
    lastFetchTime = now;
    console.log('Exchange rates updated:', exchangeRatesCache);
    return exchangeRatesCache;
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    // Fallback rates if API fails
    return { USD: 1.16, RON: 5.09 };
  }
}

// Endpoint to get exchange rates
app.get('/api/exchange-rates', async (req, res) => {
  try {
    const rates = await getExchangeRates();
    res.json(rates);
  } catch (error) {
    console.error('Error getting exchange rates:', error);
    res.status(500).json({ error: error.message });
  }
});

// Try alternative symbol formats for German stocks
function tryAlternativeSymbols(symbol) {
  const alternatives = [];
  
  if (symbol.endsWith('.DE')) {
    const base = symbol.replace('.DE', '');
    alternatives.push(
      symbol,           // Original: XXX.DE
      `${base}.F`,      // Frankfurt: XXX.F
      `${base}.XETRA`,  // XETRA: XXX.XETRA
      base              // Just ticker: XXX
    );
  } else {
    // Special-case UK tickers
    if (symbol.toUpperCase() === 'PREM') {
      alternatives.push('PREM.L', 'PREM');
    } else {
      alternatives.push(symbol);
    }
  }
  
  return alternatives;
}

// Proxy endpoint for fetching stock prices
app.get('/api/stock-price/:symbol', async (req, res) => {
  const { symbol } = req.params;
  
  try {
    // Using global fetch (Node 18+)
    // Special handling for PREM and PREM.L from LSE (price in pence "p")
    if (symbol.toUpperCase() === 'PREM' || symbol.toUpperCase() === 'PREM.L') {
      try {
        const lseUrl = 'https://www.lse.co.uk/SharePrice.html?shareprice=PREM&share=Premier-african-minerals';
        const htmlResp = await fetch(lseUrl);
        const html = await htmlResp.text();
        // Try to find a price like 0.0575p (allow variations with spaces)
        // Prefer a tighter context: look near "share-price" container
        let match = html.match(/([0-9]+\.?[0-9]*)\s*p\b/i);
        if (match && match[1]) {
          const pence = parseFloat(match[1]);
          const rates = await getExchangeRates();
          // Convert pence -> GBP -> EUR
          const gbp = pence / 100;
          const eur = gbp / (rates.GBP || 0.86);
          console.log(`PREM LSE scrape: pence=${pence}, GBP=${gbp.toFixed(6)}, EUR=${eur.toFixed(6)}, GBP rate=${rates.GBP}`);
          return res.json({ 
            price: eur.toFixed(6), 
            priceEUR: eur, 
            priceGBP: gbp, 
            priceGBp: pence,
            symbol: 'PREM.L', 
            originalSymbol: symbol, 
            originalCurrency: 'GBp' 
          });
        }
      } catch (err) {
        console.log('PREM LSE scrape failed, falling back to Yahoo:', err.message);
      }
    }
    const alternatives = tryAlternativeSymbols(symbol);
    
    console.log(`Fetching price for ${symbol}, trying alternatives:`, alternatives);
    
    // Try each alternative symbol
    for (const altSymbol of alternatives) {
      try {
        const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${altSymbol}`);
        const data = await response.json();
        
        if (data.chart && data.chart.result && data.chart.result[0]) {
          const meta = data.chart.result[0].meta;
          let price = meta.regularMarketPrice || meta.previousClose;
          const currency = meta.currency;
          let priceGBP = null;
          let priceGBp = null;
          
          console.log(`✓ Found data for ${altSymbol}: price=${price}, currency=${currency}`);
          
          // Convert to EUR if needed (skip conversion for crypto symbols ending with -USD)
          if (price && currency) {
            const isCrypto = symbol.endsWith('-USD') && (symbol.includes('JASMY') || symbol.includes('KAS') || symbol.match(/^[A-Z]{3,}-USD$/));
            const rates = await getExchangeRates();
            
            if (!isCrypto && currency === 'USD') {
              price = price / rates.USD;
            } else if (currency === 'RON') {
              price = price / rates.RON;
            } else if (currency === 'GBP') {
              // GBP to EUR
              priceGBP = price; // keep GBP for UI display
              price = price / (rates.GBP || 0.86);
            } else if (currency === 'GBp') {
              // London prices in pence: convert to GBP then to EUR
              if (Number.isFinite(price) && price > 0) {
                const gbpPrice = price / 100;
                priceGBP = gbpPrice; // keep GBP for UI display
                priceGBp = price;    // original pence
                price = gbpPrice / (rates.GBP || 0.86);
              } else {
                // Yahoo returned invalid pence; try LSE scrape fallback
                try {
                  const lseUrl = 'https://www.lse.co.uk/SharePrice.html?shareprice=PREM&share=Premier-african-minerals';
                  const htmlResp = await fetch(lseUrl);
                  const html = await htmlResp.text();
                  const m = html.match(/([0-9]+\.?[0-9]*)\s*p\b/i);
                  if (m && m[1]) {
                    const pence = parseFloat(m[1]);
                    const gbp = pence / 100;
                    priceGBP = gbp;
                    priceGBp = pence;
                    price = gbp / (rates.GBP || 0.86);
                    console.log(`Yahoo GBp was invalid; LSE fallback used: pence=${pence}, GBP=${gbp}`);
                  }
                } catch (e) {
                  console.warn('GBp invalid and LSE fallback failed:', e.message);
                }
              }
            }
            console.log(`Converted ${altSymbol}: EUR price=${price}, rates=${JSON.stringify(rates)}`);
            // Guard: skip invalid/zero price
            if (Number.isFinite(price) && price > 0) {
              return res.json({ 
                price: price.toFixed(isCrypto ? 6 : 2), 
                priceEUR: price, 
                priceGBP: priceGBP, 
                priceGBp: priceGBp,
                symbol: altSymbol,
                originalSymbol: symbol,
                originalCurrency: currency,
                isCrypto: isCrypto
              });
            } else {
              console.warn(`Ignored non-finite/zero price from Yahoo for ${altSymbol}:`, price);
            }
          }
        }
      } catch (err) {
        console.log(`✗ Failed to fetch ${altSymbol}:`, err.message);
      }
    }
    
    // If all alternatives failed, return error
    console.log(`No price data available for ${symbol} or its alternatives`);
    res.status(404).json({ error: 'Price data not available for this symbol' });
    
  } catch (error) {
    console.error(`Error fetching stock price for ${symbol}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Fetch historical data for indices
app.get('/api/historical/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { range } = req.query;
  
  try {
    // Using global fetch (Node 18+)
    
    // Map range to Yahoo Finance parameters
    const rangeMap = {
      '1h': { interval: '1m', range: '1d' },
      '1d': { interval: '1h', range: '1d' },
      '1w': { interval: '1d', range: '5d' },
      '1m': { interval: '1d', range: '1mo' },
      '6m': { interval: '1d', range: '6mo' },
      'ytd': { interval: '1d', range: 'ytd' },
      '1y': { interval: '1d', range: '1y' },
      '5y': { interval: '1wk', range: '5y' },
      'max': { interval: '1mo', range: 'max' }
    };
    
    const params = rangeMap[range] || rangeMap['1m'];
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${params.interval}&range=${params.range}`;
    
    console.log(`Fetching historical data for ${symbol}, range: ${range}`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.chart && data.chart.result && data.chart.result[0]) {
      const result = data.chart.result[0];
      const timestamps = result.timestamp;
      const quotes = result.indicators.quote[0];
      const prices = quotes.close;
      
      // Filter out null values and create data points
      const historicalData = timestamps
        .map((timestamp, index) => ({
          timestamp: timestamp * 1000, // Convert to milliseconds
          price: prices[index]
        }))
        .filter(point => point.price !== null);
      
      console.log(`✓ Fetched ${historicalData.length} data points for ${symbol}`);
      
      res.json({
        symbol,
        range,
        data: historicalData
      });
    } else {
      res.status(404).json({ error: 'No historical data available' });
    }
    
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// ========== PERFORMANCE SNAPSHOTS ENDPOINTS ==========

// Save a performance snapshot with percentage calculations
app.post('/api/performance-snapshot', async (req, res) => {
  const { portfolio_balance, total_deposits } = req.body;
  
  try {
    const timestamp = Date.now();
    
    // Fetch current prices for indices
    let sp500Price = null;
    let betPrice = null;
    
    try {
      const sp500Response = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/^GSPC');
      const sp500Data = await sp500Response.json();
      if (sp500Data.chart?.result?.[0]) {
        sp500Price = sp500Data.chart.result[0].meta.regularMarketPrice || sp500Data.chart.result[0].meta.previousClose;
      }
    } catch (err) {
      console.log('Could not fetch S&P 500 price:', err.message);
    }
    
    try {
      const betResponse = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/^BET-TRN.RO');
      const betData = await betResponse.json();
      if (betData.chart?.result?.[0]) {
        betPrice = betData.chart.result[0].meta.regularMarketPrice || betData.chart.result[0].meta.previousClose;
      }
    } catch (err) {
      console.log('Could not fetch BET-TR price:', err.message);
    }

    // Check if baseline exists
    db.get('SELECT * FROM performance_baseline WHERE id = 1', [], (err, baseline) => {
      if (err) {
        console.error('Error checking baseline:', err);
        res.status(500).json({ error: err.message });
        return;
      }

      // If no baseline exists, create it (T0)
      if (!baseline) {
        db.run(
          `INSERT INTO performance_baseline (id, timestamp, portfolio_balance, total_deposits, sp500_price, bet_price)
           VALUES (1, ?, ?, ?, ?, ?)`,
          [timestamp, portfolio_balance, total_deposits, sp500Price, betPrice],
          function(err) {
            if (err) {
              console.error('Error creating baseline:', err);
              res.status(500).json({ error: err.message });
              return;
            }
            
            console.log(`✅ Created baseline (T0): Portfolio=${portfolio_balance}€, Deposits=${total_deposits}€, S&P=${sp500Price}, BET=${betPrice}`);
            
            // First snapshot is always 0% for everything
            db.run(
              `INSERT INTO performance_snapshots (timestamp, portfolio_balance, portfolio_percent, deposits_percent, sp500_percent, bet_percent)
               VALUES (?, ?, 0, 0, 0, 0)`,
              [timestamp, portfolio_balance],
              function(err) {
                if (err) {
                  console.error('Error saving first snapshot:', err);
                  res.status(500).json({ error: err.message });
                  return;
                }
                res.json({
                  id: this.lastID,
                  timestamp,
                  portfolio_percent: 0,
                  deposits_percent: 0,
                  sp500_percent: 0,
                  bet_percent: 0,
                  is_baseline: true
                });
              }
            );
          }
        );
      } else {
        // Calculate percentages based on baseline (keep full precision)
        const portfolioPercent = baseline.portfolio_balance > 0 
          ? ((portfolio_balance - baseline.portfolio_balance) / baseline.portfolio_balance) * 100 
          : 0;
        
        const depositsPercent = baseline.total_deposits > 0 
          ? ((total_deposits - baseline.total_deposits) / baseline.total_deposits) * 100 
          : 0;
        
        const sp500Percent = (baseline.sp500_price > 0 && sp500Price) 
          ? ((sp500Price - baseline.sp500_price) / baseline.sp500_price) * 100 
          : 0;
        
        const betPercent = (baseline.bet_price > 0 && betPrice) 
          ? ((betPrice - baseline.bet_price) / baseline.bet_price) * 100 
          : 0;

        // Save percentages to database with full precision
        db.run(
          `INSERT INTO performance_snapshots (timestamp, portfolio_balance, portfolio_percent, deposits_percent, sp500_percent, bet_percent)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [timestamp, portfolio_balance, portfolioPercent, depositsPercent, sp500Percent, betPercent],
          function(err) {
            if (err) {
              console.error('Error saving snapshot:', err);
              res.status(500).json({ error: err.message });
              return;
            }
            
            console.log(`✅ Snapshot saved: Portfolio=${portfolioPercent.toFixed(4)}%, Deposits=${depositsPercent.toFixed(4)}%, S&P=${sp500Percent.toFixed(4)}%, BET=${betPercent.toFixed(4)}%`);
            res.json({
              id: this.lastID,
              timestamp,
              portfolio_percent: portfolioPercent,
              deposits_percent: depositsPercent,
              sp500_percent: sp500Percent,
              bet_percent: betPercent
            });
          }
        );
      }
    });
  } catch (error) {
    console.error('Error saving performance snapshot:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get performance snapshots for a time range
app.get('/api/performance-snapshots', (req, res) => {
  const { range } = req.query;
  
  // Calculate time range in milliseconds
  const now = Date.now();
  let startTime = 0;
  
  switch(range) {
    case '1h': startTime = now - 3600000; break;
    case '1d': startTime = now - 86400000; break;
    case '1w': startTime = now - 604800000; break;
    case '1m': startTime = now - 2592000000; break;
    case '6m': startTime = now - 15552000000; break;
    case '1y': startTime = now - 31536000000; break;
    case '5y': startTime = now - 157680000000; break;
    case 'ytd': 
      const yearStart = new Date(new Date().getFullYear(), 0, 1);
      startTime = yearStart.getTime();
      break;
    case 'max': 
      startTime = 0; 
      break;
    default: 
      startTime = now - 2592000000; // Default 1 month
  }
  
  db.all(
    'SELECT * FROM performance_snapshots WHERE timestamp >= ? ORDER BY timestamp ASC',
    [startTime],
    (err, rows) => {
      if (err) {
        console.error('Error fetching snapshots:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`📊 Retrieved ${rows.length} snapshots for range: ${range}`);
      res.json({ range, snapshots: rows });
    }
  );
});

// Delete a single snapshot
app.delete('/api/performance-snapshot/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM performance_snapshots WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('Error deleting snapshot:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    console.log(`🗑️ Deleted snapshot #${id}`);
    res.json({ message: 'Snapshot deleted', deleted: this.changes });
  });
});

// Delete old snapshots (before specified timestamp)
app.delete('/api/performance-snapshots/delete-old', (req, res) => {
  const { before } = req.query;
  
  db.run('DELETE FROM performance_snapshots WHERE timestamp < ?', [before], function(err) {
    if (err) {
      console.error('Error deleting old snapshots:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    console.log(`🗑️ Deleted ${this.changes} old snapshots`);
    res.json({ message: 'Old snapshots deleted', deleted: this.changes });
  });
});

// Delete all snapshots
app.delete('/api/performance-snapshots/delete-all', (req, res) => {
  db.run('DELETE FROM performance_snapshots', [], function(err) {
    if (err) {
      console.error('Error deleting all snapshots:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    console.log(`🗑️ Deleted all ${this.changes} snapshots`);
    res.json({ message: 'All snapshots deleted', deleted: this.changes });
  });
});

// Delete snapshots by ID range
app.delete('/api/performance-snapshots/delete-range', (req, res) => {
  const { from, to } = req.query;
  
  if (!from || !to) {
    res.status(400).json({ error: 'Both from and to parameters are required' });
    return;
  }
  
  const fromId = parseInt(from);
  const toId = parseInt(to);
  
  if (isNaN(fromId) || isNaN(toId) || fromId > toId) {
    res.status(400).json({ error: 'Invalid ID range' });
    return;
  }
  
  db.run('DELETE FROM performance_snapshots WHERE id >= ? AND id <= ?', [fromId, toId], function(err) {
    if (err) {
      console.error('Error deleting snapshot range:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    console.log(`🗑️ Deleted ${this.changes} snapshots (IDs ${fromId} to ${toId})`);
    res.json({ message: `Snapshots deleted (IDs ${fromId} to ${toId})`, deleted: this.changes });
  });
});

// Reset baseline (T0) to current values
app.post('/api/performance-baseline/reset', async (req, res) => {
  const { portfolio_balance, total_deposits } = req.body;
  
  try {
    const fetch = fetchFn;
    const timestamp = Date.now();
    
    // Fetch current prices for indices
    let sp500Price = null;
    let betPrice = null;
    
    try {
      const sp500Response = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/^GSPC');
      const sp500Data = await sp500Response.json();
      if (sp500Data.chart?.result?.[0]) {
        sp500Price = sp500Data.chart.result[0].meta.regularMarketPrice || sp500Data.chart.result[0].meta.previousClose;
      }
    } catch (err) {
      console.log('Could not fetch S&P 500 price:', err.message);
    }
    
    try {
      const betResponse = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/^BET-TRN.RO');
      const betData = await betResponse.json();
      if (betData.chart?.result?.[0]) {
        betPrice = betData.chart.result[0].meta.regularMarketPrice || betData.chart.result[0].meta.previousClose;
      }
    } catch (err) {
      console.log('Could not fetch BET-TR price:', err.message);
    }

    // Update baseline with current values
    db.run(
      `UPDATE performance_baseline 
       SET timestamp = ?, portfolio_balance = ?, total_deposits = ?, sp500_price = ?, bet_price = ?, created_at = datetime('now')
       WHERE id = 1`,
      [timestamp, portfolio_balance, total_deposits, sp500Price, betPrice],
      function(err) {
        if (err) {
          console.error('Error resetting baseline:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        
        console.log(`🔄 RESET BASELINE (T0): Portfolio=${portfolio_balance}€, Deposits=${total_deposits}€, S&P=${sp500Price}, BET=${betPrice}`);
        
        // Create a new snapshot at 0% (new starting point)
        db.run(
          `INSERT INTO performance_snapshots (timestamp, portfolio_balance, portfolio_percent, deposits_percent, sp500_percent, bet_percent)
           VALUES (?, ?, 0, 0, 0, 0)`,
          [timestamp, portfolio_balance],
          function(err) {
            if (err) {
              console.error('Error saving new T0 snapshot:', err);
              res.status(500).json({ error: err.message });
              return;
            }
            res.json({
              message: 'Baseline reset successfully',
              new_baseline: {
                timestamp,
                portfolio_balance,
                total_deposits,
                sp500_price: sp500Price,
                bet_price: betPrice
              },
              snapshot_id: this.lastID
            });
          }
        );
      }
    );
  } catch (error) {
    console.error('Error in reset baseline:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== DEPOSITS ENDPOINTS ==========

// Get all deposits
app.get('/api/deposits', (req, res) => {
  db.all('SELECT * FROM deposits ORDER BY id', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Add new deposit
app.post('/api/deposits', (req, res) => {
  const { count, date, amount, account, month } = req.body;
  db.run(
    `INSERT INTO deposits (count, date, amount, account, month) VALUES (?, ?, ?, ?, ?)`,
    [count, date, amount, account, month],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, ...req.body });
    }
  );
});

// Update deposit
app.put('/api/deposits/:id', (req, res) => {
  const { id } = req.params;
  const { count, date, amount, account, month } = req.body;
  db.run(
    `UPDATE deposits 
     SET count = ?, date = ?, amount = ?, account = ?, month = ?
     WHERE id = ?`,
    [count, date, amount, account, month, id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: parseInt(id), ...req.body });
    }
  );
});

// Delete deposit
app.delete('/api/deposits/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM deposits WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'Deposit deleted successfully' });
  });
});

// ========== ALLOCATION ENDPOINTS ==========

// Helper function to map trading symbols to ISINs
function getISINFromSymbol(symbol) {
  const symbolToISIN = {
    'VGWD.DE': 'IE00B8GKDB10',  // Vanguard FTSE All-World High Dividend Yield
    'VGWL.DE': 'IE00B3RBWM25',  // Vanguard FTSE All-World
    'VDIV.DE': 'NL0011683594',  // VanEck Morningstar Developed Markets Dividend Leaders
    'NUKL.DE': 'IE000M7V94E1',  // VanEck Uranium and Nuclear Technologies
    'DFNS.UK': 'IE000OJ5TQP4',  // HANetf Future of Defence
    'ESP0.DE': 'IE00BYWQWR46',  // VanEck Video Gaming and eSports
    'JEDI.DE': 'IE000YU9K6K2',  // VanEck Space Innovators
    'SXR8.DE': 'IE00B5BMR087',  // iShares Core S&P 500
    'XAIX.DE': 'IE00B5BMR087',  // iShares Core S&P 500 (alternative)
    'ASWC.DE': 'IE00BGV5VN51'   // Xtrackers Artificial Intelligence & Big Data
  };
  return symbolToISIN[symbol] || null;
}

// Helper function to map sector names
function normalizeSectorName(sectorName) {
  const sectorMapping = {
    'Information Technology': 'Technology',
    'Telecommunication': 'Communication Services',
    'Health Care': 'Healthcare'
  };
  return sectorMapping[sectorName] || sectorName;
}

// Get weighted sector allocation
app.get('/api/allocation/sectors', (req, res) => {
  // Step 1: Get all stocks from portfolio
  db.all('SELECT * FROM stocks', [], (err, stocks) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const sectorAllocation = {};
    let processedStocks = 0;
    
    stocks.forEach(stock => {
      // Parse weight percentage (e.g., "8.79%" -> 8.79)
      const weight = parseFloat(stock.weight.toString().replace(/%/g, ''));
      
      // Check if stock is an ETF (by ISIN pattern or sector starting with 'ETF')
      const isETF = stock.sector && stock.sector.startsWith('ETF');
      
      if (isETF) {
        // For ETFs, get their sector breakdown and calculate weighted allocation
        const isin = getISINFromSymbol(stock.symbol);
        
        if (isin) {
          db.all('SELECT * FROM etf_sectors WHERE isin = ?', [isin], (err, sectors) => {
            if (!err && sectors && sectors.length > 0) {
              sectors.forEach(sector => {
                const weightedAllocation = weight * (sector.percentage / 100);
                const normalizedSector = normalizeSectorName(sector.sector_name);
                
                if (!sectorAllocation[normalizedSector]) {
                  sectorAllocation[normalizedSector] = 0;
                }
                sectorAllocation[normalizedSector] += weightedAllocation;
              });
            }
            
            processedStocks++;
            if (processedStocks === stocks.length) {
              sendSectorResponse();
            }
          });
        } else {
          // If ISIN not found, skip this ETF
          processedStocks++;
          if (processedStocks === stocks.length) {
            sendSectorResponse();
          }
        }
      } else {
        // For individual stocks, add directly to their sector
        const stockSector = stock.sector || 'Other';
        if (!sectorAllocation[stockSector]) {
          sectorAllocation[stockSector] = 0;
        }
        sectorAllocation[stockSector] += weight;
        
        processedStocks++;
        if (processedStocks === stocks.length) {
          sendSectorResponse();
        }
      }
    });
    
    function sendSectorResponse() {
      // Calculate total to normalize to 100%
      const total = Object.values(sectorAllocation).reduce((sum, val) => sum + val, 0);
      
      // Convert to array, normalize to 100%, and sort by percentage
      const sectorArray = Object.keys(sectorAllocation).map(sector => ({
        name: sector,
        percentage: parseFloat(((sectorAllocation[sector] / total) * 100).toFixed(2))
      })).sort((a, b) => b.percentage - a.percentage);
      
      res.json(sectorArray);
    }
    
    // If no stocks, return empty array
    if (stocks.length === 0) {
      res.json([]);
    }
  });
});

// Get weighted country allocation
app.get('/api/allocation/countries', (req, res) => {
  // Step 1: Get all stocks from portfolio
  db.all('SELECT * FROM stocks', [], (err, stocks) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const countryAllocation = {};
    let processedStocks = 0;
    
    stocks.forEach(stock => {
      // Parse weight percentage (e.g., "8.79%" -> 8.79)
      const weight = parseFloat(stock.weight.toString().replace(/%/g, ''));
      
      // Check if stock is an ETF
      const isETF = stock.sector && stock.sector.startsWith('ETF');
      
      if (isETF) {
        // For ETFs, get their country breakdown and calculate weighted allocation
        const isin = getISINFromSymbol(stock.symbol);
        
        if (isin) {
          db.all('SELECT * FROM etf_countries WHERE isin = ?', [isin], (err, countries) => {
            if (!err && countries && countries.length > 0) {
              countries.forEach(country => {
                const weightedAllocation = weight * (country.percentage / 100);
                const countryName = country.country_name;
                
                if (!countryAllocation[countryName]) {
                  countryAllocation[countryName] = 0;
                }
                countryAllocation[countryName] += weightedAllocation;
              });
            }
            
            processedStocks++;
            if (processedStocks === stocks.length) {
              sendCountryResponse();
            }
          });
        } else {
          // If ISIN not found, skip this ETF
          processedStocks++;
          if (processedStocks === stocks.length) {
            sendCountryResponse();
          }
        }
      } else {
        // Skip Cash and Cryptocurrency sectors from country allocation (they don't belong to any country)
        if (stock.sector === 'Cash' || stock.sector === 'Cryptocurrency') {
          processedStocks++;
          if (processedStocks === stocks.length) {
            sendCountryResponse();
          }
          return;
        }
        
        // For individual stocks, determine country based on symbol
        let country = 'United States'; // Default
        if (stock.symbol.endsWith('.RO')) {
          country = 'Romania';
        }
        
        if (!countryAllocation[country]) {
          countryAllocation[country] = 0;
        }
        countryAllocation[country] += weight;
        
        processedStocks++;
        if (processedStocks === stocks.length) {
          sendCountryResponse();
        }
      }
    });
    
    function sendCountryResponse() {
      // Calculate total to normalize to 100%
      const total = Object.values(countryAllocation).reduce((sum, val) => sum + val, 0);
      
      // Convert to array, normalize to 100%, and sort by percentage
      const countryArray = Object.keys(countryAllocation).map(country => ({
        name: country,
        percentage: parseFloat(((countryAllocation[country] / total) * 100).toFixed(2))
      })).sort((a, b) => b.percentage - a.percentage);
      
      res.json(countryArray);
    }
    
    // If no stocks, return empty array
    if (stocks.length === 0) {
      res.json([]);
    }
  });
});

    // ================= Real-Time Quotes Endpoint (60s cache) =================
    let cachedQuotes = null;
    let lastQuotesFetch = 0;
    const QUOTES_CACHE_MS = 60000; // 60 seconds

    app.get('/api/quotes', async (req, res) => {
      try {
        const now = Date.now();
        if (cachedQuotes && (now - lastQuotesFetch) < QUOTES_CACHE_MS) {
          return res.json({ cached: true, data: cachedQuotes, ts: lastQuotesFetch });
        }

        // Load all symbols from stocks table
        const symbols = await new Promise((resolve, reject) => {
          db.all('SELECT symbol FROM stocks', [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
          });
        });

        const filtered = symbols.filter(r => r.symbol && r.symbol.trim() !== '-' && !r.symbol.toLowerCase().includes('cash'));
        const quoteResults = [];

        for (const row of filtered) {
          const rawSymbol = row.symbol.trim();
          const yfSymbol = rawSymbol; // assume direct compatibility (e.g., TLV.RO, SXR8.DE, JASMY-USD)
          try {
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfSymbol)}?interval=1m&range=1d`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Bad response ${response.status}`);
            const data = await response.json();
            const result = data?.chart?.result?.[0];
            const meta = result?.meta;
            const current = meta?.regularMarketPrice || null;
            const previousClose = meta?.previousClose || null;
            let changePercent = null;
            if (current != null && previousClose != null && previousClose !== 0) {
              changePercent = ((current - previousClose) / previousClose) * 100;
            }
            quoteResults.push({ symbol: rawSymbol, current, previousClose, changePercent });
          } catch (err) {
            quoteResults.push({ symbol: rawSymbol, error: err.message });
          }
        }

        cachedQuotes = quoteResults;
        lastQuotesFetch = now;
        res.json({ cached: false, data: quoteResults, ts: now });
      } catch (error) {
        console.error('Error fetching quotes:', error);
        res.status(500).json({ error: 'Failed to fetch quotes' });
      }
    });

// ========== DIVIDENDS ENDPOINTS ==========

// Get all dividends
app.get('/api/dividends', (req, res) => {
  db.all('SELECT * FROM dividends ORDER BY year DESC', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Add new dividend
app.post('/api/dividends', (req, res) => {
  const { year, annual_dividend } = req.body;
  db.run(
    `INSERT INTO dividends (year, annual_dividend) VALUES (?, ?)`,
    [year, annual_dividend],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, ...req.body });
    }
  );
});

// Update dividend
app.put('/api/dividends/:id', (req, res) => {
  const { id } = req.params;
  const { year, annual_dividend } = req.body;
  db.run(
    `UPDATE dividends 
     SET year = ?, annual_dividend = ?
     WHERE id = ?`,
    [year, annual_dividend, id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: parseInt(id), ...req.body });
    }
  );
});

// Delete dividend
app.delete('/api/dividends/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM dividends WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'Dividend deleted successfully' });
  });
});

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const nextPort = port + 1;
      console.warn(`Port ${port} in use. Trying ${nextPort}...`);
      startServer(nextPort);
    } else {
      throw err;
    }
  });
}

startServer(PORT);

// Export data before process exits
process.on('SIGINT', async () => {
  console.log('\n📦 Backing up data before exit...');
  await exportData();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n📦 Backing up data before exit...');
  await exportData();
  process.exit(0);
});
