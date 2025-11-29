-- Cloudflare D1 initial schema for Portfolio app
BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS stocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL UNIQUE,
  weight REAL,
  company TEXT,
  allocation TEXT,
  shares REAL,
  share_price TEXT,
  broker TEXT,
  risk TEXT,
  sector TEXT
);

CREATE TABLE IF NOT EXISTS deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  count INTEGER,
  date TEXT,
  amount TEXT,
  account TEXT,
  month TEXT
);

CREATE TABLE IF NOT EXISTS performance_baseline (
  id INTEGER PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  portfolio_balance REAL,
  total_deposits REAL,
  sp500_price REAL,
  bet_price REAL
);

CREATE TABLE IF NOT EXISTS performance_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  portfolio_balance REAL,
  portfolio_percent REAL,
  deposits_percent REAL,
  sp500_percent REAL,
  bet_percent REAL
);

CREATE TABLE IF NOT EXISTS dividends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  annual_dividend REAL NOT NULL
);

COMMIT;