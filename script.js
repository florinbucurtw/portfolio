// JavaScript pentru aplicația web
console.log('Aplicația web este încărcată!');

// Available sectors list
const AVAILABLE_SECTORS = [
  'Agriculture',
  'Basic Materials',
  'Cash',
  'Communication Services',
  'Consumer Cyclical',
  'Consumer Defensive',
  'Cryptocurrency',
  'Energy',
  'ETF - All World',
  'ETF - Defense',
  'ETF - Dividend',
  'ETF - Nuclear Energy',
  'ETF - S&P 500',
  'ETF - Small Cap',
  'ETF - Technology',
  'Financial Services',
  'Healthcare',
  'Industrials',
  'Real Estate',
  'Space Industry',
  'Technology',
  'Utilities',
];

// Helper: format a numeric price with max 3 decimals, trimming trailing zeros
function formatMax3(value) {
  if (value == null || !isFinite(value)) return '-';
  let s = Number(value).toFixed(3); // always produce 3 decimals then trim
  // Remove trailing zeros and optional leftover decimal point
  s = s
    .replace(/\.0+$/, '')
    .replace(/(\.[0-9]*?)0+$/, '$1')
    .replace(/\.$/, '');
  return s;
}

// Navigation functionality
const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('.section');

navLinks.forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();

    // Remove active class from all links
    navLinks.forEach((l) => l.classList.remove('active'));

    // Add active class to clicked link
    link.classList.add('active');

    // Hide all sections
    sections.forEach((s) => s.classList.remove('active'));

    // Show selected section
    const section = link.getAttribute('data-section');
    const targetSection = document.getElementById(`${section}-section`);
    if (targetSection) {
      targetSection.classList.add('active');
      // When returning to Dashboard, render charts immediately
      if (section === 'dashboard') {
        setTimeout(() => {
          try { updateTotalBalance(); } catch {}
          try { updateBalancePieChart(); } catch {}
          try { updatePerformanceChart('1d'); } catch {}
        }, 0);
      }
    }
  });
});

// Add row functionality
const addRowBtn = document.getElementById('add-row-btn');
const floatingAddBtn = document.getElementById('floating-add-btn');
const refreshStocksBtn = document.getElementById('refresh-stocks-btn');
const exportStocksBtn = document.getElementById('export-stocks-btn');
const stocksTbody = document.getElementById('stocks-tbody');
let currentEditingRow = null;
const API_BASE = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
const API_URL = `${API_BASE}/api/stocks`;

// Optional Cloudflare Worker API override
(function attachApiBaseOverride() {
  if (typeof window === 'undefined') return;
  const override = window.API_BASE_OVERRIDE;
  if (!override || typeof override !== 'string' || !override.startsWith('http')) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      if (typeof input === 'string') {
        if (input.startsWith('/api/')) {
          return originalFetch(override + input, init);
        }
        if (input.startsWith(window.location.origin + '/api/')) {
          const suffix = input.slice(window.location.origin.length);
          return originalFetch(override + suffix, init);
        }
      } else if (input instanceof Request) {
        const reqUrl = input.url;
        if (reqUrl.startsWith(window.location.origin + '/api/')) {
          const suffix = reqUrl.slice(window.location.origin.length);
          const newUrl = override + suffix;
          const newReq = new Request(newUrl, input);
          return originalFetch(newReq, init);
        }
      }
    } catch (e) {
      console.warn('API_BASE_OVERRIDE fetch rewrite error', e);
    }
    return originalFetch(input, init);
  };
  console.log('API_BASE_OVERRIDE active:', override);
})();

// Floating button visibility based on scroll
function handleFloatingButtonVisibility() {
  if (!addRowBtn || !floatingAddBtn) return;

  const stocksSection = document.getElementById('stocks-section');
  if (!stocksSection || !stocksSection.classList.contains('active')) {
    floatingAddBtn.classList.remove('visible');
    return;
  }

  const btnRect = addRowBtn.getBoundingClientRect();
  const isVisible = btnRect.top >= 0 && btnRect.bottom <= window.innerHeight;

  if (!isVisible) {
    floatingAddBtn.classList.add('visible');
  } else {
    floatingAddBtn.classList.remove('visible');
  }
}

// Add scroll listener
window.addEventListener('scroll', handleFloatingButtonVisibility);
window.addEventListener('resize', handleFloatingButtonVisibility);

// Check visibility when switching sections
document.querySelectorAll('.nav-link').forEach((link) => {
  link.addEventListener('click', () => {
    setTimeout(handleFloatingButtonVisibility, 100);
  });
});

// Load data from database on page load
async function loadTableData() {
  try {
    const response = await fetch(API_URL);
    const stocks = await response.json().catch(() => []);
    stocks.forEach((stock) => {
      createRow(stock);
    });
    // Ensure dashboard charts render after initial table load
    updateTotalBalance();
    updateBalancePieChart();
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// Auto-refresh stock prices every 5 seconds
let autoRefreshInterval = null;

async function refreshStockPrices() {
  console.log('🔄 refreshStockPrices() called at', new Date().toLocaleTimeString());

  if (currentEditingRow) {
    // Skip refresh if user is editing
    console.log('⏸️ Skipping refresh - user is editing');
    return;
  }

  const rows = stocksTbody.querySelectorAll('tr[data-id]');

  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length === 0) continue;

    const symbol = cells[1].textContent.trim();
    // PREM / PREM.L: Treat like other symbols using Yahoo-only data
    if (symbol.toUpperCase() === 'PREM' || symbol.toUpperCase() === 'PREM.L') {
      try {
        const priceData = await fetchStockPrice(symbol);
        // Persist/display only if validated flag true and GBp present
        if (priceData && priceData.validated) {
          // Prefer GBP display; derive from GBp when present
          const shares = parseFloat(cells[5].textContent) || 0;
          let displayGBP = null;
          if (priceData.priceGBP != null && isFinite(priceData.priceGBP) && priceData.priceGBP > 0) {
            displayGBP = Number(priceData.priceGBP);
          } else if (priceData.priceGBp != null && isFinite(priceData.priceGBp) && priceData.priceGBp > 0) {
            displayGBP = Number(priceData.priceGBp) / 100;
          }
          if (!Number.isFinite(displayGBP) || displayGBP <= 0) {
            throw new Error('Invalid GBP for PREM');
          }
          cells[6].textContent = `£${formatMax3(displayGBP)}`;
          // Hardcode Broker and Risk for PREM
          cells[8].textContent = 'Trading 212';
          cells[10].textContent = 'High Risk';
          // Allocation: GBP→EUR using live FX
          try {
            const rates = await fetch(`${API_BASE}/api/exchange-rates`).then((r) => r.json());
            const gbpRate = rates.GBP || 0.86; // EUR per 1 GBP
            const priceEUR = displayGBP / gbpRate;
            if (shares > 0 && Number.isFinite(priceEUR)) {
              const allocation = shares * priceEUR;
              cells[4].textContent = `€${allocation.toFixed(2)}`;
            }
          } catch {}
          updateWeightForRow(row);
          const stockId = row.dataset.id;
          if (stockId) {
            // Persist full row fields like other symbols
            const payload = {
              symbol: 'PREM.L',
              // Correct column indices:
              // 0:number 1:symbol 2:weight 3:company 4:allocation 5:shares 6:share_price 7:price_change 8:broker 9:sector 10:risk
              company: cells[3].textContent.trim() || 'Premier African Minerals',
              weight: cells[2].textContent.trim() || '-',
              allocation: cells[4].textContent.trim() || '-',
              shares: cells[5].textContent.trim() || '0',
              share_price: cells[6].textContent.trim(),
              broker: 'Trading 212',
              risk: 'High Risk',
              sector: cells[9].textContent.trim() || 'Basic Materials',
            };
            await fetch(`${API_URL}/${stockId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
          }
        }
      } catch (e) {
        console.error('PREM backend fetch error:', e);
      }
      continue; // Skip rest for PREM
    }
    const broker = cells[7].textContent.trim();
    const sectorText = (cells[9].textContent || '').trim();
    const isCashSector = sectorText.toLowerCase() === 'cash';
    const symbolLower = symbol.toLowerCase();
    const isManualPrice =
      symbolLower.includes('bank deposit') ||
      broker === 'Bank Deposit' ||
      broker === 'Cash' ||
      isCashSector;

    // Only fetch price for non-manual stocks; handle manual (Cash/Bank) locally
    if (!isManualPrice && symbol && symbol !== '-') {
      try {
        const priceData = await fetchStockPrice(symbol);
        if (priceData) {
          // For PREM skip unvalidated interim prices
          if (
            (symbol.toUpperCase() === 'PREM' || symbol.toUpperCase() === 'PREM.L') &&
            !priceData.validated
          ) {
            console.warn('Skipping PREM unvalidated price (auto-refresh)', priceData);
            continue;
          }
          const isCrypto = !!priceData.isCrypto;
          const priceEUR = Number.parseFloat(priceData.priceEUR ?? priceData.price);
          const priceGBP = Number.parseFloat(priceData.priceGBP);
          const priceGBp = Number.parseFloat(priceData.priceGBp);

          // Display: prefer GBP (convert from GBp if needed) for UK micro-prices
          if (!isCrypto && Number.isFinite(priceGBp) && priceGBp > 0) {
            const gbpFromPence = priceGBp / 100;
            const decimalsGBP = gbpFromPence < 0.1 ? 6 : 4;
            cells[6].textContent = `£${formatMax3(gbpFromPence)}`;
          } else if (Number.isFinite(priceGBP) && priceGBP > 0 && !isCrypto) {
            const decimalsGBP = priceGBP < 0.1 ? 6 : 4;
            cells[6].textContent = `£${formatMax3(priceGBP)}`;
          } else if (Number.isFinite(priceEUR) && priceEUR > 0) {
            // For US stocks: display USD, keep allocation in EUR
            const originalCurrency = (priceData.originalCurrency || '').toUpperCase();
            const brokerText = (broker || '').toUpperCase();
            const brokerHintsUSD =
              brokerText.includes('XTB-USD') ||
              brokerText.includes('TRADING212') ||
              brokerText.includes('XTB USD');
            const isUSStock = !isCrypto && (originalCurrency === 'USD' || brokerHintsUSD);
            if (isUSStock) {
              try {
                const rates = await fetch(`${API_BASE}/api/exchange-rates`).then((r) => r.json());
                const usdPrice = priceEUR * (rates.USD || 1.16);
                const decimalsUSD = usdPrice < 0.1 ? 6 : 2;
                cells[6].textContent = `$${formatMax3(usdPrice)}`;
              } catch {
                const decimalsEUR = priceEUR < 0.1 ? 6 : 2;
                cells[6].textContent = `€${formatMax3(priceEUR)}`;
              }
            } else {
              // Non-US instruments: show EUR normally; crypto displayed in converted USD
              if (isCrypto) {
                try {
                  const rates = await fetch(`${API_BASE}/api/exchange-rates`).then((r) => r.json());
                  const usdRate = rates.USD || 1.16; // USD per 1 EUR
                  const usdPrice = priceEUR * usdRate;
                  cells[6].textContent = `$${formatMax3(usdPrice)}`;
                } catch {
                  // Fallback: still show underlying EUR value prefixed with $ (legacy behavior)
                  cells[6].textContent = `$${formatMax3(priceEUR)}`;
                }
              } else {
                const decimalsEUR = priceEUR < 0.1 ? 6 : 2;
                cells[6].textContent = `€${formatMax3(priceEUR)}`;
              }
            }
          } else {
            console.warn(`Skipping UI price update for ${symbol}: invalid/zero price`, priceData);
          }

          // Recalculate Allocation (always in EUR) from DISPLAYED price to avoid mismatches
          const shares = parseFloat(cells[5].textContent) || 0;
          const displayPrice = (cells[6].textContent || '').trim();
          let allocPriceEUR = null;
          try {
            const rates = await fetch(`${API_BASE}/api/exchange-rates`)
              .then((r) => r.json())
              .catch(() => ({ USD: 1.16, GBP: 0.86, RON: 4.95 }));
            const USD = rates.USD || 1.16;
            const GBP = rates.GBP || 0.86;
            const RON = rates.RON || 4.95;
            const num = parseFloat(displayPrice.replace(/[^0-9.\-]/g, '')) || 0;
            if (displayPrice.startsWith('$')) allocPriceEUR = num / USD;
            else if (displayPrice.startsWith('£')) allocPriceEUR = num / GBP;
            else if (/^GBX|^GBp|\bp\b/i.test(displayPrice)) allocPriceEUR = num / 100 / GBP;
            else if (/^RON/i.test(displayPrice)) allocPriceEUR = num / RON;
            else allocPriceEUR = num; // assume EUR if no symbol
          } catch {
            allocPriceEUR = Number.isFinite(priceEUR) ? priceEUR : null;
          }

          if (
            Number.isFinite(allocPriceEUR) &&
            allocPriceEUR > 0 &&
            Number.isFinite(shares) &&
            shares > 0
          ) {
            const allocation = shares * allocPriceEUR;
            cells[4].textContent = `€${allocation.toFixed(2)}`;
          }

          // Update weight
          updateWeightForRow(row);

          // Save updated price to database (in original currency)
          const stockId = row.dataset.id;
          if (stockId) {
            // Persist the displayed price with its currency
            let displayText = cells[6].textContent || '';
            await fetch(`${API_URL}/${stockId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ share_price: displayText }),
            });
          }
        }
      } catch (error) {
        console.error(`Error refreshing price for ${symbol}:`, error);
      }
    } else if (isManualPrice) {
      // Handle Cash/Bank Deposit: compute Allocation, adjust display for Cash
      const sector = cells[9].textContent.trim();
      const shares = parseFloat(cells[5].textContent) || 0;
      const priceTextRaw = (cells[6].textContent || '').trim();
      // Cash: Share Price should be shown in RON; Allocation in EUR
      if (sector === 'Cash') {
        try {
          const response = await fetch(`${API_BASE}/api/exchange-rates`);
          const rates = await response.json();
          const ronPerEur = rates.RON || 4.95; // EUR→RON
          // Extract numeric from either `RON xxx` or plain number
          const ronValue = parseFloat(priceTextRaw.replace(/[^0-9.\-]/g, '')) || 0;
          if (ronValue > 0) {
            // Ensure display shows RON
            cells[6].textContent = `RON ${ronValue.toFixed(2)}`;
            const priceEur = ronValue / ronPerEur;
            const allocation = shares * priceEur;
            cells[4].textContent = `€${allocation.toFixed(2)}`;
            updateWeightForRow(row);
          }
        } catch (e) {
          console.warn('Cash RON→EUR conversion failed during refresh:', e);
        }
      } else {
        // Bank Deposit: if price stored as EUR, allocation already fine; if RON, convert similar to edit path
        try {
          const response = await fetch(`${API_BASE}/api/exchange-rates`);
          const rates = await response.json();
          const ronPerEur = rates.RON || 4.95;
          const val = parseFloat(priceTextRaw.replace(/[^0-9.\-]/g, '')) || 0;
          if (val > 0) {
            // If display lacks currency, assume EUR as current behavior; else convert if tagged RON
            const isRon = /^RON\s*/i.test(priceTextRaw);
            const priceEur = isRon ? val / ronPerEur : val;
            const allocation = shares * priceEur;
            cells[4].textContent = `€${allocation.toFixed(2)}`;
            updateWeightForRow(row);
          }
        } catch {}
      }
    }
  }

  // Update total balance and chart
  updateTotalBalance();
  updateBalancePieChart();

  // Check if we should save snapshot (verify against database)
  await checkAndSaveSnapshot();
}

// ================== Price Change (Real-Time Quotes) ==================
async function fetchQuotesAndUpdate() {
  try {
    const response = await fetch('/api/quotes');
    const payload = await response.json();
    const quotes = payload.data || [];
    const rows = stocksTbody.querySelectorAll('tr');
    const symbolToRow = {};
    rows.forEach((r) => {
      const symCell = r.querySelector('td[data-field="symbol"]');
      if (symCell) symbolToRow[symCell.textContent.trim()] = r;
    });
    quotes.forEach((q) => {
      const row = symbolToRow[q.symbol];
      if (!row) return;
      const cell = row.querySelector('td[data-field="price_change"]');
      if (!cell) return;
      if (q.changePercent == null) {
        cell.textContent = '-';
        cell.style.color = '#888';
      } else {
        const val = q.changePercent;
        const sign = val > 0 ? '+' : '';
        cell.textContent = `${sign}${val.toFixed(2)}%`;
        cell.style.fontWeight = '600';
        if (val > 0) {
          cell.style.color = '#00c774';
        } else if (val < 0) {
          cell.style.color = '#ff4d4f';
        } else {
          cell.style.color = '#ccc';
        }
      }
    });
    console.log(`📈 Updated price change for ${quotes.length} symbols (cached=${payload.cached})`);
  } catch (err) {
    console.error('Error updating price change column:', err);
  }
}

function startPriceChangeUpdates() {
  fetchQuotesAndUpdate();
  setInterval(fetchQuotesAndUpdate, 60000); // every 60s
}

function startAutoRefresh() {
  // Clear any existing interval
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    console.log('🔄 Clearing existing auto-refresh interval');
  }

  console.log('▶️ Starting auto-refresh (60s interval)');

  // Start auto-refresh every 60 seconds
  autoRefreshInterval = setInterval(refreshStockPrices, 60000);
  console.log('✅ Auto-refresh started with interval ID:', autoRefreshInterval);
}

function stopAutoRefresh() {
  // DISABLED: Auto-refresh should NEVER stop to keep balance updated
  console.log('⚠️ stopAutoRefresh called but ignored - auto-refresh continues');
}

// Save new stock to database
async function addStockToDatabase(data) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
      if (response.status === 409) {
        alert(result.error || 'Stock with this symbol already exists');
      } else {
        console.error('Error adding stock:', result.error);
      }
      return null;
    }

    return result;
  } catch (error) {
    console.error('Error adding stock:', error);
    return null;
  }
}

// Update stock in database
async function updateStockInDatabase(id, data) {
  try {
    const response = await fetch(`${API_URL}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
      if (response.status === 409) {
        alert(
          `⚠️ WARNING!\n\nStock with symbol "${data.symbol}" already exists in your portfolio!\n\nPlease use a different symbol.`
        );
      } else {
        console.error('Error updating stock:', result.error);
      }
      return null;
    }

    return result;
  } catch (error) {
    console.error('Error updating stock:', error);
    return null;
  }
}

// Delete stock from database
async function deleteStockFromDatabase(id) {
  try {
    const response = await fetch(`${API_URL}/${id}`, {
      method: 'DELETE',
    });
    return await response.json();
  } catch (error) {
    console.error('Error deleting stock:', error);
  }
}

// Create a new row with data
function createRow(data = null) {
  const newRow = document.createElement('tr');
  if (data?.id) {
    newRow.dataset.id = data.id;
  }

  // Calculate row number
  const rowNumber = stocksTbody.querySelectorAll('tr').length + 1;

  newRow.innerHTML = `
        <td data-field="number">${rowNumber}</td>
        <td class="editable-cell" data-field="symbol">${data?.symbol || '-'}</td>
        <td data-field="weight">${data?.weight || '-'}</td>
        <td class="editable-cell" data-field="company">${data?.company || '-'}</td>
        <td data-field="allocation">${data?.allocation || '-'}</td>
        <td class="editable-cell" data-field="shares">${data?.shares || '-'}</td>
        <td data-field="share_price">${data?.share_price || '-'}</td>
        <td data-field="price_change" class="price-change-cell">-</td>
        <td class="editable-cell" data-field="broker">${data?.broker || '-'}</td>
        <td class="editable-cell" data-field="sector">${data?.sector || '-'}</td>
        <td class="editable-cell" data-field="risk">${data?.risk || '-'}</td>
        <td class="action-buttons">
            <button class="edit-btn" title="Edit">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
            </button>
            <button class="delete-btn" title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
            </button>
        </td>
    `;
  stocksTbody.appendChild(newRow);
  attachRowEventListeners(newRow);
  return newRow;
}

// Function to add new stock row
async function addNewStockRow() {
  exitEditMode();
  const data = {
    symbol: '-',
    weight: '-',
    company: '-',
    allocation: '-',
    shares: '-',
    share_price: '-',
    broker: '-',
    sector: '-',
    risk: '-',
  };
  const result = await addStockToDatabase(data);
  if (result) {
    const newRow = createRow(result);
    // Enter edit mode automatically
    setTimeout(() => {
      const editBtn = newRow.querySelector('.edit-btn');
      if (editBtn) {
        editBtn.click();
      }
    }, 100);
  }
}

if (addRowBtn) {
  addRowBtn.addEventListener('click', addNewStockRow);
}

if (floatingAddBtn) {
  floatingAddBtn.addEventListener('click', addNewStockRow);
}

if (refreshStocksBtn) {
  refreshStocksBtn.addEventListener('click', async () => {
    // Refresh all stock prices while staying on stocks page
    await fetchAndDisplayStocks();
    showNotification('Prices refreshed successfully!', 'success');
  });
}

if (exportStocksBtn) {
  exportStocksBtn.addEventListener('click', exportStocksToCSV);
}

// Export stocks to CSV
async function exportStocksToCSV() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error('Failed to fetch stocks data');

    const stocks = await response.json();

    if (!stocks || stocks.length === 0) {
      alert('No stocks data to export');
      return;
    }

    // CSV headers
    const headers = [
      'Symbol',
      'Weight',
      'Company',
      'Allocation',
      'Shares',
      'Share Price',
      'Broker',
      'Sector',
      'Risk',
    ];

    // Convert stocks data to CSV rows
    const csvRows = [
      headers.join(','), // Header row
      ...stocks.map((stock) =>
        [
          stock.symbol || '',
          stock.weight || '',
          `"${(stock.company || '').replace(/"/g, '""')}"`, // Escape quotes in company names
          stock.allocation || '',
          stock.shares || '',
          stock.share_price || '',
          stock.broker || '',
          stock.sector || '',
          stock.risk || '',
        ].join(',')
      ),
    ];

    // Create CSV blob
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

    // Create download link and trigger download
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'stocks_export.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log(`Exported ${stocks.length} stocks to CSV`);
  } catch (error) {
    console.error('Error exporting stocks:', error);
    alert('Failed to export stocks. Please try again.');
  }
}

// Fetch stock price from API via server proxy (always return full object)
async function fetchStockPrice(symbol) {
  try {
    const response = await fetch(`${API_BASE}/api/stock-price/${symbol}`);
    const data = await response.json();
    if (data && (data.price != null || data.priceEUR != null)) {
      return data;
    }
    return null;
  } catch (error) {
    console.error('Error fetching stock price:', error);
    return null;
  }
}

// Exit edit mode for current editing row
async function exitEditMode() {
  if (currentEditingRow) {
    const editBtn = currentEditingRow.querySelector('.edit-btn');
    if (editBtn && editBtn.title === 'Save') {
      const cells = currentEditingRow.querySelectorAll('td');
      const editableCells = currentEditingRow.querySelectorAll('.editable-cell');

      editableCells.forEach((cell) => {
        const input = cell.querySelector('input');
        const select = cell.querySelector('select');

        if (input) {
          cell.textContent = input.value || '-';
        } else if (select) {
          cell.textContent = select.value || '-';
        }
      });

      // Also save Share_Price if it was made editable
      const sharePriceCell = cells[6];
      const sharePriceInput = sharePriceCell.querySelector('input');
      if (sharePriceInput) {
        const priceValue = sharePriceInput.value.trim();
        // If Sector is Cash, keep plain numeric now; will render as RON below
        const sectorNow = cells[9].textContent.trim();
        if (priceValue) {
          sharePriceCell.textContent = sectorNow === 'Cash' ? priceValue : `€${priceValue}`;
        } else {
          sharePriceCell.textContent = '-';
        }
      }

      // Fetch stock price based on symbol and broker
      const symbol = cells[1].textContent.trim();
      const broker = cells[7].textContent.trim();
      const sector = cells[9].textContent.trim();
      const symbolLower = symbol.toLowerCase();
      const isManualPrice =
        symbolLower.includes('bank deposit') ||
        broker === 'Bank Deposit' ||
        broker === 'Cash' ||
        (sector || '').trim().toLowerCase() === 'cash';

      // Special handling for Bank Deposit and Cash - use manual price, calculate allocation
      if (isManualPrice) {
        // Get manually entered Share_Price (in RON for Bank Deposits)
        const priceText = cells[6].textContent
          .replace('€', '')
          .replace(/RON\s*/i, '')
          .trim();
        let manualPrice = parseFloat(priceText);

        if (!isNaN(manualPrice) && manualPrice > 0) {
          if (sector === 'Cash') {
            // Keep Share Price displayed in RON; Allocation in EUR
            try {
              const response = await fetch(`${API_BASE}/api/exchange-rates`);
              const rates = await response.json();
              const ronPerEur = rates.RON || 4.95; // EUR→RON
              const priceInEur = manualPrice / ronPerEur; // RON→EUR
              // Display share price in RON
              cells[6].textContent = `RON ${manualPrice.toFixed(2)}`;
              // Calculate Allocation (Shares * EUR price)
              const shares = parseFloat(cells[5].textContent) || 0;
              const allocation = shares * priceInEur;
              cells[4].textContent = `€${allocation.toFixed(2)}`;
            } catch (error) {
              console.error('Error fetching exchange rates (Cash RON→EUR):', error);
              // Fallback: keep RON display; no allocation change without rates
            }
            updateWeightForRow(currentEditingRow);
          } else {
            // Convert RON to EUR for Bank Deposits
            try {
              const response = await fetch(`${API_BASE}/api/exchange-rates`);
              const rates = await response.json();
              const ronToEur = 1 / rates.RON; // RON rate is EUR to RON, so we inverse it

              // Convert the price from RON to EUR
              const priceInEur = manualPrice * ronToEur;
              cells[6].textContent = `€${priceInEur.toFixed(2)}`;

              // Calculate Allocation (Shares * Share Price in EUR)
              const shares = parseFloat(cells[5].textContent) || 0;
              const allocation = shares * priceInEur;
              cells[4].textContent = `€${allocation.toFixed(2)}`;
            } catch (error) {
              console.error('Error fetching exchange rates:', error);
              // Fallback: use the price as-is if conversion fails
              const shares = parseFloat(cells[5].textContent) || 0;
              const allocation = shares * manualPrice;
              cells[4].textContent = `€${allocation.toFixed(2)}`;
            }
            // Update weight
            updateWeightForRow(currentEditingRow);
          }
        }
      } else if (symbol && symbol !== '-') {
        // Hardcode PREM in edit-save path as well
        if (symbol.toUpperCase() === 'PREM' || symbol.toUpperCase() === 'PREM.L') {
          try {
            const priceData = await fetchStockPrice(symbol);
            if (priceData && priceData.priceGBp != null) {
              const gbx = Number(priceData.priceGBp);
              const shares = parseFloat(cells[5].textContent) || 0;
              const decimalsGBX = gbx < 1 ? 4 : 2;
              cells[6].textContent = `GBX ${formatMax3(gbx)}`;
              // Hardcode Broker and Risk in edit-save path for PREM
              cells[8].textContent = 'Trading 212';
              cells[10].textContent = 'High Risk';
              const priceEUR = Number(priceData.priceEUR);
              if (shares > 0 && Number.isFinite(priceEUR)) {
                const allocation = shares * priceEUR;
                cells[4].textContent = `€${allocation.toFixed(2)}`;
              }
              updateWeightForRow(currentEditingRow);
              // Persist full PREM row to DB to ensure refresh reads saved data
              const stockId = currentEditingRow.dataset.id;
              if (stockId) {
                const payload = {
                  symbol: 'PREM.L',
                  // Corrected indices matching table layout
                  // 0:number 1:symbol 2:weight 3:company 4:allocation 5:shares 6:share_price 7:price_change 8:broker 9:sector 10:risk
                  company: cells[3].textContent.trim() || 'Premier African Minerals',
                  weight: cells[2].textContent.trim() || '',
                  allocation: cells[4].textContent.trim() || '-',
                  shares: cells[5].textContent.trim() || '0',
                  share_price: cells[6].textContent.trim() || `GBX ${formatMax3(gbx)}`,
                  broker: 'Trading 212',
                  risk: 'High Risk',
                  sector: cells[9].textContent.trim() || 'Basic Materials',
                };
                await fetch(`${API_URL}/${stockId}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                });
              }
            }
            return; // Skip generic fetch logic for PREM
          } catch (err) {
            console.error('PREM (edit) backend fetch error:', err);
            return;
          }
        }
        const priceObj = await fetchStockPrice(symbol);
        if (priceObj) {
          if (
            (symbol.toUpperCase() === 'PREM' || symbol.toUpperCase() === 'PREM.L') &&
            !priceObj.validated
          ) {
            console.warn('Skipping PREM unvalidated price (edit)', priceObj);
          } else {
            const broker = cells[7].textContent.trim();
            const priceEUR = Number.parseFloat(priceObj.priceEUR ?? priceObj.price);
            const priceGBP = Number.parseFloat(priceObj.priceGBP);
            const priceGBp = Number.parseFloat(priceObj.priceGBp);
            // Display hierarchy: GBP (convert from GBp if needed) -> EUR
            if (Number.isFinite(priceGBp) && priceGBp > 0) {
              const gbpFromPence = priceGBp / 100;
              const decimalsGBP = gbpFromPence < 0.1 ? 6 : 4;
              cells[6].textContent = `£${formatMax3(gbpFromPence)}`;
            } else if (Number.isFinite(priceGBP) && priceGBP > 0) {
              const decimalsGBP = priceGBP < 0.1 ? 6 : 4;
              cells[6].textContent = `£${formatMax3(priceGBP)}`;
            } else if (Number.isFinite(priceEUR) && priceEUR > 0) {
              // For US stocks: display USD, keep allocation in EUR
              const originalCurrency = (priceObj.originalCurrency || '').toUpperCase();
              const brokerText = (broker || '').toUpperCase();
              const brokerHintsUSD =
                brokerText.includes('XTB-USD') ||
                brokerText.includes('TRADING212') ||
                brokerText.includes('XTB USD');
              const isUSStock =
                (originalCurrency === 'USD' || brokerHintsUSD) && !(broker === 'Crypto');
              if (isUSStock) {
                try {
                  const rates = await fetch(`${API_BASE}/api/exchange-rates`).then((r) => r.json());
                  const usdPrice = priceEUR * (rates.USD || 1.16);
                  const decimalsUSD = usdPrice < 0.1 ? 6 : 2;
                  cells[6].textContent = `$${usdPrice.toFixed(decimalsUSD)}`;
                } catch {
                  const decimals = broker === 'Crypto' || priceEUR < 0.1 ? 6 : 2;
                  cells[6].textContent = `€${priceEUR.toFixed(decimals)}`;
                }
              } else {
                // Non-US path: crypto displayed in USD (converted), others in EUR
                if (broker === 'Crypto') {
                  try {
                    const rates = await fetch(`${API_BASE}/api/exchange-rates`).then((r) => r.json());
                    const usdRate = rates.USD || 1.16;
                    const usdPrice = priceEUR * usdRate;
                    const decimalsUSD = usdPrice < 0.1 ? 6 : 4;
                    cells[6].textContent = `$${usdPrice.toFixed(decimalsUSD)}`;
                  } catch {
                    const decimals = priceEUR < 0.1 ? 6 : 4;
                    cells[6].textContent = `$${priceEUR.toFixed(decimals)}`; // fallback legacy
                  }
                } else {
                  const decimals = priceEUR < 0.1 ? 6 : 2;
                  cells[6].textContent = `€${priceEUR.toFixed(decimals)}`;
                }
              }
            } else {
              console.warn(`Skipping UI price update for ${symbol}: invalid/zero`, priceObj);
            }
            // Allocation uses EUR (fallback convert GBP→EUR if needed)
            let allocEur = priceEUR;
            if (
              (!Number.isFinite(allocEur) || allocEur <= 0) &&
              Number.isFinite(priceGBP) &&
              priceGBP > 0
            ) {
              try {
                const rates = await fetch(`${API_BASE}/api/exchange-rates`).then((r) => r.json());
                allocEur = priceGBP / (rates.GBP || 0.86);
              } catch {}
            }
            const shares = parseFloat(cells[5].textContent) || 0;
            if (Number.isFinite(allocEur) && allocEur > 0 && shares > 0) {
              let allocation = shares * allocEur;
              // Special-case PREM: compute using displayed GBP, convert to EUR (no extra divide)
              if (symbol.toUpperCase() === 'PREM' || symbol.toUpperCase() === 'PREM.L') {
                const display = (cells[6].textContent || '').trim();
                try {
                  const rateResp = await fetch(`${API_BASE}/api/exchange-rates`).then((r) =>
                    r.json()
                  );
                  const gbpRate = rateResp.GBP || 0.86;
                  let displayValue = parseFloat(display.replace(/[^0-9.\-]/g, '')) || 0;
                  if (display.startsWith('£') && displayValue > 0) {
                    const amountGBP = shares * displayValue;
                    const amountEUR = amountGBP / gbpRate;
                    allocation = amountEUR;
                  }
                } catch {}
              }
              cells[4].textContent = `€${allocation.toFixed(2)}`;
            }
            updateWeightForRow(currentEditingRow);
          }
        }
      }

      // Save to database
      const id = currentEditingRow.dataset.id;
      if (id) {
        const getField = (field) =>
          currentEditingRow.querySelector(`td[data-field="${field}"]`)?.textContent.trim() || '-';
        const data = {
          symbol: getField('symbol'),
          weight: getField('weight'),
          company: getField('company'),
          allocation: getField('allocation'),
          shares: getField('shares'),
          share_price: getField('share_price'),
          broker: getField('broker'),
          sector: getField('sector'),
          risk: getField('risk'),
        };

        // Try to update - server will handle duplicate check
        const result = await updateStockInDatabase(id, data);

        // If update failed due to duplicate, stay in edit mode
        if (!result) {
          return;
        }
      }

      // Update total balance and chart
      updateTotalBalance();
      updateBalancePieChart();

      editBtn.title = 'Edit';
      editBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
            `;
    }
    currentEditingRow = null;
  }
}

// Click outside to exit edit mode
document.addEventListener('click', (e) => {
  // Don't exit if clicking inside an input field
  if (e.target.tagName === 'INPUT') {
    return;
  }

  const clickedInsideTable = e.target.closest('.stocks-table');
  const clickedEditBtn = e.target.classList.contains('edit-btn');
  const clickedDeleteBtn = e.target.classList.contains('delete-btn');

  // Exit edit mode if clicking outside table or on action buttons
  if (!clickedInsideTable && currentEditingRow) {
    exitEditMode();
  } else if (clickedInsideTable && !clickedEditBtn && !clickedDeleteBtn && currentEditingRow) {
    // If clicking inside table but not on buttons and not on input, exit edit mode
    const clickedOnEditingRow = e.target.closest('tr') === currentEditingRow;
    if (!clickedOnEditingRow) {
      exitEditMode();
    }
  }
});

// Function to attach event listeners to a row
function attachRowEventListeners(row) {
  const editBtn = row.querySelector('.edit-btn');
  const deleteBtn = row.querySelector('.delete-btn');

  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();

    if (editBtn.title === 'Edit') {
      // Exit any other editing row first
      exitEditMode();

      // Enter edit mode
      currentEditingRow = row;
      editBtn.title = 'Save';
      editBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            `;

      // Check if Symbol is 'Bank Deposit' to make Allocation editable
      const symbolCell = row.querySelector('[data-field="symbol"]');
      const symbolValue = symbolCell?.textContent.trim();
      const allocationCell = row.querySelector('[data-field="allocation"]');

      if (
        symbolValue === 'Bank Deposit' &&
        allocationCell &&
        !allocationCell.classList.contains('editable-cell')
      ) {
        allocationCell.classList.add('editable-cell');
      }

      const editableCells = row.querySelectorAll('.editable-cell');

      editableCells.forEach((cell) => {
        const currentValue = cell.textContent;
        const fieldName = cell.dataset.field;

        // Skip Allocation field initially - will be handled conditionally
        if (fieldName === 'allocation') {
          return;
        }

        // Special handling for Sector field - use searchable dropdown
        if (fieldName === 'sector') {
          const wrapper = document.createElement('div');
          wrapper.style.position = 'relative';

          const input = document.createElement('input');
          input.type = 'text';
          input.value = currentValue === '-' ? '' : currentValue;
          input.placeholder = 'Type to search...';
          input.autocomplete = 'off';

          const dropdown = document.createElement('div');
          dropdown.style.cssText =
            'position: absolute; top: 100%; left: 0; right: 0; background: #2a2a2a; border: 1px solid #444; max-height: 200px; overflow-y: auto; z-index: 1000; display: none;';

          const updateDropdown = (filter = '') => {
            const filtered = AVAILABLE_SECTORS.filter((s) =>
              s.toLowerCase().includes(filter.toLowerCase())
            );
            dropdown.innerHTML = filtered
              .map(
                (s) =>
                  `<div style="padding: 8px; cursor: pointer; color: white;" data-value="${s}">${s}</div>`
              )
              .join('');

            dropdown.querySelectorAll('div').forEach((opt) => {
              opt.addEventListener('mouseenter', () => (opt.style.background = '#3a3a3a'));
              opt.addEventListener('mouseleave', () => (opt.style.background = 'transparent'));
              opt.addEventListener('click', () => {
                input.value = opt.dataset.value;
                dropdown.style.display = 'none';
              });
            });
          };

          input.addEventListener('focus', () => {
            updateDropdown(input.value);
            dropdown.style.display = 'block';
          });

          input.addEventListener('input', () => {
            updateDropdown(input.value);
            dropdown.style.display = 'block';
          });

          input.addEventListener('blur', () => {
            setTimeout(() => (dropdown.style.display = 'none'), 200);
          });

          wrapper.appendChild(input);
          wrapper.appendChild(dropdown);
          cell.textContent = '';
          cell.appendChild(wrapper);
        } else if (fieldName === 'risk') {
          const select = document.createElement('select');
          select.innerHTML = `
                        <option value="">Select Risk</option>
                        <option value="🟩 Very Safe" ${currentValue === '🟩 Very Safe' ? 'selected' : ''}>🟩 Very Safe</option>
                        <option value="🟦 Safe" ${currentValue === '🟦 Safe' ? 'selected' : ''}>🟦 Safe</option>
                        <option value="🟨 Medium-Safe" ${currentValue === '🟨 Medium-Safe' ? 'selected' : ''}>🟨 Medium-Safe</option>
                        <option value="🟥 High Risk" ${currentValue === '🟥 High Risk' ? 'selected' : ''}>🟥 High Risk</option>
                    `;
          cell.textContent = '';
          cell.appendChild(select);
        } else if (fieldName === 'broker') {
          const select = document.createElement('select');
          select.innerHTML = `
                        <option value="">Select Broker</option>
                        <option value="Tradeville" ${currentValue === 'Tradeville' ? 'selected' : ''}>Tradeville</option>
                        <option value="XTB-EURO" ${currentValue === 'XTB-EURO' ? 'selected' : ''}>XTB-EURO</option>
                        <option value="XTB-USD" ${currentValue === 'XTB-USD' ? 'selected' : ''}>XTB-USD</option>
                        <option value="Trading212" ${currentValue === 'Trading212' ? 'selected' : ''}>Trading212</option>
                        <option value="Crypto" ${currentValue === 'Crypto' ? 'selected' : ''}>Crypto</option>
                        <option value="Bank Deposit" ${currentValue === 'Bank Deposit' ? 'selected' : ''}>Bank Deposit</option>
                        <option value="Cash" ${currentValue === 'Cash' ? 'selected' : ''}>Cash</option>
                    `;
          cell.textContent = '';
          cell.appendChild(select);
        } else {
          // Regular input for other fields
          const input = document.createElement('input');
          input.type = 'text';
          input.value = currentValue === '-' ? '' : currentValue;
          input.placeholder = cell.dataset.field;
          cell.textContent = '';
          cell.appendChild(input);

          // Save on Enter key
          input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
              exitEditMode();
            }
          });
        }
      });

      // Add listener on Symbol and Broker fields to handle Share_Price editability for Bank Deposits
      const symbolInput = row.querySelector('[data-field="symbol"] input');
      const brokerSelect = row.querySelector('[data-field="broker"] select');
      const sectorInput = row.querySelector('[data-field="sector"] input');
      const sharePriceCell = row.querySelector('[data-field="share_price"]');

      const updateSharePriceField = () => {
        const symbolValue = symbolInput?.value.trim().toLowerCase() || '';
        const brokerValue = brokerSelect?.value || '';
        const sectorValue = (
          sectorInput?.value ||
          row.querySelector('[data-field="sector"]').textContent ||
          ''
        ).trim();
        const isManualPrice =
          symbolValue.includes('bank deposit') ||
          brokerValue === 'Bank Deposit' ||
          brokerValue === 'Cash' ||
          sectorValue.toLowerCase() === 'cash';

        if (isManualPrice && sharePriceCell && !sharePriceCell.querySelector('input')) {
          // Make Share_Price editable for Bank Deposits
          const currentPrice = sharePriceCell.textContent.replace('€', '').trim();
          const input = document.createElement('input');
          input.type = 'text';
          input.value = currentPrice === '-' ? '' : currentPrice;
          input.placeholder = 'Share Price';
          sharePriceCell.textContent = '';
          sharePriceCell.appendChild(input);

          input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
              exitEditMode();
            }
          });
        } else if (!isManualPrice && sharePriceCell && sharePriceCell.querySelector('input')) {
          // Remove input if exists and not manual price anymore
          const input = sharePriceCell.querySelector('input');
          if (input) {
            sharePriceCell.textContent = input.value ? `€${input.value}` : '-';
          }
        }
      };

      // Initial check
      updateSharePriceField();

      // Listen for changes in Symbol field
      if (symbolInput) {
        symbolInput.addEventListener('input', updateSharePriceField);
      }

      // Listen for changes in Broker dropdown
      if (brokerSelect) {
        brokerSelect.addEventListener('change', updateSharePriceField);
      }
      if (sectorInput) {
        sectorInput.addEventListener('input', updateSharePriceField);
      }

      // Focus first input
      const firstInput = editableCells[0].querySelector('input');
      if (firstInput) firstInput.focus();
    } else {
      // Save mode
      exitEditMode();
    }
  });

  deleteBtn.addEventListener('click', () => {
    const stockSymbol = row.querySelector('td[data-field="symbol"]')?.textContent || '-';
    const stockCompany = row.querySelector('td[data-field="company"]')?.textContent || '-';
    const displayName = stockCompany !== '-' ? stockCompany : stockSymbol;

    showDeleteModal(displayName, async () => {
      const id = row.dataset.id;
      if (id) {
        await deleteStockFromDatabase(id);
      }
      row.remove();
      updateStockNumbers();
      updateTotalBalance();
      updateBalancePieChart();
    });
  });
}

// Update stock row numbers after deletion
function updateStockNumbers() {
  const rows = stocksTbody.querySelectorAll('tr');
  rows.forEach((row, index) => {
    const numberCell = row.querySelector('[data-field="number"]');
    if (numberCell) {
      numberCell.textContent = index + 1;
    }
  });
}

// Calculate and update total balance
// Unified EUR balance computation from stocks data (authoritative)
async function computeUnifiedPortfolioBalanceEUR() {
  try {
    const [stocksResponse, rates] = await Promise.all([
      fetch('/api/stocks'),
      fetch(`${API_BASE}/api/exchange-rates`)
        .then((r) => r.json())
        .catch(() => ({ USD: 1.16, RON: 4.95 })),
    ]);
    const stocks = await stocksResponse.json();
    let total = 0;
    stocks.forEach((stock) => {
      const shares = parseFloat(stock.shares) || 0;
      let priceStrRaw = String(stock.share_price || '0');
      let priceStr = priceStrRaw.replace(/[$€\s]/g, '').replace(',', '.');
      let price = parseFloat(priceStr) || 0;
      const broker = stock.broker || '';
      const sector = stock.sector || '';
      const symbol = (stock.symbol || '').toLowerCase();
      // Crypto prices are USD -> convert to EUR
      if (broker === 'Crypto' || String(stock.share_price).includes('$')) {
        price = price / (rates.USD || 1);
      }
      // Bank Deposit may be entered in EUR already; if in RON, convert (heuristic: symbol contains 'bank deposit' and price was large)
      if (broker === 'Bank Deposit' && rates.RON) {
        // If original string had no currency and seems RON (fallback heuristic), keep as-is; conversion handled when editing
      }
      // Cash sector uses RON in Share Price; convert RON→EUR for balance
      if (sector === 'Cash') {
        const isRonLabeled = /^\s*RON\s*/i.test(priceStrRaw);
        const ronPerEur = rates.RON || 4.95;
        if (isRonLabeled) {
          // price currently parsed without RON text; treat as RON amount
          price = price / ronPerEur;
        }
      }
      total += shares * price;
    });
    return total;
  } catch (e) {
    console.error('Error computing unified EUR balance:', e);
    return null;
  }
}

// Total din coloana Allocation (DOM) – sursa primară; fallback DB
function computeTotalFromAllocationCells() {
  let sum = 0;
  try {
    const rows = stocksTbody.querySelectorAll('tr');
    rows.forEach((r) => {
      const allocCell = r.querySelector('td[data-field="allocation"]');
      if (!allocCell) return;
      const raw = allocCell.textContent.trim();
      if (!raw || raw === '-') return;
      const val = parseFloat(raw.replace(/[^0-9.\-]/g, ''));
      if (!isNaN(val)) sum += val;
    });
  } catch (e) {
    console.warn('computeTotalFromAllocationCells fallback', e.message);
  }
  return sum;
}

// Calculate and update total balance prioritizând Allocation din tabel
async function updateTotalBalance() {
  const domTotal = computeTotalFromAllocationCells();
  let finalTotal = domTotal;
  if (finalTotal <= 0) {
    // Fallback la calcul unificat dacă DOM nu are valori
    const unified = await computeUnifiedPortfolioBalanceEUR();
    if (unified != null) finalTotal = unified;
  }
  const balanceElement = document.getElementById('total-balance');
  if (balanceElement && finalTotal != null) {
    balanceElement.textContent = finalTotal.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    updateProfit();
    updateAllWeights(finalTotal);
    try { updateAverageAnnualReturn(); } catch {}
    try { updateBalanceTotalReturn(); } catch {}
  }
}

// Calculate weight for a single row
function updateWeightForRow(row) {
  const cells = row.querySelectorAll('td');
  if (cells.length >= 5) {
    const allocationText = cells[4].textContent.replace('€', '').replace('$', '').replace(',', '');
    const allocation = parseFloat(allocationText);

    // Get current balance
    const balanceElement = document.getElementById('total-balance');
    const balance = parseFloat(balanceElement.textContent.replace(',', '')) || 1;

    if (!isNaN(allocation) && allocation > 0 && balance > 0) {
      const weight = (allocation / balance) * 100;
      cells[2].textContent = `${weight.toFixed(2)}%`;
    }
  }
}

// Update all weights based on total balance
function updateAllWeights(total) {
  if (!total || total === 0) return;

  const rows = stocksTbody.querySelectorAll('tr');
  rows.forEach((row) => {
    const cells = row.querySelectorAll('td');
    if (cells.length >= 5) {
      const allocationText = cells[4].textContent
        .replace('€', '')
        .replace('$', '')
        .replace(',', '');
      const allocation = parseFloat(allocationText);

      if (!isNaN(allocation) && allocation > 0) {
        const weight = (allocation / total) * 100;
        cells[2].textContent = `${weight.toFixed(2)}%`;
      }
    }
  });
}

// Delete confirmation modal
const deleteModal = document.getElementById('delete-modal');
const cancelDeleteBtn = document.getElementById('cancel-delete');
const confirmDeleteBtn = document.getElementById('confirm-delete');
const stockNameEl = document.getElementById('stock-name');
let deleteCallback = null;

function showDeleteModal(stockName, onConfirm) {
  if (!deleteModal || !stockNameEl) return;

  stockNameEl.textContent = stockName;
  deleteCallback = onConfirm;

  // Force display with both class and inline style
  deleteModal.classList.add('show');
  deleteModal.style.display = 'flex';
  deleteModal.style.opacity = '1';
  deleteModal.style.visibility = 'visible';
}

function hideDeleteModal() {
  deleteModal.classList.remove('show');
  deleteModal.style.display = 'none';
  deleteModal.style.opacity = '';
  deleteModal.style.visibility = '';
  deleteCallback = null;
}

if (cancelDeleteBtn) {
  cancelDeleteBtn.addEventListener('click', hideDeleteModal);
}

if (confirmDeleteBtn) {
  confirmDeleteBtn.addEventListener('click', async () => {
    if (deleteCallback) {
      await deleteCallback();
    }
    hideDeleteModal();
  });
}

// Close modal on overlay click
if (deleteModal) {
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) {
      hideDeleteModal();
    }
  });
}

// Close modal on ESC key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && deleteModal.classList.contains('show')) {
    hideDeleteModal();
  }
});

// Risk info tooltip functionality
const riskIcon = document.getElementById('risk-info');
const riskTooltip = document.getElementById('risk-tooltip');

if (riskIcon && riskTooltip) {
  riskIcon.addEventListener('mouseenter', (e) => {
    const rect = riskIcon.getBoundingClientRect();
    riskTooltip.style.top = `${rect.bottom + 10}px`;
    riskTooltip.style.left = `${rect.left - 150}px`;
    riskTooltip.classList.add('show');
  });

  riskIcon.addEventListener('mouseleave', () => {
    riskTooltip.classList.remove('show');
  });
}

// ========== GLOBAL TABLE SORTING (All Tables) ==========
function parseSortValue(text, column) {
  if (!text) return '';
  const raw = text.trim();
  // Numeric (currency, percent, plain number)
  if (/[%€$£RON]/i.test(raw) || /[-+]?\d/.test(raw) || ['weight','allocation','amount','annual_dividend','monthly_dividend','portfolio_percent','deposits_percent','sp500_percent','bet_percent','balance','price_change','shares'].includes(column)) {
    // Date DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
      const [d,m,y] = raw.split('/').map(Number);
      return new Date(y, m-1, d).getTime();
    }
    // Date & Time (admin snapshots)
    if (/\d{2}:\d{2}/.test(raw) && /[A-Za-z]{3}/.test(raw)) {
      const t = Date.parse(raw);
      if (!isNaN(t)) return t;
    }
    // Percent
    if (/%$/.test(raw)) {
      const num = parseFloat(raw.replace(/[^0-9.\-]/g,''));
      return isNaN(num) ? -Infinity : num;
    }
    // Currency or plain number
    const num = parseFloat(raw.replace(/[^0-9.\-]/g,''));
    if (!isNaN(num)) return num;
  }
  // Month name ordering
  if (column === 'month') {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const idx = months.indexOf(raw.toLowerCase());
    return idx === -1 ? 99 : idx;
  }
  if (column === 'risk') {
    if (raw.includes('🟩') || /very safe/i.test(raw)) return 1;
    if (raw.includes('🟦') || /safe/i.test(raw)) return 2;
    if (raw.includes('🟨') || /medium/i.test(raw)) return 3;
    if (raw.includes('🟥') || /high risk/i.test(raw)) return 4;
    return 5;
  }
  return raw.toLowerCase();
}

function attachSortingToTable(table) {
  if (!table) return;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  table.querySelectorAll('th.sortable').forEach((th) => {
    th.addEventListener('click', (e) => {
      // Ignore clicks on embedded icons/info
      if (e.target.closest('#risk-info')) return;
      const column = th.dataset.column;
      if (!column) return;
      const currentDir = th.dataset.sortDir === 'asc' ? 'desc' : 'asc';
      // Reset other headers
      table.querySelectorAll('th.sortable').forEach((h) => {
        if (h !== th) {
          h.dataset.sortDir = '';
          h.classList.remove('sorted-asc','sorted-desc');
        }
      });
      th.dataset.sortDir = currentDir;
      th.classList.toggle('sorted-asc', currentDir === 'asc');
      th.classList.toggle('sorted-desc', currentDir === 'desc');
      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort((a,b) => {
        const aCell = a.querySelector(`td[data-field="${column}"]`);
        const bCell = b.querySelector(`td[data-field="${column}"]`);
        const aVal = parseSortValue(aCell?.textContent || '', column);
        const bVal = parseSortValue(bCell?.textContent || '', column);
        if (aVal === bVal) return 0; // stable tie
        if (currentDir === 'asc') return aVal > bVal ? 1 : -1;
        return aVal < bVal ? 1 : -1;
      });
      rows.forEach(r => tbody.appendChild(r));
      // Renumber sequence columns (nr/count) except snapshots ID
      const firstHeader = table.querySelector('th.sortable[data-column="nr"], th.sortable[data-column="count"]');
      if (firstHeader && column !== 'id') {
        const seqField = firstHeader.dataset.column === 'count' ? 'count' : 'nr';
        Array.from(tbody.querySelectorAll(`td[data-field="${seqField}"]`)).forEach((cell, idx) => {
          cell.textContent = idx + 1;
        });
      }
      // Stocks specific: update stock numbers if sorted by other columns
      if (table.id === '' && table.classList.contains('stocks-table')) {
        try { updateStockNumbers(); } catch {}
      }
    });
  });
}

function initGlobalSorting() {
  // Add missing data-field attributes for stocks table numeric sequence if absent
  document.querySelectorAll('table').forEach((t) => attachSortingToTable(t));
  console.log('✅ Global sorting initialized for all tables');
}

// Delay initialization slightly to ensure dynamic tables rendered
setTimeout(initGlobalSorting, 150);

// (removed) Market status badge logic reverted

// ========== PIE CHART ==========
let balancePieChart = null;
let balancePieChartRetries = 0;

// ========== DEPOSITS SECTION ==========
const depositsTbody = document.getElementById('deposits-tbody');
const addDepositBtn = document.getElementById('add-deposit-btn');
let currentEditingDeposit = null;
const DEPOSITS_API_URL = `${API_BASE}/api/deposits`;

// Load deposits from database
async function loadDepositsData() {
  try {
    const response = await fetch(DEPOSITS_API_URL);
    const deposits = await response.json();
    deposits.forEach((deposit) => {
      createDepositRow(deposit);
    });
    updateTotalDeposits();
  } catch (error) {
    console.error('Error loading deposits:', error);
  }
}

// Save deposit to database
async function addDepositToDatabase(data) {
  try {
    const response = await fetch(DEPOSITS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await response.json();
  } catch (error) {
    console.error('Error adding deposit:', error);
    return null;
  }
}

// Update deposit in database
async function updateDepositInDatabase(id, data) {
  try {
    const response = await fetch(`${DEPOSITS_API_URL}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await response.json();
  } catch (error) {
    console.error('Error updating deposit:', error);
    return null;
  }
}

// Delete deposit from database
async function deleteDepositFromDatabase(id) {
  try {
    const response = await fetch(`${DEPOSITS_API_URL}/${id}`, {
      method: 'DELETE',
    });
    return await response.json();
  } catch (error) {
    console.error('Error deleting deposit:', error);
    return null;
  }
}

// Get current date in DD/MM/YYYY format
function getCurrentDate() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}/${month}/${year}`;
}

// Create deposit row
function createDepositRow(data) {
  const newRow = document.createElement('tr');
  if (data?.id) {
    newRow.dataset.id = data.id;
  }

  const count = data?.count || depositsTbody.querySelectorAll('tr').length + 1;

  newRow.innerHTML = `
        <td data-field="count">${count}</td>
        <td data-field="date">${data?.date || getCurrentDate()}</td>
        <td class="editable-cell" data-field="account">${data?.account || '-'}</td>
        <td class="editable-cell" data-field="month">${data?.month || '-'}</td>
        <td class="editable-cell" data-field="amount">${data?.amount || '-'}</td>
        <td class="action-buttons">
            <button class="edit-btn" title="Edit">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
            </button>
            <button class="delete-btn" title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
            </button>
        </td>
    `;
  depositsTbody.appendChild(newRow);
  attachDepositRowListeners(newRow);

  return newRow;
}

// Attach event listeners to deposit row
function attachDepositRowListeners(row) {
  const editBtn = row.querySelector('.edit-btn');
  const deleteBtn = row.querySelector('.delete-btn');

  console.log('Attaching listeners - editBtn:', editBtn, 'deleteBtn:', deleteBtn);

  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();

    if (editBtn.title === 'Edit') {
      exitDepositEditMode();

      currentEditingDeposit = row;
      editBtn.title = 'Save';
      editBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            `;

      const editableCells = row.querySelectorAll('.editable-cell');
      editableCells.forEach((cell) => {
        const currentValue = cell.textContent;
        const fieldName = cell.dataset.field;

        if (fieldName === 'month') {
          const select = document.createElement('select');
          const months = [
            'January',
            'February',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December',
          ];
          select.innerHTML =
            '<option value="">Select Month</option>' +
            months
              .map(
                (m) => `<option value="${m}" ${currentValue === m ? 'selected' : ''}>${m}</option>`
              )
              .join('');
          cell.textContent = '';
          cell.appendChild(select);
        } else if (fieldName === 'account') {
          const select = document.createElement('select');
          const accounts = [
            'Tradeville',
            'XTB-EURO',
            'XTB-USD',
            'Trading212',
            'Bank Deposit',
            'Crypto',
          ];
          select.innerHTML =
            '<option value="">Select Account</option>' +
            accounts
              .map(
                (a) => `<option value="${a}" ${currentValue === a ? 'selected' : ''}>${a}</option>`
              )
              .join('');
          cell.textContent = '';
          cell.appendChild(select);
        } else {
          const input = document.createElement('input');
          input.type = 'text';
          input.value = currentValue === '-' ? '' : currentValue;
          input.placeholder = fieldName;
          cell.textContent = '';
          cell.appendChild(input);

          input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
              exitDepositEditMode();
            }
          });
        }
      });

      const firstInput = editableCells[0].querySelector('input');
      if (firstInput) firstInput.focus();
    } else {
      exitDepositEditMode();
    }
  });

  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const cells = row.querySelectorAll('td');
    const depositDate = cells[1].textContent;

    showDeleteModal(`Deposit from ${depositDate}`, async () => {
      const id = row.dataset.id;
      if (id) {
        await deleteDepositFromDatabase(id);
      }
      row.remove();
      updateDepositCounts();
      updateTotalDeposits();
    });
  });
}

// Exit deposit edit mode
async function exitDepositEditMode() {
  if (currentEditingDeposit) {
    const editBtn = currentEditingDeposit.querySelector('.edit-btn');
    if (editBtn && editBtn.title === 'Save') {
      const cells = currentEditingDeposit.querySelectorAll('td');
      const editableCells = currentEditingDeposit.querySelectorAll('.editable-cell');

      const depositData = {
        count: parseInt(cells[0].textContent),
        date: cells[1].textContent,
        amount: '',
        account: '',
        month: '',
      };

      editableCells.forEach((cell) => {
        const input = cell.querySelector('input');
        const select = cell.querySelector('select');
        const field = cell.dataset.field;

        if (input) {
          cell.textContent = input.value || '-';
          depositData[field] = input.value || '-';
        } else if (select) {
          cell.textContent = select.value || '-';
          depositData[field] = select.value || '-';
        }
      });

      // Update in database
      const id = currentEditingDeposit.dataset.id;
      if (id) {
        await updateDepositInDatabase(id, depositData);
        // Instant page refresh of dependent sections after saving a deposit
        updateTotalDeposits();
        // Refresh Money Invested breakdowns (dashboard + deposits tab duplicate)
        try { await updateDepositsBreakdown(); } catch {}
        // Refresh balance breakdowns and totals so profit reflects new deposit
        try { await updateBalanceBreakdown(); } catch {}
        try { await updateTotalBalance(); } catch {}
        try { updateBalancePieChart(); } catch {}
      }

      editBtn.title = 'Edit';
      editBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
            `;
    }
    currentEditingDeposit = null;
  }
}

// Update deposit counts after deletion
function updateDepositCounts() {
  const rows = depositsTbody.querySelectorAll('tr');
  rows.forEach((row, index) => {
    row.querySelector('[data-field="count"]').textContent = index + 1;
  });
}

// Calculate and update total deposits
function updateTotalDeposits() {
  const rows = depositsTbody.querySelectorAll('tr');
  let total = 0;

  rows.forEach((row) => {
    const amountCell = row.querySelector('[data-field="amount"]');
    if (amountCell) {
      const amountText = amountCell.textContent.trim();
      // Parse amount, handle different formats
      const amount = parseFloat(amountText.replace(/[^0-9.-]/g, '')) || 0;
      total += amount;
    }
  });

  const totalElement = document.getElementById('total-deposits-amount');
  if (totalElement) {
    totalElement.textContent = total.toFixed(2) + ' €';
  }
  // Mirror into embedded Total Deposits in Money Invested panel (Deposits page)
  const embeddedTotal = document.getElementById('total-deposits-embedded');
  if (embeddedTotal) {
    embeddedTotal.textContent = total.toFixed(2) + ' €';
  }

  // Calculate and update profit (Balance - Total Deposits)
  updateProfit();
  // Update Return of Capital Ratio since deposits changed
  updateReturnOfCapitalRatio();
  // Refresh CAGR after deposits change
  try { updateAverageAnnualReturn(); } catch {}
  try { updateBalanceTotalReturn(); } catch {}
}

// Update deposits breakdown in dashboard
async function updateDepositsBreakdown() {
  try {
    const response = await fetch('/api/deposits');
    const deposits = await response.json();

    // Initialize totals
    let xtbEur = 0;
    let tradeville = 0;
    let t212XtbUsd = 0;
    let crypto = 0;
    let bankDeposits = 0;

    // Calculate totals based on account field
    deposits.forEach((deposit) => {
      const amount = parseFloat(deposit.amount.replace(/[^0-9.-]/g, '')) || 0;
      const account = deposit.account || '';

      if (account === 'XTB-EURO') {
        xtbEur += amount;
      } else if (account === 'Tradeville') {
        tradeville += amount;
      } else if (account === 'Trading212' || account === 'XTB-USD') {
        t212XtbUsd += amount;
      } else if (account === 'Crypto') {
        crypto += amount;
      } else if (account === 'Bank Deposit') {
        bankDeposits += amount;
      }
    });

    // Helper to update multiple id variants (dashboard + deposits tab duplicate)
    function setIfExists(id, value) {
      const el = document.getElementById(id);
      if (el) el.textContent = Math.round(value).toLocaleString('en-US') + ' €';
    }
    const mapping = [
      ['xtb-eur-value', xtbEur],
      ['tradeville-value', tradeville],
      ['t212-xtb-usd-value', t212XtbUsd],
      ['crypto-value', crypto],
      ['bank-deposits-value', bankDeposits],
      // Deposits tab duplicate IDs
      ['xtb-eur-value-deposits', xtbEur],
      ['tradeville-value-deposits', tradeville],
      ['t212-xtb-usd-value-deposits', t212XtbUsd],
      ['crypto-value-deposits', crypto],
      ['bank-deposits-value-deposits', bankDeposits],
    ];
    mapping.forEach(([id, val]) => setIfExists(id, val));
    // After updating Money invested values, refresh Average Monthly Contribution
    try { updateAverageMonthlyContribution(); } catch {}
  } catch (error) {
    console.error('Error updating deposits breakdown:', error);
  }
}

// Update balance breakdown in dashboard
async function updateBalanceBreakdown() {
  try {
    const [stocksResponse, depositsResponse, exchangeRates] = await Promise.all([
      fetch('/api/stocks'),
      fetch('/api/deposits'),
      fetch(`${API_BASE}/api/exchange-rates`)
        .then((r) => r.json())
        .catch(() => ({ USD: 1.16 })),
    ]);

    const stocks = await stocksResponse.json();
    const deposits = await depositsResponse.json();

    // Calculate XTB EUR balance (specific symbols)
    let xtbEurBalance = 0;
    const xtbEurSymbols = ['SXR8.DE', 'VGWD.DE', 'VDIV.DE', 'VGWL.DE'];

    stocks.forEach((stock) => {
      if (stock.symbol && xtbEurSymbols.includes(stock.symbol)) {
        const shares = parseFloat(stock.shares) || 0;
        let priceStr = String(stock.share_price || '0')
          .replace(/[€$\s]/g, '')
          .replace(',', '.');
        const price = parseFloat(priceStr) || 0;
        xtbEurBalance += shares * price;
      }
    });

    // Calculate T212 + XTB USD balance (all stocks from these brokers)
    let t212XtbUsdBalance = 0;

    stocks.forEach((stock) => {
      const broker = stock.broker || '';
      if (broker === 'Trading212' || broker === 'XTB-USD') {
        const shares = parseFloat(stock.shares) || 0;
        let priceStr = String(stock.share_price || '0')
          .replace(/[€$\s]/g, '')
          .replace(',', '.');
        let price = parseFloat(priceStr) || 0;

        // Convert USD to EUR only if price has $ symbol (exclude EUR-based ETFs)
        if (String(stock.share_price).includes('$')) {
          price = price / exchangeRates.USD;
        }
        // EUR-based ETFs (like ESP0.DE, JEDI.DE, ASWC.DE, NUKL.DE, DFNS.UK) already in EUR, no conversion needed

        t212XtbUsdBalance += shares * price;
      }
    });

    // Calculate Tradeville balance using Allocation (includes 'Cash Tradeville')
    let tradevilleBalance = 0;
    try {
      const rows = stocksTbody.querySelectorAll('tr');
      rows.forEach((row) => {
        const brokerCell = row.querySelector('td[data-field="broker"]');
        const symbolCell = row.querySelector('td[data-field="symbol"]');
        const allocCell = row.querySelector('td[data-field="allocation"]');
        const brokerTxt = brokerCell ? brokerCell.textContent.trim() : '';
        const symbolTxt = symbolCell ? symbolCell.textContent.trim() : '';
        if (brokerTxt === 'Tradeville' || symbolTxt === 'Cash Tradeville') {
          const allocTxt = allocCell ? allocCell.textContent.trim() : '€0';
          const allocVal = parseFloat(allocTxt.replace(/[^0-9.\-]/g, '')) || 0;
          tradevilleBalance += allocVal;
        }
      });
    } catch (e) {
      // Fallback to API-based computation if DOM not available
      stocks.forEach((stock) => {
        if (stock.broker === 'Tradeville' || stock.symbol === 'Cash Tradeville') {
          const shares = parseFloat(stock.shares) || 0;
          let priceStr = String(stock.share_price || '0')
            .replace(/[^0-9.\-]/g, '')
            .replace(',', '.');
          const price = parseFloat(priceStr) || 0;
          tradevilleBalance += shares * price;
        }
      });
    }

    // Calculate Crypto balance (prices in USD, need to convert to EUR)
    let cryptoBalance = 0;

    stocks.forEach((stock) => {
      const broker = stock.broker || '';
      if (broker === 'Crypto') {
        const shares = parseFloat(stock.shares) || 0;
        // Clean price: remove $, €, spaces, and replace comma with dot
        let priceStr = String(stock.share_price || '0')
          .replace(/[$€\s]/g, '')
          .replace(',', '.');
        const priceUSD = parseFloat(priceStr) || 0;
        // Convert USD to EUR
        const priceEUR = priceUSD / exchangeRates.USD;
        cryptoBalance += shares * priceEUR;
      }
    });

    // Calculate Bank Deposit balance (use Allocation from table to respect RON→EUR UI conversion)
    let bankDepositBalance = 0;
    try {
      const rows = stocksTbody.querySelectorAll('tr');
      rows.forEach((row) => {
        const brokerCell = row.querySelector('td[data-field="broker"]');
        const allocCell = row.querySelector('td[data-field="allocation"]');
        const brokerTxt = brokerCell ? brokerCell.textContent.trim() : '';
        if (brokerTxt === 'Bank Deposit') {
          const allocTxt = allocCell ? allocCell.textContent.trim() : '€0';
          const allocVal = parseFloat(allocTxt.replace(/[^0-9.\-]/g, '')) || 0;
          bankDepositBalance += allocVal;
        }
      });
    } catch (e) {
      // Fallback to API-based computation if DOM not available
      stocks.forEach((stock) => {
        const broker = stock.broker || '';
        if (broker === 'Bank Deposit') {
          const shares = parseFloat(stock.shares) || 0;
          let priceStr = String(stock.share_price || '0')
            .replace(/[^0-9.\-]/g, '')
            .replace(',', '.');
          const price = parseFloat(priceStr) || 0;
          bankDepositBalance += shares * price;
        }
      });
    }

    // Calculate deposits for each broker
    let xtbEurDeposits = 0;
    let tradevilleDeposits = 0;
    let t212XtbUsdDeposits = 0;
    let cryptoDeposits = 0;
    let bankDepositsDeposits = 0;

    deposits.forEach((deposit) => {
      const amount = parseFloat(deposit.amount.replace(/[^0-9.-]/g, '')) || 0;
      const account = deposit.account || '';

      if (account === 'XTB-EUR') {
        xtbEurDeposits += amount;
      } else if (account === 'Tradeville') {
        tradevilleDeposits += amount;
      } else if (account === 'Trading212' || account === 'XTB-USD') {
        t212XtbUsdDeposits += amount;
      } else if (account === 'Crypto') {
        cryptoDeposits += amount;
      } else if (account === 'Bank Deposit') {
        bankDepositsDeposits += amount;
      }
    });

    // Calculate profit and return for each broker
    const xtbEurProfit = xtbEurBalance - xtbEurDeposits;
    const xtbEurReturn = xtbEurDeposits > 0 ? (xtbEurProfit / xtbEurDeposits) * 100 : 0;

    const tradevilleProfit = tradevilleBalance - tradevilleDeposits;
    const tradevilleReturn =
      tradevilleDeposits > 0 ? (tradevilleProfit / tradevilleDeposits) * 100 : 0;

    const t212XtbUsdProfit = t212XtbUsdBalance - t212XtbUsdDeposits;
    const t212XtbUsdReturn =
      t212XtbUsdDeposits > 0 ? (t212XtbUsdProfit / t212XtbUsdDeposits) * 100 : 0;

    const cryptoProfit = cryptoBalance - cryptoDeposits;
    const cryptoReturn = cryptoDeposits > 0 ? (cryptoProfit / cryptoDeposits) * 100 : 0;

    const bankDepositsProfit = bankDepositBalance - bankDepositsDeposits;
    const bankDepositsReturn =
      bankDepositsDeposits > 0 ? (bankDepositsProfit / bankDepositsDeposits) * 100 : 0;

    // Update UI - Balance section (values are EUR)
    const xtbEurBalanceElement = document.getElementById('xtb-eur-balance-value');
    if (xtbEurBalanceElement) {
      xtbEurBalanceElement.textContent = Math.round(xtbEurBalance).toLocaleString('en-US') + ' €';
    }

    const tradevilleBalanceElement = document.getElementById('tradeville-balance-value');
    if (tradevilleBalanceElement) {
      tradevilleBalanceElement.textContent =
        Math.round(tradevilleBalance).toLocaleString('en-US') + ' €';
    }

    const t212XtbUsdBalanceElement = document.getElementById('t212-xtb-usd-balance-value');
    if (t212XtbUsdBalanceElement) {
      t212XtbUsdBalanceElement.textContent =
        Math.round(t212XtbUsdBalance).toLocaleString('en-US') + ' €';
    }

    const cryptoBalanceElement = document.getElementById('crypto-balance-value');
    if (cryptoBalanceElement) {
      cryptoBalanceElement.textContent = Math.round(cryptoBalance).toLocaleString('en-US') + ' €';
    }

    const bankDepositBalanceElement = document.getElementById('bank-deposit-balance-value');
    if (bankDepositBalanceElement) {
      bankDepositBalanceElement.textContent =
        Math.round(bankDepositBalance).toLocaleString('en-US') + ' €';
    }

    // Recalculate XTB EUR profit from UI values
    const xtbEurBalanceFromUI =
      parseFloat(
        document.getElementById('xtb-eur-balance-value')?.textContent.replace(/[^0-9.-]/g, '')
      ) || 0;
    const xtbEurDepositsFromUI =
      parseFloat(document.getElementById('xtb-eur-value')?.textContent.replace(/[^0-9.-]/g, '')) ||
      0;
    const xtbEurProfitFromUI = xtbEurBalanceFromUI - xtbEurDepositsFromUI;
    const xtbEurReturnFromUI =
      xtbEurDepositsFromUI > 0 ? (xtbEurProfitFromUI / xtbEurDepositsFromUI) * 100 : 0;

    // Update UI - Profit section
    // Helper function to update profit and return for a broker
    const updateBrokerProfit = (profitId, returnId, profit, returnPercent, brokerName) => {
      const profitElement = document.getElementById(profitId);
      const returnElement = document.getElementById(returnId);

      if (profitElement) {
        // Set profit value
        profitElement.textContent = Math.round(profit).toLocaleString('en-US') + ' €';

        // Apply color based on profit value
        if (profit >= 0) {
          profitElement.style.color = '#00ff88';
          profitElement.style.textShadow = '0 0 15px rgba(0,255,136,0.4)';
        } else {
          profitElement.style.color = '#ff6b6b';
          profitElement.style.textShadow = '0 0 15px rgba(255,107,107,0.4), 0 0 2px rgba(0,0,0,1)';
        }
      }

      if (returnElement) {
        // Add return percentage with space (no vertical bar)
        const returnSign = returnPercent >= 0 ? '+' : '';
        returnElement.textContent = `  ${returnSign}${Math.round(returnPercent)}%`;
        returnElement.style.fontWeight = '700';
        returnElement.style.fontSize = '0.85rem';

        // Apply same color as profit
        if (profit >= 0) {
          returnElement.style.color = '#00ff88';
          returnElement.style.textShadow = '0 0 15px rgba(0,255,136,0.4)';
        } else {
          returnElement.style.color = '#ff6b6b';
          returnElement.style.textShadow = '0 0 15px rgba(255,107,107,0.4), 0 0 2px rgba(0,0,0,1)';
        }
      }
    };

    // Update profit and return for all brokers (XTB EUR uses UI values)
    updateBrokerProfit(
      'xtb-eur-profit-value',
      'xtb-eur-return-percentage',
      xtbEurProfitFromUI,
      xtbEurReturnFromUI,
      'XTB EUR'
    );
    updateBrokerProfit(
      'tradeville-profit-value',
      'tradeville-return-percentage',
      tradevilleProfit,
      tradevilleReturn,
      'Tradeville'
    );
    updateBrokerProfit(
      't212-xtb-usd-profit-value',
      't212-xtb-usd-return-percentage',
      t212XtbUsdProfit,
      t212XtbUsdReturn,
      'T212 + XTB USD'
    );
    updateBrokerProfit(
      'crypto-profit-value',
      'crypto-return-percentage',
      cryptoProfit,
      cryptoReturn,
      'Crypto'
    );
    updateBrokerProfit(
      'bank-deposits-profit-value',
      'bank-deposits-return-percentage',
      bankDepositsProfit,
      bankDepositsReturn,
      'Bank Deposits'
    );

    // Ensure top Balance equals sum of breakdowns
    const unifiedTop =
      xtbEurBalance + tradevilleBalance + t212XtbUsdBalance + cryptoBalance + bankDepositBalance;
    const balanceElement = document.getElementById('total-balance');
    if (balanceElement) {
      balanceElement.textContent = Math.round(unifiedTop).toLocaleString('en-US');
    }
    updateProfit();
    updateAllWeights(unifiedTop);
    try { updateBalanceTotalReturn(); } catch {}
  } catch (error) {
    console.error('Error updating balance breakdown:', error);
  }
}

// ========== WITHDRAWALS SECTION ==========
const withdrawalsTbody = document.getElementById('withdrawals-table-body');
const addWithdrawalBtn = document.getElementById('add-withdrawal-btn');
const floatingAddWithdrawalBtn = document.getElementById('floating-add-withdrawal-btn');
let currentEditingWithdrawal = null;

// ---- API fallback helpers (handle mismatch between page origin and API server port) ----
let API_BASE_CACHED = null;
function buildBaseCandidates() {
  const candidates = [];
  // Prefer an explicit override only if provided by the page
  if (typeof window !== 'undefined' && window.API_BASE_OVERRIDE) {
    candidates.push(window.API_BASE_OVERRIDE);
  }
  // Add configured API_BASE if defined (must match origin or have CORS enabled)
  if (typeof API_BASE !== 'undefined' && API_BASE) {
    candidates.push(API_BASE);
  }
  // Always include current origin explicitly to avoid cross-origin CORS issues
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    candidates.push(window.location.origin);
  }
  // Do NOT auto-probe arbitrary localhost ports; this caused CORS failures.
  return Array.from(new Set(candidates));
}
async function probeBase(base) {
  try {
    const resp = await fetch(`${base}/api/withdrawals`, { method: 'GET' });
    if (resp && resp.ok) return true;
    console.warn(`Probe ${base} -> status ${resp?.status}`);
    return false;
  } catch (e) {
    console.warn(`Probe failed for ${base}: ${e?.message || e}`);
    return false;
  }
}
async function apiFetchWithFallback(method, path, payload) {
  const headers = { 'Content-Type': 'application/json' };
  const bases = buildBaseCandidates();
  // Prefer cached base, if any
  if (API_BASE_CACHED) {
    bases.unshift(API_BASE_CACHED);
  }
  // Reorder: prioritize same-origin first to avoid CORS, then override, then others
  const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : null;
  const sortedBases = bases.sort((a,b) => {
    if (origin && a === origin) return -1;
    if (origin && b === origin) return 1;
    if (typeof window !== 'undefined' && window.API_BASE_OVERRIDE) {
      if (a === window.API_BASE_OVERRIDE) return -1;
      if (b === window.API_BASE_OVERRIDE) return 1;
    }
    return 0;
  });
  // Try same-origin relative request first to avoid any base mismatch
  try {
    const relResp = await fetch(path, {
      method,
      headers,
      body: payload != null ? JSON.stringify(payload) : undefined,
    });
    if (relResp.ok) {
      API_BASE_CACHED = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : null;
      console.log(`API relative path succeeded: ${path}`);
      return relResp;
    }
  } catch (e) {
    console.warn(`Relative API request failed for ${path}: ${e?.message || e}`);
  }
  // If making a mutating request and no cached base, probe for a reachable base using GET /api/withdrawals
  if (!API_BASE_CACHED && method !== 'GET') {
    for (const base of sortedBases) {
      const ok = await probeBase(base);
      if (ok) {
        API_BASE_CACHED = base;
        console.log(`API base probed & selected: ${API_BASE_CACHED}`);
        break;
      }
    }
  }
  for (const base of (API_BASE_CACHED ? [API_BASE_CACHED, ...sortedBases] : sortedBases)) {
    try {
      const url = `${base}${path}`;
      console.log(`Trying API base: ${base} -> ${method} ${path}`);
      const resp = await fetch(url, {
        method,
        headers,
        body: payload != null ? JSON.stringify(payload) : undefined,
      });
      if (resp.ok) {
        API_BASE_CACHED = base;
        console.log(`API base selected: ${API_BASE_CACHED}`);
        return resp;
      }
      console.warn(`API responded ${resp.status} for ${url}`);
    } catch (e) {
      console.warn(`API base failed: ${base} (${e?.message || e})`);
    }
  }
  return null;
}
async function apiGet(path) { return apiFetchWithFallback('GET', path, null); }
async function apiPost(path, payload) { return apiFetchWithFallback('POST', path, payload); }
async function apiPut(path, payload) { return apiFetchWithFallback('PUT', path, payload); }
async function apiDelete(path) { return apiFetchWithFallback('DELETE', path, null); }

async function loadWithdrawals() {
  try {
    const resp = await apiGet(`/api/withdrawals`);
    if (!resp) throw new Error('API not reachable for withdrawals');
    if (!resp.ok) {
      console.warn(`GET /api/withdrawals returned ${resp.status}; showing local/empty list`);
      const local = readWithdrawalsFromStorage();
      withdrawalsTbody.innerHTML = '';
      if (Array.isArray(local) && local.length) {
        local.forEach((it, idx) => {
          createWithdrawalRow({ nr: idx + 1, date: it.date, amount: (Number(it.amount).toFixed(2) + ' €'), month: it.month });
        });
      }
      updateWithdrawalNumbers();
      updateMetricWithdrawalAmount();
      return;
    }
    const items = await resp.json();
    withdrawalsTbody.innerHTML = '';
    items.forEach((it, idx) => {
      const row = createWithdrawalRow({ nr: idx + 1, date: it.date, amount: (Number(it.amount).toFixed(2) + ' €'), month: it.month });
      row.dataset.withdrawalId = it.id;
    });
    // Mirror server data to localStorage
    writeWithdrawalsToStorage(items.map(it => ({ date: it.date, amount: Number(it.amount) || 0, month: it.month })));
    updateWithdrawalNumbers();
    updateMetricWithdrawalAmount();
  } catch (e) {
    console.error('Failed to load withdrawals', e);
    const local = readWithdrawalsFromStorage();
    withdrawalsTbody.innerHTML = '';
    if (Array.isArray(local) && local.length) {
      local.forEach((it, idx) => {
        createWithdrawalRow({ nr: idx + 1, date: it.date, amount: (Number(it.amount).toFixed(2) + ' €'), month: it.month });
      });
    }
    updateWithdrawalNumbers();
    updateMetricWithdrawalAmount();
  }
}

function getMonthNameFromDate(dateStr) {
  // Expect DD/MM/YYYY
  if (!dateStr || !/\d{2}\/\d{2}\/\d{4}/.test(dateStr)) return '-';
  const [day, month] = dateStr.split('/');
  const monthIndex = parseInt(month, 10) - 1;
  const months = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];
  return months[monthIndex] || '-';
}

function createWithdrawalRow(data = null) {
  const row = document.createElement('tr');
  const nr = data?.nr || withdrawalsTbody.querySelectorAll('tr').length + 1;
  const dateVal = data?.date || getCurrentDate();
  const amountVal = data?.amount || '-';
  const monthVal = data?.month || getMonthNameFromDate(dateVal);
  row.innerHTML = `
    <td data-field="nr">${nr}</td>
    <td data-field="date">${dateVal}</td>
    <td class="editable-cell" data-field="amount">${amountVal}</td>
    <td class="editable-cell" data-field="month">${monthVal}</td>
    <td class="action-buttons">
      <button class="edit-btn" title="Edit">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      </button>
      <button class="delete-btn" title="Delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      </button>
    </td>
  `;
  withdrawalsTbody.appendChild(row);
  attachWithdrawalRowListeners(row);
  return row;
}

function attachWithdrawalRowListeners(row) {
  const editBtn = row.querySelector('.edit-btn');
  const deleteBtn = row.querySelector('.delete-btn');

  editBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (editBtn.title === 'Edit') {
      await exitWithdrawalEditMode();
      currentEditingWithdrawal = row;
      editBtn.title = 'Save';
      editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      const amountCell = row.querySelector('[data-field="amount"]');
      const amountVal = amountCell.textContent.trim();
      const input = document.createElement('input');
      input.type = 'text';
      input.value = amountVal === '-' ? '' : amountVal.replace(/[^0-9.\-]/g,'');
      input.placeholder = 'Amount';
      amountCell.textContent = '';
      amountCell.appendChild(input);
      input.focus();
      input.addEventListener('keypress', (ev) => { if (ev.key === 'Enter') exitWithdrawalEditMode(); });

      // Month dropdown editable
      const monthCell = row.querySelector('[data-field="month"]');
      if (monthCell) {
        const currentMonth = monthCell.textContent.trim();
        const months = [
          'January','February','March','April','May','June',
          'July','August','September','October','November','December'
        ];
        const select = document.createElement('select');
        select.innerHTML = '<option value="">Select Month</option>' + months.map(m => `<option value="${m}" ${currentMonth===m?'selected':''}>${m}</option>`).join('');
        monthCell.textContent = '';
        monthCell.appendChild(select);
      }
    } else {
      await exitWithdrawalEditMode();
    }
  });

  deleteBtn.addEventListener('click', () => {
    const nr = row.querySelector('[data-field="nr"]').textContent;
    showDeleteModal(`Withdrawal #${nr}`, async () => {
      const id = row.dataset.withdrawalId;
      if (id) {
        try { await apiDelete(`/api/withdrawals/${id}`); } catch (e) { console.error('Failed to delete withdrawal', e); }
      }
      // Remove from localStorage mirror
      const date = row.querySelector('[data-field="date"]').textContent.trim();
      const amountText = row.querySelector('[data-field="amount"]').textContent.trim();
      const month = row.querySelector('[data-field="month"]').textContent.trim();
      const amount = parseFloat(amountText.replace(/[^0-9.\-]/g,'')) || 0;
      removeWithdrawalFromStorage({ date, amount, month });
      row.remove();
      updateWithdrawalNumbers();
      updateMetricWithdrawalAmount();
    });
  });
}

async function exitWithdrawalEditMode() {
  if (!currentEditingWithdrawal) return;
  const editBtn = currentEditingWithdrawal.querySelector('.edit-btn');
  if (editBtn && editBtn.title === 'Save') {
    const amountCell = currentEditingWithdrawal.querySelector('[data-field="amount"]');
    const input = amountCell.querySelector('input');
    let val = input ? input.value.trim() : '';
    if (val) {
      // Normalize numeric and append €
      const num = parseFloat(val.replace(/[^0-9.\-]/g,'')); 
      if (!isNaN(num)) amountCell.textContent = num.toFixed(2) + ' €'; else amountCell.textContent = '-';
    } else {
      amountCell.textContent = '-';
    }
    // Persist chosen month from dropdown (if present)
    const monthCell = currentEditingWithdrawal.querySelector('[data-field="month"]');
    if (monthCell) {
      const select = monthCell.querySelector('select');
      if (select) {
        const chosen = select.value || '-';
        monthCell.textContent = chosen;
      }
    }
    // Persist to backend
    const id = currentEditingWithdrawal.dataset.withdrawalId;
    const dateCell = currentEditingWithdrawal.querySelector('[data-field="date"]');
    const amountText = amountCell.textContent.trim();
    const payload = {
      date: dateCell ? dateCell.textContent.trim() : '',
      amount: parseFloat(amountText.replace(/[^0-9.\-]/g,'')) || 0,
      month: monthCell ? monthCell.textContent.trim() : ''
    };
    try {
      if (id) {
        const resp = await apiPut(`/api/withdrawals/${id}`, payload);
        if (!resp.ok) {
          const err = await resp.text();
          console.error('PUT /withdrawals error', err);
          alert('Failed to save withdrawal. Please try again.');
        }
      } else {
        const resp = await apiPost(`/api/withdrawals`, payload);
        if (resp && resp.ok) {
          const saved = await resp.json();
          currentEditingWithdrawal.dataset.withdrawalId = saved.id;
        } else {
          const status = resp ? resp.status : 0;
          const err = resp ? await resp.text() : 'API not reachable';
          console.error('POST /withdrawals failed', { status, err });
          alert('Backend unavailable for withdrawals (POST 404). Start the API and retry.');
          // Do not continue locally in DB-only mode
          return;
        }
      }
    } catch (e) {
      console.error('Failed to persist withdrawal', e);
      alert('Network error while saving withdrawal.');
    }
    // Mirror current row into localStorage
    const date = dateCell ? dateCell.textContent.trim() : '';
    const amountNum = parseFloat(amountText.replace(/[^0-9.\-]/g,'')) || 0;
    const mVal = monthCell ? monthCell.textContent.trim() : '';
    upsertWithdrawalInStorage({ date, amount: amountNum, month: mVal });
    editBtn.title = 'Edit';
    editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
    updateMetricWithdrawalAmount();
  }
  currentEditingWithdrawal = null;
}

// ---- Withdrawals localStorage helpers ----
function readWithdrawalsFromStorage() {
  try {
    const raw = localStorage.getItem('withdrawals');
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}
function writeWithdrawalsToStorage(arr) {
  try { localStorage.setItem('withdrawals', JSON.stringify(arr || [])); } catch (_) {}
}
function appendWithdrawalToStorage(item) {
  const arr = readWithdrawalsFromStorage();
  arr.push({ date: item.date, amount: Number(item.amount) || 0, month: item.month });
  writeWithdrawalsToStorage(arr);
}
function upsertWithdrawalInStorage(item) {
  const arr = readWithdrawalsFromStorage();
  const idx = arr.findIndex(x => x.date === item.date && x.month === item.month);
  if (idx >= 0) arr[idx] = { date: item.date, amount: Number(item.amount) || 0, month: item.month };
  else arr.push({ date: item.date, amount: Number(item.amount) || 0, month: item.month });
  writeWithdrawalsToStorage(arr);
}
function removeWithdrawalFromStorage(item) {
  let arr = readWithdrawalsFromStorage();
  const targetAmount = Number(item.amount) || 0;
  const idx = arr.findIndex(x => x.date === item.date && x.month === item.month && Number(x.amount) === targetAmount);
  if (idx >= 0) {
    arr.splice(idx, 1);
    writeWithdrawalsToStorage(arr);
  }
}

function updateWithdrawalNumbers() {
  const rows = withdrawalsTbody.querySelectorAll('tr');
  rows.forEach((r, idx) => {
    const nrCell = r.querySelector('[data-field="nr"]');
    if (nrCell) nrCell.textContent = idx + 1;
  });
}

function updateMetricWithdrawalAmount() {
  // Sum all withdrawal amounts and reflect in Metrics panel (warning style)
  let total = 0;
  withdrawalsTbody.querySelectorAll('tr').forEach((r) => {
    const amountCell = r.querySelector('[data-field="amount"]');
    if (!amountCell) return;
    const raw = amountCell.textContent.trim();
    if (!raw || raw === '-') return;
    const num = parseFloat(raw.replace(/[^0-9.\-]/g,'')) || 0;
    total += num;
  });
  const metricEl = document.getElementById('metric-withdrawal-amount');
  if (metricEl) metricEl.textContent = Math.round(total).toLocaleString('en-US') + ' €';
  // Update summary panel
  const totalEl = document.getElementById('withdrawals-total-amount');
  const countEl = document.getElementById('withdrawals-total-count');
  const avgEl = document.getElementById('withdrawals-average');
  const rows = withdrawalsTbody.querySelectorAll('tr');
  const count = rows.length;
  if (totalEl) totalEl.textContent = Math.round(total).toLocaleString('en-US') + ' €';
  if (countEl) countEl.textContent = count;
  if (avgEl) avgEl.textContent = count > 0 ? Math.round(total / count).toLocaleString('en-US') + ' €' : '0 €';
  // Update Return of Capital Ratio (Total Withdrawals / Total Deposits)
  updateReturnOfCapitalRatio(total);
}

function updateReturnOfCapitalRatio(totalWithdrawalsOverride = null) {
  // Read total withdrawals from override or compute from DOM
  let totalWithdrawals = Number(totalWithdrawalsOverride);
  if (!Number.isFinite(totalWithdrawals)) {
    totalWithdrawals = 0;
    withdrawalsTbody.querySelectorAll('tr').forEach((r) => {
      const amountCell = r.querySelector('[data-field="amount"]');
      if (!amountCell) return;
      const raw = amountCell.textContent.trim();
      if (!raw || raw === '-') return;
      const num = parseFloat(raw.replace(/[^0-9.\-]/g, '')) || 0;
      totalWithdrawals += num;
    });
  }
  // Read total deposits from embedded element; if missing/zero, derive from deposits table as fallback
  const depositsEl = document.getElementById('total-deposits-embedded') || document.getElementById('total-deposits-amount');
  let totalDeposits = depositsEl ? parseFloat((depositsEl.textContent || '').replace(/[^0-9.\-]/g, '')) || 0 : 0;
  if (!Number.isFinite(totalDeposits) || totalDeposits === 0) {
    try {
      // Fallback: compute from deposits table rows if available
      const rows = typeof depositsTbody !== 'undefined' ? depositsTbody.querySelectorAll('tr') : [];
      let sum = 0;
      rows.forEach((row) => {
        const amountCell = row.querySelector('[data-field="amount"]');
        if (!amountCell) return;
        const txt = amountCell.textContent.trim();
        const val = parseFloat(txt.replace(/[^0-9.\-]/g, '')) || 0;
        sum += val;
      });
      if (sum > 0) totalDeposits = sum;
    } catch {}
  }
  // Compute ratio: Total Withdrawals / Total Deposits
  const ratioPct = totalDeposits > 0 ? (totalWithdrawals * 100) / totalDeposits : 0;
  const rocEl = document.getElementById('metric-return-capital-ratio');
  if (rocEl) {
    rocEl.textContent = ratioPct.toFixed(1) + '%';
    rocEl.classList.toggle('accent', true);
  }
}

async function addNewWithdrawalRow() {
  exitWithdrawalEditMode();
  // Create immediately in backend to ensure persistence
  const date = getCurrentDate();
  const month = getMonthNameFromDate(date);
  const payload = { date, amount: 0, month };
  try {
    const resp = await apiPost(`/api/withdrawals`, payload);
    if (resp && resp.ok) {
      const saved = await resp.json();
      // Display with friendly formatting; keep amount editable
      const row = createWithdrawalRow({ nr: undefined, date: saved.date, amount: (Number(saved.amount).toFixed(2) + ' €'), month: saved.month });
      row.dataset.withdrawalId = saved.id;
      // auto enter edit mode
      setTimeout(() => {
        const editBtn = row.querySelector('.edit-btn');
        if (editBtn) editBtn.click();
      }, 50);
      updateWithdrawalNumbers();
      updateMetricWithdrawalAmount();
      return;
    }
  } catch (e) {
    console.error('Failed to create withdrawal', e);
  }
  // Fallback: create local row if backend failed
  const row = createWithdrawalRow({ date, amount: '-', month });
  setTimeout(() => {
    const editBtn = row.querySelector('.edit-btn');
    if (editBtn) editBtn.click();
  }, 50);
  updateWithdrawalNumbers();
  updateMetricWithdrawalAmount();
}

if (addWithdrawalBtn) {
  addWithdrawalBtn.addEventListener('click', addNewWithdrawalRow);
}
if (floatingAddWithdrawalBtn) {
  floatingAddWithdrawalBtn.addEventListener('click', addNewWithdrawalRow);
}

// Initial load
if (withdrawalsTbody) {
  loadWithdrawals().then(() => {
    try { updateReturnOfCapitalRatio(); } catch {}
  });
}

// Ensure ROC persists on refresh: recompute when deposits total updates
(function setupReturnOfCapitalObservers() {
  const targetIds = ['total-deposits-embedded', 'total-deposits-amount', 'withdrawals-total-amount'];
  const observer = new MutationObserver(() => {
    try { updateReturnOfCapitalRatio(); } catch {}
  });
  targetIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      observer.observe(el, { childList: true, subtree: true, characterData: true });
    }
  });
  // Also schedule a late recompute in case tables render after initial scripts
  setTimeout(() => { try { updateReturnOfCapitalRatio(); } catch {} }, 500);
})();


function updateProfit() {
  const balanceElement = document.getElementById('total-balance');
  // Prefer embedded total deposits inside Money Invested panel (Deposits page)
  const depositsElement =
    document.getElementById('total-deposits-embedded') ||
    document.getElementById('total-deposits-amount');
  const profitElement = document.getElementById('total-profit');

  if (balanceElement && depositsElement && profitElement) {
    const balance = parseFloat(balanceElement.textContent.replace(/[^0-9.-]/g, '')) || 0;
    const deposits = parseFloat(depositsElement.textContent.replace(/[^0-9.-]/g, '')) || 0;
    const profit = balance - deposits;

    profitElement.textContent = profit.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
}

// Add new deposit button
if (addDepositBtn) {
  addDepositBtn.addEventListener('click', async () => {
    console.log('Add deposit button clicked!');
    exitDepositEditMode();
    const data = {
      count: depositsTbody.querySelectorAll('tr').length + 1,
      date: getCurrentDate(),
      amount: '-',
      account: '-',
      month: '-',
    };
    console.log('Deposit data to save:', data);
    const result = await addDepositToDatabase(data);
    console.log('Result from database:', result);
    if (result) {
      const newRow = createDepositRow(result);
      console.log('New row created:', newRow);
      updateTotalDeposits();
      // Enter edit mode automatically
      setTimeout(() => {
        const editBtn = newRow.querySelector('.edit-btn');
        if (editBtn) {
          console.log('Clicking edit button');
          editBtn.click();
        }
      }, 100);
    } else {
      console.error('Failed to add deposit to database');
    }
  });
} else {
  console.error('addDepositBtn not found!');
}

// ========== SETTINGS: Investing duration ==========
function computeInvestingMonths(startStr) {
  if (!startStr) return 0;
  // Support both HTML date input (YYYY-MM-DD) and DD/MM/YYYY
  let y = 0, m = 0, d = 1;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const dmy = /^\d{2}\/\d{2}\/\d{4}$/;
  const dmyDots = /^\d{2}\.\d{2}\.\d{4}$/;
  const roMonthMap = {
    ianuarie: 1, februarie: 2, martie: 3, aprilie: 4, mai: 5, iunie: 6,
    iulie: 7, august: 8, septembrie: 9, octombrie: 10, noiembrie: 11, decembrie: 12,
  };
  const roPattern = /^(\d{1,2})\s+([A-Za-zăâîșț]+)\s+(\d{4})$/i; // e.g., "1 aprilie 2022"
  if (iso.test(startStr)) {
    const [yy, mm, dd] = startStr.split('-').map(Number);
    y = yy; m = mm; d = dd;
  } else if (dmy.test(startStr)) {
    const [dd, mm, yy] = startStr.split('/').map(Number);
    y = yy; m = mm; d = dd;
  } else if (dmyDots.test(startStr)) {
    const [dd, mm, yy] = startStr.split('.').map(Number);
    y = yy; m = mm; d = dd;
  } else if (roPattern.test(startStr.trim())) {
    const match = startStr.trim().match(roPattern);
    const dd = parseInt(match[1], 10);
    const monthName = (match[2] || '').toLowerCase();
    const yy = parseInt(match[3], 10);
    const mm = roMonthMap[monthName] || 0;
    if (!mm) return 0;
    y = yy; m = mm; d = dd;
  } else {
    // Fallback: try Date parse
    const t = new Date(startStr);
    if (isNaN(t.getTime())) return 0;
    y = t.getFullYear(); m = t.getMonth() + 1; d = t.getDate();
  }
  // Current date components
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1; // 1-12
  const cd = now.getDate();
  // Months difference
  let total = (cy - y) * 12 + (cm - m);
  // Adjust for day-of-month if current day is before start day
  if (cd < d) total -= 1;
  // Clamp
  if (!Number.isFinite(total) || total < 0) total = 0;
  return total;
}

function initSettingsInvesting() {
  const input = document.getElementById('settings-investing-start-date');
  const saveBtn = document.getElementById('settings-investing-save-btn');
  const resultEl = document.getElementById('settings-investing-result');
  if (!input || !saveBtn || !resultEl) return;

  function toISODate(val) {
    if (!val) return '';
    // Already ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    // DD/MM/YYYY
    const m1 = val.match(/^([0-9]{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m1) {
      const dd = m1[1].padStart(2,'0');
      const mm = m1[2].padStart(2,'0');
      const yy = m1[3];
      return `${yy}-${mm}-${dd}`;
    }
    // "1 aprilie 2022" Romanian style
    const roMonthMap = {
      ianuarie: '01', februarie: '02', martie: '03', aprilie: '04', mai: '05', iunie: '06',
      iulie: '07', august: '08', septembrie: '09', octombrie: '10', noiembrie: '11', decembrie: '12',
    };
    const m2 = val.trim().match(/^(\d{1,2})\s+([A-Za-zăâîșț]+)\s+(\d{4})$/i);
    if (m2) {
      const dd = m2[1].padStart(2,'0');
      const mm = roMonthMap[(m2[2]||'').toLowerCase()] || '00';
      const yy = m2[3];
      if (mm !== '00') return `${yy}-${mm}-${dd}`;
    }
    // Fallback: Date parse
    const t = new Date(val);
    if (!isNaN(t.getTime())) {
      const yy = String(t.getFullYear());
      const mm = String(t.getMonth()+1).padStart(2,'0');
      const dd = String(t.getDate()).padStart(2,'0');
      return `${yy}-${mm}-${dd}`;
    }
    return '';
  }
  // Prefill from DB
  (async () => {
    try {
      const resp = await apiGet('/api/settings/investing-start');
      let saved = '';
      if (resp && resp.ok) {
        const jsn = await resp.json();
        saved = jsn?.value || '';
      }
      if (saved) {
        const iso = toISODate(saved);
        if (iso) input.value = iso;
        const m = computeInvestingMonths(iso || saved);
        window.__investingMonthsCached = m;
        resultEl.textContent = `Investing for ${m} months`;
        saveBtn.textContent = 'Edit';
        input.disabled = true;
        window.__investingHasValue = true;
        try { updateAverageMonthlyContribution(); } catch {}
        try { updateAverageAnnualReturn(); } catch {}
        try { updateBalanceTotalReturn(); } catch {}
      } else {
        saveBtn.textContent = 'Save';
        input.disabled = false;
        window.__investingHasValue = false;
      }
    } catch (e) {
      saveBtn.textContent = 'Save';
      input.disabled = false;
      window.__investingHasValue = false;
    }
  })();

  saveBtn.addEventListener('click', () => {
    // Toggle behavior: Save -> persist and switch to Edit; Edit -> enable editing and switch to Save
    const currentLabel = (saveBtn.textContent || '').trim().toLowerCase();
    if (currentLabel === 'save') {
      const val = toISODate(input.value || '');
      const months = computeInvestingMonths(val);
      window.__investingMonthsCached = months;
      resultEl.textContent = `Investing for ${months} months`;
      // Persist to DB
      (async () => {
        try {
          const resp = await apiPost('/api/settings/investing-start', { value: val });
          if (!resp || !resp.ok) console.warn('Failed to save investing start in DB');
        } catch (e) { console.warn('DB save error (investing start)', e); }
      })();
      // Switch to Edit state and lock input
      saveBtn.textContent = 'Edit';
      input.disabled = true;
      try { updateAverageMonthlyContribution(); } catch {}
      try { updateAverageAnnualReturn(); } catch {}
      try { updateBalanceTotalReturn(); } catch {}
    } else {
      // Switch to Save state and enable input
      saveBtn.textContent = 'Save';
      input.disabled = false;
      input.focus();
    }
  });
}

// Initialize settings after DOM
setTimeout(initSettingsInvesting, 0);

// Compute Average Monthly Contribution: sum Money invested (excluding Bank Deposits) / months
function parseEuroText(text) {
  if (!text) return 0;
  return parseFloat(String(text).replace(/[^0-9.\-]/g, '')) || 0;
}

function getTextById(id) {
  const el = document.getElementById(id);
  return el ? el.textContent || '' : '';
}

function updateAverageMonthlyContribution() {
  // Sum Money invested components except Bank Deposits
  const xtb = parseEuroText(getTextById('xtb-eur-value'));
  const tv = parseEuroText(getTextById('tradeville-value'));
  const usd = parseEuroText(getTextById('t212-xtb-usd-value'));
  const crypto = parseEuroText(getTextById('crypto-value'));
  // Exclude bank deposits
  const totalInvestedExclBank = xtb + tv + usd + crypto;
  // Months from settings
  let months = 0;
  try { months = window.__investingMonthsCached ?? 0; } catch {}
  const avg = months > 0 ? totalInvestedExclBank / months : 0;
  const el = document.getElementById('metric-average-monthly-contribution');
  if (el) el.textContent = Math.round(Number.isFinite(avg) ? avg : 0).toLocaleString('en-US') + ' €';
}

// CAGR (Compound Annual Growth Rate) using Vfinal = total balance, Vinitial = money invested excluding Bank Deposits, n = months/12
function updateAverageAnnualReturn() {
  // Read total balance (EUR number from Dashboard)
  const balanceText = getTextById('total-balance');
  let Vfinal = parseEuroText(balanceText);
  // Exclude Bank Deposits balance from Vfinal (not considered an investment)
  const bankBalanceText = getTextById('bank-deposit-balance-value');
  const bankBalance = parseEuroText(bankBalanceText);
  if (Number.isFinite(bankBalance) && bankBalance > 0) {
    Vfinal = Math.max(0, Vfinal - bankBalance);
  }
  // Read money invested components and exclude bank deposits
  const xtb = parseEuroText(getTextById('xtb-eur-value'));
  const tv = parseEuroText(getTextById('tradeville-value'));
  const usd = parseEuroText(getTextById('t212-xtb-usd-value'));
  const crypto = parseEuroText(getTextById('crypto-value'));
  const Vinitial = xtb + tv + usd + crypto;
  // Months to years from settings
  let months = 0;
  try { months = window.__investingMonthsCached ?? 0; } catch {}
  const nYears = months / 12;
  let cagrPct = 0;
  if (Vinitial > 0 && Vfinal > 0 && nYears > 0) {
    cagrPct = (Math.pow(Vfinal / Vinitial, 1 / nYears) - 1) * 100;
  }
  const el = document.getElementById('metric-average-annual-return');
  if (el) {
    const pct = Number.isFinite(cagrPct) ? cagrPct : 0;
    const sign = pct >= 0 ? '+' : '';
    el.textContent = `${sign}${pct.toFixed(2)}%`;
    el.classList.toggle('positive', cagrPct >= 0);
  }
}

// Balance total return: Total Deposits (excl. Bank Deposits) / Total Balance (excl. Bank Deposit balance)
function updateBalanceTotalReturn() {
  // Final balance minus Bank Deposit balance
  const balanceText = getTextById('total-balance');
  let finalBalance = parseEuroText(balanceText);
  const bankBalanceText = getTextById('bank-deposit-balance-value');
  const bankBalance = parseEuroText(bankBalanceText);
  if (Number.isFinite(bankBalance) && bankBalance > 0) {
    finalBalance = Math.max(0, finalBalance - bankBalance);
  }
  // Total deposits excluding Bank Deposits
  const xtb = parseEuroText(getTextById('xtb-eur-value'));
  const tv = parseEuroText(getTextById('tradeville-value'));
  const usd = parseEuroText(getTextById('t212-xtb-usd-value'));
  const crypto = parseEuroText(getTextById('crypto-value'));
  const totalDepositsExclBank = xtb + tv + usd + crypto;
  // Guard and compute ratio as percentage
  const el = document.getElementById('metric-balance-total-return');
  if (!el) return;
  if (finalBalance <= 0 || totalDepositsExclBank <= 0) {
    el.textContent = '–';
    return;
  }
  // Requested formula: (Final (excl. bank) - Initial (excl. bank)) / Initial (excl. bank)
  const ratioPct = ((finalBalance - totalDepositsExclBank) / totalDepositsExclBank) * 100;
  const sign = ratioPct >= 0 ? '+' : '';
  el.textContent = `${sign}${ratioPct.toFixed(2)}%`;
  el.classList.toggle('positive', ratioPct >= 0);
}


// ========== PIE CHART FUNCTION ==========
async function updateBalancePieChart() {
  console.log('updateBalancePieChart called');
  const rows = stocksTbody.querySelectorAll('tr');
  console.log('Number of rows:', rows.length);

  // Aggregate weights by risk category
  const riskData = {
    '🟩 Very Safe': 0,
    '🟦 Safe': 0,
    '🟨 Medium-Safe': 0,
    '🟥 High Risk': 0,
  };

  rows.forEach((row) => {
    const cells = row.querySelectorAll('td');
    if (cells.length > 0) {
      const weightText = cells[2].textContent.trim();
      const riskText = cells[10].textContent.trim();
      const weight = parseFloat(weightText.replace('%', '')) || 0;
      // Map risk to categories
      if (
        riskText.includes('Medium-Safe') ||
        riskText.includes('🟨') ||
        riskText.includes('Medium')
      ) {
        riskData['🟨 Medium-Safe'] += weight;
      } else if (riskText.includes('Very Safe') || riskText.includes('🟩')) {
        riskData['🟩 Very Safe'] += weight;
      } else if (riskText.includes('Safe') || riskText.includes('🟦')) {
        riskData['🟦 Safe'] += weight;
      } else if (riskText.includes('High Risk') || riskText.includes('🟥')) {
        riskData['🟥 High Risk'] += weight;
      }
    }
  });

  // If table weights are not ready, compute weights directly from stocks API
  const totalFromTable = Object.values(riskData).reduce((s, v) => s + v, 0);
  if (rows.length === 0 || totalFromTable === 0) {
    try {
      const resp = await fetch('/api/stocks');
      const stocks = await resp.json();
      // Compute allocation per stock and total
      let totalAlloc = 0;
      const addToRisk = (risk, amount) => {
        if (!risk || risk === '-') return;
        if (risk.includes('Medium-Safe') || risk.includes('🟨') || risk.includes('Medium')) {
          riskData['🟨 Medium-Safe'] += amount;
        } else if (risk.includes('Very Safe') || risk.includes('🟩')) {
          riskData['🟩 Very Safe'] += amount;
        } else if (risk.includes('Safe') || risk.includes('🟦')) {
          riskData['🟦 Safe'] += amount;
        } else if (risk.includes('High Risk') || risk.includes('🟥')) {
          riskData['🟥 High Risk'] += amount;
        }
      };
      stocks.forEach((st) => {
        const shares = parseFloat(st.shares) || 0;
        let priceStr = String(st.share_price || '0')
          .replace(/[$€\s]/g, '')
          .replace(',', '.');
        let price = parseFloat(priceStr) || 0;
        const broker = st.broker || '';
        // Crypto prices entered in USD → convert to EUR for allocation consistency
        if (broker === 'Crypto' || String(st.share_price).includes('$')) {
          // We don't have rates here; assume updateTotalBalance handled elsewhere, still use raw for proportions
        }
        const alloc = shares * price;
        if (alloc > 0) {
          totalAlloc += alloc;
          addToRisk(st.risk || '', alloc);
        }
      });
      if (totalAlloc > 0) {
        // Convert absolute allocations to percentages
        Object.keys(riskData).forEach((k) => {
          riskData[k] = (riskData[k] / totalAlloc) * 100;
        });
      }
    } catch (e) {
      console.warn('Fallback risk computation failed:', e.message);
    }
  }

  console.log('Risk data aggregated:', riskData);

  // Filter out zero values
  const labels = [];
  const data = [];
  const colors = [];

  if (riskData['🟩 Very Safe'] > 0) {
    labels.push('Very Safe');
    data.push(riskData['🟩 Very Safe'].toFixed(2));
    colors.push('#4CAF50'); // Green
  }
  if (riskData['🟦 Safe'] > 0) {
    labels.push('Safe');
    data.push(riskData['🟦 Safe'].toFixed(2));
    colors.push('#2196F3'); // Blue
  }
  if (riskData['🟨 Medium-Safe'] > 0) {
    labels.push('Medium-Safe');
    data.push(riskData['🟨 Medium-Safe'].toFixed(2));
    colors.push('#FFC107'); // Yellow
  }
  if (riskData['🟥 High Risk'] > 0) {
    labels.push('High Risk');
    data.push(riskData['🟥 High Risk'].toFixed(2));
    colors.push('#F44336'); // Red
  }

  console.log('Chart labels:', labels);
  console.log('Chart data:', data);
  console.log('Chart colors:', colors);

  // If nothing to render yet, retry shortly (data may still be loading)
  if (labels.length === 0 && balancePieChartRetries < 3) {
    balancePieChartRetries += 1;
    console.log(`Pie chart has no data yet. Retrying (${balancePieChartRetries}/3)...`);
    setTimeout(updateBalancePieChart, 600);
    return;
  } else if (labels.length > 0) {
    // Reset retry counter once we have data
    balancePieChartRetries = 0;
  }

  // Create or update chart
  const ctx = document.getElementById('balance-pie-chart');
  console.log('Canvas element:', ctx);
  if (!ctx) {
    console.error('Canvas not found!');
    return;
  }

  if (balancePieChart) {
    balancePieChart.destroy();
  }

  console.log('Creating chart...');

  // Create translucent colors with alpha
  const translucentColors = colors.map((color) => {
    // Convert hex to rgba with 85% opacity for WOW translucent effect
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, 0.85)`;
  });

  // Create gradient backgrounds for each slice
  const gradients = colors.map((color, index) => {
    const gradient = ctx.getContext('2d').createRadialGradient(150, 150, 50, 150, 150, 150);
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);

    // Inner glow (lighter, more translucent)
    gradient.addColorStop(
      0,
      `rgba(${Math.min(r + 60, 255)}, ${Math.min(g + 60, 255)}, ${Math.min(b + 60, 255)}, 0.95)`
    );
    // Outer edge (original color, translucent)
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.75)`);

    return gradient;
  });

  // Custom plugin for corner legends
  const cornerLegendsPlugin = {
    id: 'cornerLegends',
    afterDraw: (chart) => {
      const ctx = chart.ctx;
      const chartArea = chart.chartArea;
      const dataset = chart.data.datasets[0];
      const labels = chart.data.labels;

      ctx.save();
      ctx.font = 'bold 13px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';

      // Position mapping: High Risk (top-left), Very Safe (top-right), Medium-Safe (bottom-left), Safe (bottom-right)
      const positions = {
        'High Risk': { x: 5, y: 5, align: 'left' },
        'Very Safe': { x: chartArea.right, y: 5, align: 'right' },
        'Medium-Safe': { x: 0, y: chartArea.bottom + 20, align: 'left' },
        Safe: { x: chartArea.right - 5, y: chartArea.bottom + 20, align: 'right' },
      };

      labels.forEach((label, i) => {
        const pos = positions[label];
        if (!pos) return;

        const color = dataset.backgroundColor[i];
        const text = label;

        ctx.textAlign = pos.align;
        ctx.textBaseline = pos.y < 50 ? 'top' : 'bottom';

        // Draw colored circle
        const circleX = pos.align === 'left' ? pos.x : pos.x - ctx.measureText(text).width - 15;
        const circleY = pos.y + (pos.y < 50 ? 7 : -7);

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(circleX + 6, circleY, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw text (only label, no percentage)
        ctx.fillStyle = 'white';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;

        const textX = pos.align === 'left' ? circleX + 18 : pos.x;
        ctx.fillText(text, textX, pos.y);

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      });

      ctx.restore();
    },
  };

  const pluginsArr = [cornerLegendsPlugin];
  if (typeof ChartDataLabels !== 'undefined') {
    pluginsArr.unshift(ChartDataLabels);
  }

  balancePieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [
        {
          data: data,
          backgroundColor: translucentColors,
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 3,
          hoverOffset: 20,
          hoverBorderColor: 'rgba(255, 255, 255, 0.4)',
          hoverBorderWidth: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '60%',
      plugins: {
        legend: {
          display: false,
        },
        datalabels:
          typeof ChartDataLabels !== 'undefined'
            ? {
                color: 'white',
                anchor: 'center',
                align: 'center',
                clamp: true,
                font: {
                  weight: '700',
                  size: 12,
                },
                formatter: (value, ctx) => {
                  // value is already percentage string; ensure numeric
                  const v = parseFloat(value);
                  if (!isFinite(v) || v <= 0) return '';
                  return `${v.toFixed(2)}%`;
                },
              }
            : undefined,
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          titleColor: 'white',
          bodyColor: 'white',
          padding: 16,
          borderColor: 'rgba(255, 255, 255, 0.4)',
          borderWidth: 2,
          displayColors: false,
          cornerRadius: 8,
          boxPadding: 6,
          callbacks: {
            title: function (contexts) {
              const label = contexts[0]?.label || '';
              const notes = {
                'Medium-Safe': 'RO companies from BET-TR index',
                'High Risk': 'Small US companies, Thematic ETFs, Crypto',
                'Very Safe': 'Cash, Bank Deposits',
                Safe: 'Dividend ETFs, S&P 500 ETF',
              };
              const text = notes[label] || label;
              const maxLen = 32; // wrap to new line when exceeding ~32 chars
              const words = String(text).split(' ');
              const lines = [];
              let current = '';
              for (const w of words) {
                const next = current ? current + ' ' + w : w;
                if (next.length > maxLen) {
                  if (current) lines.push(current);
                  current = w;
                } else {
                  current = next;
                }
              }
              if (current) lines.push(current);
              return lines; // Chart.js will render each array item on a new line
            },
            label: function (context) {
              return `${context.parsed}%`;
            },
          },
        },
        cornerLegends: {},
      },
      animation: {
        animateRotate: true,
        animateScale: true,
        duration: 1000,
        easing: 'easeInOutQuart',
      },
      layout: {
        padding: 20,
      },
    },
    plugins: pluginsArr,
  });
}

// Check if enough time passed since last snapshot, then save
async function checkAndSaveSnapshot() {
  try {
    // Get the most recent snapshot from database
    const response = await fetch('/api/performance-snapshots?range=max');
    const data = await response.json();
    const snapshots = data.snapshots || [];

    const now = Date.now();

    if (snapshots.length > 0) {
      const lastSnapshot = snapshots[snapshots.length - 1];
      const lastTimestamp = lastSnapshot.timestamp;
      const timeSinceLastSnapshot = now - lastTimestamp;

      if (timeSinceLastSnapshot < 55000) {
        console.log(
          `📸 Skipping snapshot (only ${Math.round(timeSinceLastSnapshot / 1000)}s since last one in DB)`
        );
        return;
      }
    }

    console.log('📸 Saving snapshot after price refresh');
    await savePerformanceSnapshot();
  } catch (error) {
    console.error('Error checking snapshot timing:', error);
  }
}

// Save performance snapshot to database
async function savePerformanceSnapshot() {
  try {
    // Parse balance - remove thousands separator (comma)
    const balanceText = document.getElementById('total-balance')?.textContent || '0';
    const currentBalance = parseFloat(balanceText.replace(/,/g, '')) || 0;

    // Calculate total deposits from deposits data (not from DOM element which might not be loaded)
    let totalDeposits = 0;
    try {
      const response = await fetch('/api/deposits');
      const deposits = await response.json();
      totalDeposits = deposits.reduce((sum, deposit) => {
        // Remove € symbol, commas, and other non-numeric characters
        const cleanAmount = deposit.amount.replace(/[^0-9.-]/g, '');
        const amount = parseFloat(cleanAmount) || 0;
        return sum + amount;
      }, 0);
    } catch (err) {
      console.warn('Could not fetch deposits, using 0:', err.message);
    }
    // Normalize to cents to avoid tiny float drift
    totalDeposits = Math.round(totalDeposits * 100) / 100;
    const normalizedBalance = Math.round(currentBalance * 100) / 100;

    if (currentBalance === 0) {
      console.log('⏭️ Skipping snapshot save - balance not loaded yet');
      return;
    }

    console.log(`💾 Saving snapshot: Balance=${normalizedBalance}€, Deposits=${totalDeposits}€`);

    const response = await fetch(`${API_BASE}/api/performance-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolio_balance: normalizedBalance,
        total_deposits: totalDeposits,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Snapshot saved successfully:', result);

      // Refresh the chart to show new data point
      const activeBtn = document.querySelector('.time-btn.active');
      const range = activeBtn?.getAttribute('data-range') || '1m';
      updatePerformanceChart(range);
    } else {
      console.error('❌ Failed to save snapshot:', response.statusText);
    }
  } catch (error) {
    console.error('❌ Error saving snapshot:', error);
  }
}

// Snapshot saving is now integrated with price refresh (no separate interval needed)
function startSnapshotSaving() {
  console.log('📸 Snapshots will be saved automatically after each price refresh (every 60s)');
}

function stopSnapshotSaving() {
  // DISABLED: Snapshot saving should NEVER stop to track portfolio performance
  console.log('⚠️ stopSnapshotSaving called but ignored - snapshot saving continues');
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
  // Load table first, then immediately render charts using current DB data
  loadTableData().then(async () => {
    // Immediate chart render using existing DB values (no price refresh wait)
    try { updateBalancePieChart(); } catch {}
    try { updateTotalBalance(); } catch {}
    try { updatePerformanceChart('1d'); } catch {}

    // Fetch fresh prices in background, then re-render
    console.log('🚀 Fetching fresh prices in background...');
    refreshStockPrices().then(() => {
      console.log('✅ Fresh prices loaded, updating charts');
      try { updateTotalBalance(); } catch {}
      try { updateBalancePieChart(); } catch {}
      try { updatePerformanceChart('1d'); } catch {}
    });

    // Start auto-refresh and snapshot saving after initial load
    startAutoRefresh();
    startSnapshotSaving();
    startPriceChangeUpdates();
  });

  loadDepositsData().then(async () => {
    updateTotalDeposits();
    updateDepositsBreakdown();
    await updateBalanceBreakdown();
    try { updateAverageAnnualReturn(); } catch {}
    try { updateBalanceTotalReturn(); } catch {}
    // Ensure ROC updates after deposits are loaded
    try { updateReturnOfCapitalRatio(); } catch {}
  });

  loadDividends();

  // Initialize allocation chart when navigating to sectors section
  const sectorsLink = document.querySelector('[data-section="sectors"]');
  if (sectorsLink) {
    sectorsLink.addEventListener('click', () => {
      setTimeout(() => {
        setupAllocationToggle();
        loadAllocationData('sectors');
      }, 100);
    });
  }

  // Ensure allocation chart loads on initial page load (direct navigation or first visit)
  const allocationSection = document.getElementById('sectors-section');
  if (allocationSection) {
    setTimeout(() => {
      setupAllocationToggle();
      loadAllocationData('sectors');
    }, 150);
  }

  // Load dividends when dividends section is opened
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', () => {
      const section = link.getAttribute('data-section');
      // Load dividends when dividends section is opened
      if (section === 'dividends') {
        loadDividends();
      }
      // Auto-refresh and snapshot saving continue regardless of section
    });
  });

  // Time range selector for performance chart
  document.querySelectorAll('.time-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.time-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const range = btn.getAttribute('data-range');
      updatePerformanceChart(range);
    });
  });

  // Legend checkbox toggles for chart datasets
  document.querySelectorAll('.legend-toggle').forEach((checkbox) => {
    checkbox.addEventListener('change', function () {
      const datasetIndex = parseInt(this.dataset.dataset);
      // Persist visibility state
      if (!window.legendVisibility) window.legendVisibility = {};
      window.legendVisibility[datasetIndex] = this.checked;
      try { localStorage.setItem('legendVisibility', JSON.stringify(window.legendVisibility)); } catch {}
      if (window.performanceChart && window.performanceChart.data.datasets[datasetIndex]) {
        window.performanceChart.data.datasets[datasetIndex].hidden = !this.checked;
        window.performanceChart.update();
      }
    });
  });

  // Initialize legend visibility from localStorage
  try {
    const savedLegend = localStorage.getItem('legendVisibility');
    if (savedLegend) {
      window.legendVisibility = JSON.parse(savedLegend);
      document.querySelectorAll('.legend-toggle').forEach((cb) => {
        const idx = parseInt(cb.dataset.dataset);
        if (window.legendVisibility && window.legendVisibility[idx] != null) {
          cb.checked = !!window.legendVisibility[idx];
        }
      });
    }
  } catch {}

  // Admin section event listeners
  const refreshSnapshotsBtn = document.getElementById('refresh-snapshots-btn');
  const exportSnapshotsBtn = document.getElementById('export-snapshots-btn');
  const resetBaselineBtn = document.getElementById('reset-baseline-btn');
  const deleteOldSnapshotsBtn = document.getElementById('delete-old-snapshots-btn');
  const deleteAllSnapshotsBtn = document.getElementById('delete-all-snapshots-btn');
  const addSnapshotBtn = document.getElementById('add-snapshot-btn');

  if (refreshSnapshotsBtn) {
    refreshSnapshotsBtn.addEventListener('click', loadSnapshotsData);
  }

  if (resetBaselineBtn) {
    resetBaselineBtn.addEventListener('click', () => {
      if (confirm('🔄 RESET T0: Toate graficele vor porni de la 0% din acest moment. Continui?')) {
        resetBaseline();
      }
    });
  }

  if (exportSnapshotsBtn) {
    exportSnapshotsBtn.addEventListener('click', exportSnapshotsToCSV);
  }

  if (deleteOldSnapshotsBtn) {
    deleteOldSnapshotsBtn.addEventListener('click', () => {
      if (confirm('Delete all snapshots older than 30 days?')) {
        deleteOldSnapshots();
      }
    });
  }

  if (deleteAllSnapshotsBtn) {
    deleteAllSnapshotsBtn.addEventListener('click', () => {
      if (confirm('⚠️ WARNING: This will delete ALL performance snapshots! Are you sure?')) {
        if (confirm('This action cannot be undone. Continue?')) {
          deleteAllSnapshots();
        }
      }
    });
  }
  if (addSnapshotBtn) {
    addSnapshotBtn.addEventListener('click', () => {
      createEditableSnapshotRow();
    });
  }

  // Load snapshots when admin section is opened
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', () => {
      const section = link.getAttribute('data-section');
      console.log('Section clicked:', section);
      if (section === 'admin') {
        console.log('Admin section opened, initializing...');
        loadSnapshotsData();
        // Initialize delete range button when admin section is opened
        setTimeout(() => {
          console.log('Calling initDeleteRangeButton...');
          initDeleteRangeButton();
          initAdminSubmenu();
        }, 100);
      }
    });
  });

  // Also try to initialize immediately if admin section is already visible
  if (document.querySelector('.section.active')?.id === 'admin-section') {
    console.log('Admin section already visible, initializing immediately');
    initDeleteRangeButton();
    initAdminSubmenu();
  }

  // Initialize FX admin averages and do an initial refresh
  try {
    setupFxAdmin();
    refreshFxAnnualAverages();
  } catch (e) {
    console.warn('FX admin setup failed:', e);
  }
});

// Admin submenu: Snapshots vs Users
function initAdminSubmenu() {
  const tabSnapshots = document.getElementById('admin-tab-snapshots');
  const tabUsers = document.getElementById('admin-tab-users');
  const subSnapshots = document.getElementById('snapshots-subpage');
  const subUsers = document.getElementById('users-subpage');
  const switchEl = tabSnapshots?.closest('.allocation-switch');
  if (!tabSnapshots || !tabUsers || !subSnapshots || !subUsers) return;

  const setActive = (view) => {
    const isSnap = view === 'snapshots';
    tabSnapshots.classList.toggle('active', isSnap);
    tabSnapshots.setAttribute('aria-selected', String(isSnap));
    tabSnapshots.setAttribute('tabindex', isSnap ? '0' : '-1');
    tabUsers.classList.toggle('active', !isSnap);
    tabUsers.setAttribute('aria-selected', String(!isSnap));
    tabUsers.setAttribute('tabindex', !isSnap ? '0' : '-1');
    subSnapshots.style.display = isSnap ? 'flex' : 'none';
    subUsers.style.display = isSnap ? 'none' : 'flex';
    // Update switch glow position via container state class
    if (switchEl) {
      switchEl.classList.toggle('snapshots-active', isSnap);
      switchEl.classList.toggle('users-active', !isSnap);
    }
  };

  tabSnapshots.addEventListener('click', () => setActive('snapshots'));
  tabUsers.addEventListener('click', () => setActive('users'));

  // Keyboard navigation
  [tabSnapshots, tabUsers].forEach((btn) => {
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Right') {
        e.preventDefault();
        setActive('users');
        tabUsers.focus();
      } else if (e.key === 'ArrowLeft' || e.key === 'Left') {
        e.preventDefault();
        setActive('snapshots');
        tabSnapshots.focus();
      }
    });
  });

  // Initial state: Snapshots
  setActive('snapshots');
}

// ========== DIVIDENDS SECTION ==========

const dividendsTbody = document.getElementById('dividends-table-body');
const addDividendBtn = document.getElementById('add-dividend-btn');
const floatingAddDividendBtn = document.getElementById('floating-add-dividend-btn');
const dividendsTable = document.getElementById('dividends-table');
const dividendsMonthlyTable = document.getElementById('dividends-monthly-table');
const dividendsMonthlyTbody = document.getElementById('dividends-monthly-table-body');
let currentEditingDividendRow = null;
const MONTHLY_DIVIDENDS_STORAGE_KEY = 'monthlyDividendsData';

function readMonthlyFromStorage() {
  try {
    const raw = localStorage.getItem(MONTHLY_DIVIDENDS_STORAGE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr;
  } catch (e) { console.warn('Monthly storage read failed', e); return null; }
}

function writeMonthlyToStorage() {
  if (!dividendsMonthlyTbody) return;
  const rows = Array.from(dividendsMonthlyTbody.querySelectorAll('tr'));
  const data = rows.map((tr) => ({
    year: parseInt(tr.querySelector('td[data-field="year"]')?.textContent || '0'),
    month: (tr.querySelector('td[data-field="month"]')?.textContent || '').trim(),
    dividend: (tr.querySelector('td[data-field="dividend"]')?.textContent || '').trim(),
    symbol: (tr.querySelector('td[data-field="symbol"]')?.textContent || '').trim(),
    currency: (tr.querySelector('td[data-field="currency"]')?.textContent || '').trim(),
  }));
  try { localStorage.setItem(MONTHLY_DIVIDENDS_STORAGE_KEY, JSON.stringify(data)); } catch (e) { console.warn('Monthly storage write failed', e); }
}

// Auto-save on click outside table
document.addEventListener('click', function (e) {
  if (!currentEditingDividendRow) return;

  // Ignore clicks on edit/save/cancel buttons to prevent immediate trigger
  if (
    e.target.closest('.edit-icon-btn') ||
    e.target.closest('.save-icon-btn') ||
    e.target.closest('.cancel-icon-btn')
  ) {
    return;
  }

  // Check if click is outside the active dividends table based on current view
  if (dividendsView === 'annual') {
    if (dividendsTable && !dividendsTable.contains(e.target)) {
      const id = currentEditingDividendRow.dataset.id;
      if (id) {
        // Editing existing row - save it
        saveEditedDividend(parseInt(id));
      } else {
        // New row - save it
        saveDividend();
      }
    }
  } else if (dividendsView === 'monthly') {
    if (dividendsMonthlyTable && !dividendsMonthlyTable.contains(e.target)) {
      // Finalize monthly row edits (no backend persistence)
      saveMonthlyDividend();
    }
  }
});

// Dividends Chart
let dividendsChart = null;
let dividendsView = 'annual'; // default changed to 'annual'

function getFxAvgMapFromSettings() {
  const rows = document.querySelectorAll('#fx-averages-table-body tr');
  const map = {};
  rows.forEach((tr) => {
    const year = parseInt(tr.querySelector('td[data-field="year"]')?.textContent || '0');
    const eurRon = parseFloat((tr.querySelector('td[data-field="eur_ron"]')?.textContent || '').replace(/[^0-9.\-]/g, ''));
    const usdRon = parseFloat((tr.querySelector('td[data-field="usd_ron"]')?.textContent || '').replace(/[^0-9.\-]/g, ''));
    const usdEur = parseFloat((tr.querySelector('td[data-field="usd_eur"]')?.textContent || '').replace(/[^0-9.\-]/g, ''));
    if (year) map[year] = { eurRon, usdRon, usdEur };
  });
  // Fallback demo values if Settings not populated
  const currentYear = new Date().getFullYear();
  for (let y = 2022; y <= currentYear; y++) {
    const existing = map[y] || {};
    if (!Number.isFinite(existing.eurRon)) existing.eurRon = 4.95;
    if (!Number.isFinite(existing.usdEur)) existing.usdEur = 1.08;
    if (!Number.isFinite(existing.usdRon)) existing.usdRon = +(existing.usdEur * existing.eurRon).toFixed(4);
    map[y] = existing;
  }
  return map;
}

function buildMonthlySeriesFromTable() {
  const fxMap = getFxAvgMapFromSettings();
  const tbody = document.getElementById('dividends-monthly-table-body');
  const rows = Array.from(tbody?.querySelectorAll('tr') || []);
  const monthsOrder = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthAliases = {
    jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June', jul: 'July', aug: 'August', sep: 'September', sept: 'September', oct: 'October', nov: 'November', dec: 'December',
    novermber: 'November', marach: 'March',
  };
  // Aggregate per year-month in EUR
  const agg = {}; // key: `${year}-${monthIndex}` -> sumEUR
  let minYear = Infinity;
  let maxYear = -Infinity;
  rows.forEach((tr) => {
    const year = parseInt(tr.querySelector('td[data-field="year"]')?.textContent || '0');
    let monthName = (tr.querySelector('td[data-field="month"]')?.textContent || '').trim();
    const mn = monthAliases[monthName.toLowerCase()];
    if (mn) monthName = mn;
    const dividend = parseFloat((tr.querySelector('td[data-field="dividend"]')?.textContent || '').replace(/[^0-9.\-]/g, '')) || 0;
    const currency = (tr.querySelector('td[data-field="currency"]')?.textContent || '').trim().toUpperCase();
    if (!year || !monthName) return;
    const monthIndex = monthsOrder.indexOf(monthName);
    if (monthIndex === -1) return;
    if (year < minYear) minYear = year;
    if (year > maxYear) maxYear = year;
    // Convert to EUR using yearly averages from Settings
    const fx = fxMap[year] || { eurRon: NaN, usdRon: NaN };
    let eurValue = dividend;
    if (currency === 'RON') {
      const ronPerEur = fx.eurRon; // EUR/RON (RON per EUR)
      if (Number.isFinite(ronPerEur) && ronPerEur > 0) eurValue = dividend / ronPerEur; else eurValue = 0;
    } else if (currency === 'USD') {
      const usdPerEur = fx.usdEur; // USD per EUR (USD/EUR)
      if (Number.isFinite(usdPerEur) && usdPerEur > 0) {
        eurValue = dividend / usdPerEur; // USD → EUR
      } else {
        // Fallback via USD/RON and EUR/RON if USD/EUR missing
        const usdPerRon = fx.usdRon;
        const ronPerEur = fx.eurRon;
        if (Number.isFinite(usdPerRon) && Number.isFinite(ronPerEur) && usdPerRon > 0 && ronPerEur > 0) {
          const valueRon = dividend * usdPerRon;
          eurValue = valueRon / ronPerEur;
        } else {
          eurValue = 0;
        }
      }
    } else if (currency === 'EUR' || currency === '') {
      eurValue = dividend;
    } else {
      eurValue = 0;
    }
    const key = `${year}-${monthIndex}`;
    agg[key] = (agg[key] || 0) + eurValue;
  });
  // If no rows, show empty
  if (!isFinite(minYear) || !isFinite(maxYear)) {
    // Derive year range from Settings FX table (ensures full 2022..current coverage)
    const fxYears = Object.keys(fxMap).map((y) => parseInt(y)).filter((y) => !isNaN(y));
    if (fxYears.length) {
      minYear = Math.min(...fxYears);
      maxYear = Math.max(...fxYears);
    } else {
      return { labels: [], values: [] };
    }
  }
  // Build complete month sequence for all years with gaps as zero
  const labels = [];
  const values = [];
  for (let y = minYear; y <= maxYear; y++) {
    for (let m = 0; m < monthsOrder.length; m++) {
      const key = `${y}-${m}`;
      const v = agg[key] || 0;
      labels.push(`${y} ${monthsOrder[m]}`);
      values.push(+v.toFixed(2));
    }
  }
  return { labels, values };
}

// Recompute Annual table from Monthly table (convert currencies to EUR using Settings FX)
function recomputeAnnualFromMonthly() {
  const fxMap = getFxAvgMapFromSettings();
  const tbodyMonthly = document.getElementById('dividends-monthly-table-body');
  const tbodyAnnual = document.getElementById('dividends-table-body');
  if (!tbodyMonthly || !tbodyAnnual) return;
  const rows = Array.from(tbodyMonthly.querySelectorAll('tr'));
  const monthsOrderFull = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const aliases = {jan:'January',feb:'February',mar:'March',apr:'April',may:'May',jun:'June',jul:'July',aug:'August',sep:'September',sept:'September',oct:'October',nov:'November',dec:'December','novermber':'November','marach':'March','jan.':'January','feb.':'February','mar.':'March','apr.':'April','jun.':'June','jul.':'July','aug.':'August','sep.':'September','oct.':'October','nov.':'November','dec.':'December'};
  const byYear = {};
  rows.forEach((tr) => {
    const year = parseInt(tr.querySelector('td[data-field="year"]')?.textContent || '0');
    let monthName = (tr.querySelector('td[data-field="month"]')?.textContent || '').trim();
    const mKey = monthName.toLowerCase();
    if (aliases[mKey]) monthName = aliases[mKey];
    const dividend = parseFloat((tr.querySelector('td[data-field="dividend"]')?.textContent || '').replace(/[^0-9.\-]/g, '')) || 0;
    let currency = (tr.querySelector('td[data-field="currency"]')?.textContent || '').trim().toUpperCase();
    if (!currency) currency = 'EUR';
    if (!year || !monthName) return;
    const fx = fxMap[year] || {};
    let eurValue = dividend;
    if (currency === 'RON') {
      const ronPerEur = fx.eurRon;
      eurValue = Number.isFinite(ronPerEur) && ronPerEur > 0 ? dividend / ronPerEur : 0;
    } else if (currency === 'USD') {
      const usdPerEur = fx.usdEur;
      if (Number.isFinite(usdPerEur) && usdPerEur > 0) {
        eurValue = dividend / usdPerEur;
      } else if (Number.isFinite(fx.usdRon) && Number.isFinite(fx.eurRon) && fx.usdRon > 0 && fx.eurRon > 0) {
        eurValue = (dividend * fx.usdRon) / fx.eurRon;
      } else {
        eurValue = 0;
      }
    } else if (currency === 'EUR') {
      eurValue = dividend;
    } else {
      eurValue = 0;
    }
    if (!byYear[year]) byYear[year] = 0;
    byYear[year] += eurValue;
  });
  // Update existing annual rows or create new ones
  const existingRows = Array.from(tbodyAnnual.querySelectorAll('tr'));
  const rowByYear = {};
  existingRows.forEach((r) => {
    const yearCell = r.querySelector('td[data-field="year"]');
    const y = yearCell ? parseInt(yearCell.textContent) : NaN;
    if (Number.isFinite(y)) rowByYear[y] = r;
  });
  Object.keys(byYear).map(Number).sort((a,b)=>a-b).forEach((y, idx) => {
    const sum = byYear[y];
    const annualValueText = `${sum.toFixed(2)} €`;
    const monthlyValueText = `${(sum / 12).toFixed(2)} €`;
    if (rowByYear[y]) {
      const row = rowByYear[y];
      const annualCell = row.querySelector('td[data-field="annual_dividend"]');
      const monthlyCell = row.querySelector('td[data-field="monthly_dividend"]');
      if (annualCell) annualCell.textContent = annualValueText;
      if (monthlyCell) monthlyCell.textContent = monthlyValueText;
    } else {
      // Create new row for missing year
      const row = document.createElement('tr');
      row.innerHTML = `
        <td data-field="nr">${tbodyAnnual.querySelectorAll('tr').length + 1}</td>
        <td class="year-cell" data-field="year">${y}</td>
        <td class="annual-dividend-cell" data-field="annual_dividend">${annualValueText}</td>
        <td class="monthly-dividend" data-field="monthly_dividend">${monthlyValueText}</td>
        <td>
            <button class="edit-icon-btn" title="Edit">✎</button>
            <button class="delete-icon-btn" title="Delete">🗑</button>
        </td>
      `;
      tbodyAnnual.appendChild(row);
      // Reattach handlers consistent with addDividendRow
      const editBtn = row.querySelector('.edit-icon-btn');
      const deleteBtn = row.querySelector('.delete-icon-btn');
      editBtn.addEventListener('click', (e) => { e.stopPropagation(); /* editing annual stays as-is */ });
      deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); /* keep delete behavior minimal for now */ });
    }
  });
  // Persist recomputed Annual table to backend so refresh keeps data
  try { persistAnnualDividendsFromTable(); } catch (e) { console.warn('Persist annual failed', e); }
}

// Save Annual table rows to backend (/api/dividends). Updates existing by year, creates missing.
async function persistAnnualDividendsFromTable() {
  const tbodyAnnual = document.getElementById('dividends-table-body');
  if (!tbodyAnnual) return;
  const rows = Array.from(tbodyAnnual.querySelectorAll('tr'));
  for (const row of rows) {
    const year = parseInt(row.querySelector('td[data-field="year"]')?.textContent || '0');
    const annualText = row.querySelector('td[data-field="annual_dividend"]')?.textContent || '';
    const annualDividend = parseFloat(annualText.replace(/[^0-9.\-]/g, '')) || 0;
    if (!Number.isFinite(year) || year <= 0) continue;
    // If row has data-id, update that record; else try to find existing by year, otherwise create
    const existingIdAttr = row.getAttribute('data-id');
    let existingId = existingIdAttr ? parseInt(existingIdAttr) : null;
    try {
      if (existingId) {
        await fetch(`/api/dividends/${existingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, annual_dividend: annualDividend })
        });
      } else {
        // Fetch all to try match by year
        const resp = await fetch('/api/dividends');
        const all = await resp.json();
        const match = Array.isArray(all) ? all.find((d) => Number(d.year) === year) : null;
        if (match && match.id) {
          await fetch(`/api/dividends/${match.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ year, annual_dividend: annualDividend })
          });
          row.setAttribute('data-id', String(match.id));
        } else {
          const createResp = await fetch('/api/dividends', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ year, annual_dividend: annualDividend })
          });
          if (createResp.ok) {
            const created = await createResp.json().catch(() => null);
            if (created && created.id) {
              row.setAttribute('data-id', String(created.id));
            }
          }
        }
      }
    } catch (e) {
      console.warn('Persist annual row error', e);
    }
  }
}

function createDividendsChart(dividends, view = 'monthly') {
  const ctx = document.getElementById('dividendsChart');
  if (!ctx) return;

  if (dividendsChart) {
    dividendsChart.destroy();
  }

  let labels = [];
  let datasetValues = [];
  let datasetLabel = '';
  if (view === 'annual') {
    // Prefer reading Annual data directly from the table to capture newly added years
    let annualData = [];
    try {
      annualData = getAnnualDividendsDataFromTable();
    } catch {}
    // Fallback to provided array if table not yet populated
    const source = Array.isArray(annualData) && annualData.length > 0 ? annualData : dividends;
    const reversedDividends = [...source].reverse();
    labels = reversedDividends.map((d) => d.year);
    datasetValues = reversedDividends.map((d) => Number(d.annual_dividend).toFixed(2));
    datasetLabel = 'Annual Dividend (€)';
    // tooltip suffix not used
  } else {
    const series = buildMonthlySeriesFromTable();
    labels = series.labels;
    datasetValues = series.values;
    datasetLabel = 'Monthly Dividend (€)';
  }

  const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, 'rgba(100, 255, 218, 0.8)');
  gradient.addColorStop(1, 'rgba(100, 255, 218, 0.4)');

  dividendsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: datasetLabel,
          data: datasetValues,
          backgroundColor: gradient,
          borderColor: 'rgba(100, 255, 218, 1)',
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 3,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: 'white',
            font: { size: 14, weight: 'bold' },
            padding: 20,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          titleColor: '#000',
          bodyColor: '#000',
          borderColor: 'rgba(102, 126, 234, 0.8)',
          borderWidth: 2,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: function (context) {
              return `€${context.parsed.y}`;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255, 255, 255, 0.1)', drawBorder: false },
          ticks: {
            color: 'white',
            font: { size: 12, weight: 'bold' },
            callback: (value) => '€' + value,
          },
        },
        x: {
          grid: { display: false, drawBorder: false },
          ticks: { color: 'white', font: { size: 12, weight: 'bold' } },
        },
      },
    },
  });
}

// Load dividends from database
async function loadDividends() {
  try {
    const response = await fetch('/api/dividends');
    const dividends = await response.json();
    window.currentDividends = dividends;
    dividendsTbody.innerHTML = '';
    dividends.forEach((dividend, index) => {
      addDividendRow(dividend, index + 1);
    });
    createDividendsChart(dividends, dividendsView);
    initializeDividendsSwitch();
    // Populate Monthly from backend first; fallback to localStorage/seed
    if (dividendsMonthlyTbody) {
      try {
        const mResp = await fetch('/api/dividends-monthly');
        const monthlyRows = await mResp.json();
        if (Array.isArray(monthlyRows) && monthlyRows.length > 0) {
          const items = monthlyRows.map((r) => ({
            year: r.year,
            month: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Math.max(0, Math.min(11, (r.month_index || 1) - 1))],
            dividend: r.amount,
            symbol: r.symbol || '',
            currency: r.currency || 'RON',
            id: r.id,
          }));
          populateMonthlyTableFromData(items);
          const trs = Array.from(dividendsMonthlyTbody.querySelectorAll('tr'));
          trs.forEach((tr, idx) => {
            const id = monthlyRows[idx]?.id;
            if (id) tr.setAttribute('data-id', String(id));
          });
        } else {
          // No fallback: keep table empty when backend has no rows
          dividendsMonthlyTbody.innerHTML = '';
        }
      } catch (e) {
        console.warn('Monthly backend load failed', e);
        // Keep table state as-is; do not repopulate from localStorage/seed
      }
    }
    // Seed list removed: user will input monthly dividends manually

    // Inject manual recompute button for Annual from Monthly (testing aid)
    // Manual recompute button removed (recompute runs automatically)
  } catch (error) {
    console.error('Error loading dividends:', error);
  }
}

function initializeDividendsSwitch() {
  const tableMonthly = document.getElementById('toggle-dividends-monthly-btn-table');
  const tableAnnual = document.getElementById('toggle-dividends-annual-btn-table');
  const annualSubpage = document.getElementById('dividends-annual-subpage');
  const secondarySwitch = document.querySelector('.allocation-switch.dividends-switch.secondary');
  const dividendsSectionEl = document.getElementById('dividends-section');
  // Require the table-area switch buttons
  if (!tableMonthly || !tableAnnual) return;
  // Avoid re-binding
  if (tableMonthly.dataset.initialized === 'true' || tableAnnual.dataset.initialized === 'true') return;
  tableMonthly.dataset.initialized = 'true';
  tableAnnual.dataset.initialized = 'true';

  const setActiveClasses = (view) => {
    const apply = (btnMonthly, btnAnnual) => {
      if (!btnMonthly || !btnAnnual) return;
      if (view === 'monthly') {
        btnMonthly.classList.add('active');
        btnMonthly.setAttribute('aria-selected', 'true');
        btnMonthly.setAttribute('tabindex', '0');
        btnAnnual.classList.remove('active');
        btnAnnual.setAttribute('aria-selected', 'false');
        btnAnnual.setAttribute('tabindex', '-1');
      } else {
        btnAnnual.classList.add('active');
        btnAnnual.setAttribute('aria-selected', 'true');
        btnAnnual.setAttribute('tabindex', '0');
        btnMonthly.classList.remove('active');
        btnMonthly.setAttribute('aria-selected', 'false');
        btnMonthly.setAttribute('tabindex', '-1');
      }
    };
    apply(tableMonthly, tableAnnual);
    // Toggle container classes so glow/indicator moves like Allocation
    const applyContainer = (container) => {
      if (!container) return;
      if (view === 'monthly') {
        container.classList.add('monthly-active');
        container.classList.remove('annual-active');
      } else {
        container.classList.add('annual-active');
        container.classList.remove('monthly-active');
      }
    };
    applyContainer(secondarySwitch);
    // Toggle section view class for CSS spacing rules
    if (dividendsSectionEl) {
      if (view === 'monthly') {
        dividendsSectionEl.classList.add('monthly-view');
        dividendsSectionEl.classList.remove('annual-view');
      } else {
        dividendsSectionEl.classList.add('annual-view');
        dividendsSectionEl.classList.remove('monthly-view');
      }
    }
  };

  const activate = (view) => {
    dividendsView = view;
    setActiveClasses(view);
    if (window.currentDividends) {
      createDividendsChart(window.currentDividends, dividendsView);
    }
    // Show Annual subpage only when Annual is active
    if (annualSubpage) {
      annualSubpage.style.display = view === 'annual' ? '' : 'none';
    }
    // Toggle table visibility: monthly table independent and empty
    if (dividendsTable) {
      dividendsTable.style.display = view === 'annual' ? '' : 'none';
    }
    if (dividendsMonthlyTable) {
      dividendsMonthlyTable.style.display = view === 'monthly' ? '' : 'none';
    }
  };

  // Event listeners for table-area switch
  tableMonthly.addEventListener('click', () => activate('monthly'));
  tableAnnual.addEventListener('click', () => activate('annual'));

  // Keyboard accessibility and lateral toggle behavior (match Allocation page)
  const allBtns = [tableMonthly, tableAnnual].filter(Boolean);
  allBtns.forEach((btn) => {
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Right') {
        e.preventDefault();
        activate('annual');
        // Move focus to Annual counterpart if available
        const target = btn.classList.contains('allocation-option') && btn.id.includes('monthly')
          ? document.getElementById(btn.id.replace('monthly', 'annual'))
          : btn;
        (target || tableAnnual).focus();
      } else if (e.key === 'ArrowLeft' || e.key === 'Left') {
        e.preventDefault();
        activate('monthly');
        const target = btn.classList.contains('allocation-option') && btn.id.includes('annual')
          ? document.getElementById(btn.id.replace('annual', 'monthly'))
          : btn;
        (target || tableMonthly).focus();
      }
    });
  });
  // Initial sync
  setActiveClasses(dividendsView);
  if (annualSubpage) {
    annualSubpage.style.display = dividendsView === 'annual' ? '' : 'none';
  }
  if (dividendsTable) {
    dividendsTable.style.display = dividendsView === 'annual' ? '' : 'none';
  }
  if (dividendsMonthlyTable) {
    dividendsMonthlyTable.style.display = dividendsView === 'monthly' ? '' : 'none';
  }
  // If switching to monthly and we have seed data, populate
  // No automatic seed population; monthly table starts empty unless backend/localStorage provides
}

// (Monthly table logic reverted)

// Add new monthly dividend row (editable, local-only)
function addNewMonthlyDividendRow() {
  if (!dividendsMonthlyTbody) return;
  if (currentEditingDividendRow) {
    // Remove any existing editing row in either table to avoid overlaps
    currentEditingDividendRow.remove();
  }
  // Create a normal (read-only) row first, then auto-enter edit mode like withdrawals
  const row = document.createElement('tr');
  const rowNumber = dividendsMonthlyTbody.querySelectorAll('tr').length + 1;
  const now = new Date();
  const currentYear = now.getFullYear();
  const monthsShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const currentMonthLabel = monthsShort[now.getMonth()];
  row.innerHTML = `
    <td data-field="nr">${rowNumber}</td>
    <td data-field="year">${currentYear}</td>
    <td data-field="month">${currentMonthLabel}</td>
    <td data-field="dividend">0.00</td>
    <td data-field="symbol"></td>
    <td data-field="currency">RON</td>
    <td>
      <button class="edit-icon-btn" title="Edit">✎</button>
      <button class="delete-icon-btn" title="Delete">🗑</button>
    </td>
  `;
  dividendsMonthlyTbody.insertBefore(row, dividendsMonthlyTbody.firstChild);
  // Attach actions
  const editBtn = row.querySelector('.edit-icon-btn');
  const deleteBtn = row.querySelector('.delete-icon-btn');
  editBtn.addEventListener('click', (e) => { e.stopPropagation(); editMonthlyDividend(row); });
  deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteMonthlyDividend(row); });
  // Immediately enter edit mode and focus Dividend field (withdrawals-like behavior)
  setTimeout(() => {
    editMonthlyDividend(row);
    try {
      const divCell = row.querySelector('[data-field="dividend"]');
      divCell.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(divCell);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {}
  }, 30);
}

// Finalize monthly dividend row (local-only, converts inputs to static text)
function saveMonthlyDividend() {
  if (!currentEditingDividendRow) return;
  const row = currentEditingDividendRow;
  const yearSelect = row.querySelector('.month-year-select');
  const monthSelect = row.querySelector('.month-select');
  const currencySelect = row.querySelector('.currency-select');
  const dividendCell = row.querySelector('[data-field="dividend"]');
  const symbolCell = row.querySelector('[data-field="symbol"]');

  const year = yearSelect ? parseInt(yearSelect.value) : new Date().getFullYear();
  const monthIdx = monthSelect ? parseInt(monthSelect.value) : 1;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthLabel = months[Math.max(0, Math.min(11, monthIdx - 1))];
  const currency = currencySelect ? currencySelect.value : 'RON';
  const amount = parseFloat((dividendCell?.textContent || '0').replace(/[^0-9.\-]/g, '')) || 0;

  // Prepare payload for backend persistence
  const monthIndex = Math.max(1, Math.min(12, monthIdx));
  const payload = {
    year,
    month_index: monthIndex,
    amount: amount,
    // optional fields not stored server-side currently
    currency,
    symbol: (symbolCell?.textContent || '').trim(),
  };

  // Persist monthly row to backend (cross-browser/incognito)
  const existingIdAttr = row.getAttribute('data-id');
  if (existingIdAttr) {
    const id = parseInt(existingIdAttr);
    fetch(`/api/dividends-monthly/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((e) => console.warn('Monthly update failed', e));
  } else {
    fetch('/api/dividends-monthly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(async (resp) => {
      try {
        const res = await resp.json();
        if (resp.ok && res && res.id) {
          // Store backend id on row for future edits/deletes
          row.setAttribute('data-id', String(res.id));
        }
      } catch {}
    }).catch((e) => console.warn('Monthly persist failed', e));
  }

  // Replace selects with static text
  const yearCell = row.querySelector('[data-field="year"]');
  const monthCell = row.querySelector('[data-field="month"]');
  const currencyCell = row.querySelector('[data-field="currency"]');
  if (yearCell) yearCell.textContent = String(year);
  if (monthCell) monthCell.textContent = monthLabel;
  if (currencyCell) currencyCell.textContent = currency;
  if (dividendCell) {
    dividendCell.contentEditable = 'false';
    dividendCell.classList.remove('editable');
    // Dividend column should NOT include currency
    dividendCell.textContent = `${amount.toFixed(2)}`;
  }
  if (symbolCell) {
    symbolCell.contentEditable = 'false';
    symbolCell.classList.remove('editable');
    symbolCell.textContent = (symbolCell.textContent || '').trim();
  }

  // Add edit/delete actions
  let actionsCell = row.querySelector('td:last-child');
  actionsCell.innerHTML = `
    <button class="edit-icon-btn" title="Edit">✎</button>
    <button class="delete-icon-btn" title="Delete">🗑</button>
  `;
  const editBtn = actionsCell.querySelector('.edit-icon-btn');
  const deleteBtn = actionsCell.querySelector('.delete-icon-btn');
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    editMonthlyDividend(row);
  });
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteMonthlyDividend(row);
  });

  row.classList.remove('editing');
  currentEditingDividendRow = null;
  // Renumber after save
  sortMonthlyTable();
  // Backend is source of truth; skip localStorage write to ensure cross-browser consistency
  try { recomputeAnnualFromMonthly(); } catch {}
  // If Annual view is active, refresh chart from table data
  try {
    if (dividendsView === 'annual') {
      const annualData = getAnnualDividendsDataFromTable();
      createDividendsChart(annualData, 'annual');
    }
  } catch {}
}

// Enter edit mode for an existing monthly row
function editMonthlyDividend(row) {
  if (!row) return;
  // If another row is editing, cancel it first
  if (currentEditingDividendRow && currentEditingDividendRow !== row) {
    cancelMonthlyDividendEdit();
  }
  currentEditingDividendRow = row;
  row.classList.add('editing');

  const yearCell = row.querySelector('[data-field="year"]');
  const monthCell = row.querySelector('[data-field="month"]');
  const dividendCell = row.querySelector('[data-field="dividend"]');
  const currencyCell = row.querySelector('[data-field="currency"]');
  const symbolCell = row.querySelector('[data-field="symbol"]');

  // Store previous values for cancel
  row.dataset.prevYear = yearCell.textContent.trim();
  row.dataset.prevMonth = monthCell.textContent.trim();
  row.dataset.prevDividend = dividendCell.textContent.trim();
  row.dataset.prevCurrency = currencyCell.textContent.trim();
  row.dataset.prevSymbol = symbolCell.textContent.trim();

  // Build selects
  const currentYear = parseInt(row.dataset.prevYear || String(new Date().getFullYear()));
  let yearOptions = '';
  for (let year = 2022; year <= 2100; year++) {
    yearOptions += `<option value="${year}" ${year === currentYear ? 'selected' : ''}>${year}</option>`;
  }
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthOptions = months
    .map((m, i) => `<option value="${i+1}" ${m === row.dataset.prevMonth ? 'selected' : ''}>${m}</option>`) 
    .join('');
  const currencyOptions = ['RON','USD','EUR']
    .map((c) => `<option value="${c}" ${c === row.dataset.prevCurrency ? 'selected' : ''}>${c}</option>`) 
    .join('');

  yearCell.innerHTML = `<select class="month-year-select">${yearOptions}</select>`;
  monthCell.innerHTML = `<select class="month-select">${monthOptions}</select>`;
  dividendCell.contentEditable = 'true';
  dividendCell.classList.add('editable');
  currencyCell.innerHTML = `<select class="currency-select">${currencyOptions}</select>`;
  // Symbol stays editable text
  symbolCell.contentEditable = 'true';
  symbolCell.classList.add('editable');

  // Replace actions with save/cancel
  const actionsCell = row.querySelector('td:last-child');
  actionsCell.innerHTML = `
    <button class="save-icon-btn" title="Save">✓</button>
    <button class="cancel-icon-btn" title="Cancel">✕</button>
  `;
  const saveBtn = actionsCell.querySelector('.save-icon-btn');
  const cancelBtn = actionsCell.querySelector('.cancel-icon-btn');
  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Persist update if row has backend id
    const idAttr = row.getAttribute('data-id');
    if (idAttr) {
      const id = parseInt(idAttr);
      const yearVal = parseInt(row.querySelector('.month-year-select')?.value || row.dataset.prevYear);
      const monthVal = parseInt(row.querySelector('.month-select')?.value || '1');
      const amountVal = parseFloat((row.querySelector('[data-field="dividend"]')?.textContent || '0').replace(/[^0-9.\-]/g, '')) || 0;
      const currencyVal = String(row.querySelector('.currency-select')?.value || row.dataset.prevCurrency || 'RON');
      const symbolVal = String(row.querySelector('[data-field="symbol"]')?.textContent || row.dataset.prevSymbol || '').trim();
      fetch(`/api/dividends-monthly/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: yearVal, month_index: Math.max(1, Math.min(12, monthVal)), amount: amountVal, currency: currencyVal, symbol: symbolVal }),
      }).catch((e) => console.warn('Monthly update failed', e));
    }
    saveMonthlyDividend();
  });
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    cancelMonthlyDividendEdit();
  });
}

// Cancel edit for monthly row (restore previous values)
function cancelMonthlyDividendEdit() {
  if (!currentEditingDividendRow) return;
  const row = currentEditingDividendRow;
  const yearCell = row.querySelector('[data-field="year"]');
  const monthCell = row.querySelector('[data-field="month"]');
  const dividendCell = row.querySelector('[data-field="dividend"]');
  const currencyCell = row.querySelector('[data-field="currency"]');
  const symbolCell = row.querySelector('[data-field="symbol"]');

  yearCell.textContent = row.dataset.prevYear || yearCell.textContent;
  monthCell.textContent = row.dataset.prevMonth || monthCell.textContent;
  dividendCell.textContent = row.dataset.prevDividend || dividendCell.textContent;
  dividendCell.contentEditable = 'false';
  dividendCell.classList.remove('editable');
  currencyCell.textContent = row.dataset.prevCurrency || currencyCell.textContent;
  symbolCell.textContent = row.dataset.prevSymbol || symbolCell.textContent;

  const actionsCell = row.querySelector('td:last-child');
  actionsCell.innerHTML = `
    <button class="edit-icon-btn" title="Edit">✎</button>
    <button class="delete-icon-btn" title="Delete">🗑</button>
  `;
  const editBtn = actionsCell.querySelector('.edit-icon-btn');
  const deleteBtn = actionsCell.querySelector('.delete-icon-btn');
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    editMonthlyDividend(row);
  });
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteMonthlyDividend(row);
  });

  row.classList.remove('editing');
  delete row.dataset.prevYear;
  delete row.dataset.prevMonth;
  delete row.dataset.prevDividend;
  delete row.dataset.prevCurrency;
  delete row.dataset.prevSymbol;
  currentEditingDividendRow = null;
  try { recomputeAnnualFromMonthly(); } catch {}
  // Backend is source of truth; do not write monthly data to localStorage
}

// Delete monthly row
function deleteMonthlyDividend(row) {
  if (!row) return;
  const idAttr = row.getAttribute('data-id');
  if (idAttr) {
    const id = parseInt(idAttr);
    fetch(`/api/dividends-monthly/${id}`, { method: 'DELETE' }).catch((e) => console.warn('Monthly delete failed', e));
  }
  row.remove();
  if (currentEditingDividendRow === row) {
    currentEditingDividendRow = null;
  }
  // Renumber after delete
  renumberMonthlyRows();
  try { recomputeAnnualFromMonthly(); } catch {}
  // Backend is source of truth; do not write monthly data to localStorage
}

// Maintain sequential numbering in Monthly table
function renumberMonthlyRows() {
  if (!dividendsMonthlyTbody) return;
  const rows = Array.from(dividendsMonthlyTbody.querySelectorAll('tr'));
  rows.forEach((r, idx) => {
    const nrCell = r.querySelector('[data-field="nr"]');
    if (nrCell) nrCell.textContent = String(idx + 1);
  });
}

// Sort Monthly table by Year desc, then Month desc (Dec..Jan)
function sortMonthlyTable() {
  if (!dividendsMonthlyTbody) return;
  const monthOrderDesc = ['Dec','Nov','Oct','Sep','Aug','Jul','Jun','May','Apr','Mar','Feb','Jan'];
  const rows = Array.from(dividendsMonthlyTbody.querySelectorAll('tr'));
  const getYear = (r) => parseInt(r.querySelector('[data-field="year"]')?.textContent || '0');
  const getMonthKey = (r) => (r.querySelector('[data-field="month"]')?.textContent || '').trim();
  rows.sort((a, b) => {
    const ya = getYear(a), yb = getYear(b);
    if (yb !== ya) return yb - ya;
    const ma = getMonthKey(a), mb = getMonthKey(b);
    const ia = monthOrderDesc.indexOf(ma);
    const ib = monthOrderDesc.indexOf(mb);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  // Reattach in sorted order
  dividendsMonthlyTbody.innerHTML = '';
  rows.forEach((r) => dividendsMonthlyTbody.appendChild(r));
  renumberMonthlyRows();
  // Scroll to top to show the most recent first
  try { (dividendsMonthlyTable || dividendsMonthlyTbody.parentElement).scrollTop = 0; } catch {}
}

// Populate Monthly table from provided data list
function populateMonthlyTableFromData(items) {
  if (!Array.isArray(items) || !dividendsMonthlyTbody) return;
  dividendsMonthlyTbody.innerHTML = '';
  const monthMap = {
    January: 'Jan', February: 'Feb', March: 'Mar', April: 'Apr', May: 'May', June: 'Jun',
    July: 'Jul', August: 'Aug', September: 'Sep', October: 'Oct', November: 'Nov', December: 'Dec',
    Novermber: 'Nov', Marach: 'Mar'
  };

  const filtered = items.filter((it) => {
    const val = parseFloat(String(it.dividend).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(val) && val !== 0; // skip zero or invalid values
  });
  filtered.forEach((it, idx) => {
    const year = it.year ?? '';
    const monthLabel = monthMap[it.month] || it.month || '';
    const row = document.createElement('tr');
    row.innerHTML = `
      <td data-field="nr">${idx + 1}</td>
      <td data-field="year">${year}</td>
      <td data-field="month">${monthLabel}</td>
      <td data-field="dividend">${Number(String(it.dividend).replace(/[^0-9.\-]/g,'')).toFixed(2)}</td>
      <td data-field="symbol">${it.symbol}</td>
      <td data-field="currency">${it.currency}</td>
      <td>
        <button class="edit-icon-btn" title="Edit">✎</button>
        <button class="delete-icon-btn" title="Delete">🗑</button>
      </td>
    `;
    dividendsMonthlyTbody.appendChild(row);

    const editBtn = row.querySelector('.edit-icon-btn');
    const deleteBtn = row.querySelector('.delete-icon-btn');
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); editMonthlyDividend(row); });
    deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteMonthlyDividend(row); });
  });
  sortMonthlyTable();
  // Backend is source of truth; do not write monthly data to localStorage
  try { recomputeAnnualFromMonthly(); } catch {}
  try {
    if (dividendsView === 'annual') {
      const annualData = getAnnualDividendsDataFromTable();
      createDividendsChart(annualData, 'annual');
    }
  } catch {}
}

// Add dividend row to table (read-only mode)
function addDividendRow(dividend, rowNumber) {
  const row = document.createElement('tr');
  row.dataset.id = dividend.id;

  const monthlyDividend = (dividend.annual_dividend / 12).toFixed(2);

  row.innerHTML = `
        <td data-field="nr">${rowNumber}</td>
        <td class="year-cell" data-field="year">${dividend.year}</td>
        <td class="annual-dividend-cell" data-field="annual_dividend">${dividend.annual_dividend} €</td>
        <td class="monthly-dividend" data-field="monthly_dividend">${monthlyDividend} €</td>
        <td>
            <button class="edit-icon-btn" title="Edit">✎</button>
            <button class="delete-icon-btn" title="Delete">🗑</button>
        </td>
    `;

  dividendsTbody.appendChild(row);

  // Add event listeners
  const editBtn = row.querySelector('.edit-icon-btn');
  const deleteBtn = row.querySelector('.delete-icon-btn');

  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    editDividend(dividend.id);
  });
  deleteBtn.addEventListener('click', () => deleteDividend(dividend.id));
}

// Build annual dividends data array from Annual table (for chart refresh)
function getAnnualDividendsDataFromTable() {
  const tbodyAnnual = document.getElementById('dividends-table-body');
  const rows = Array.from(tbodyAnnual?.querySelectorAll('tr') || []);
  return rows.map((r) => {
    const year = parseInt(r.querySelector('td[data-field="year"]')?.textContent || '0');
    const annualText = r.querySelector('td[data-field="annual_dividend"]')?.textContent || '';
    const annualEUR = parseFloat(annualText.replace(/[^0-9.\-]/g, '')) || 0;
    return { year, annual_dividend: annualEUR };
  }).filter((d) => Number.isFinite(d.year) && d.year > 0);
}

// Ensure the Dividends page has a manual recompute button
// Removed manual recompute button: recompute happens automatically after Monthly changes

// Edit dividend row
window.editDividend = function (id) {
  const row = dividendsTbody.querySelector(`tr[data-id="${id}"]`);
  if (!row) return;

  // Exit any current editing
  if (currentEditingDividendRow && currentEditingDividendRow !== row) {
    cancelDividendEdit();
  }

  currentEditingDividendRow = row;
  row.classList.add('editing');

  const yearCell = row.querySelector('.year-cell');
  const annualDividendCell = row.querySelector('.annual-dividend-cell');
  const actionsCell = row.querySelector('td:last-child');

  const currentYear = parseInt(yearCell.textContent);
  const currentAnnual = parseFloat(annualDividendCell.textContent.replace('€', '').trim());

  // Generate year options
  let yearOptions = '';
  for (let year = 2022; year <= 2100; year++) {
    yearOptions += `<option value="${year}" ${year === currentYear ? 'selected' : ''}>${year}</option>`;
  }

  yearCell.innerHTML = `<select class="year-select">${yearOptions}</select>`;
  annualDividendCell.contentEditable = 'true';
  annualDividendCell.classList.add('editable');
  annualDividendCell.textContent = currentAnnual;
  actionsCell.innerHTML = `
        <button class="save-icon-btn" title="Save">✓</button>
        <button class="cancel-icon-btn" title="Cancel">✕</button>
    `;

  // Add event listeners
  const saveBtn = actionsCell.querySelector('.save-icon-btn');
  const cancelBtn = actionsCell.querySelector('.cancel-icon-btn');

  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    saveEditedDividend(id);
  });
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    cancelDividendEdit();
  });

  // Add input listener for real-time monthly calculation
  annualDividendCell.addEventListener('input', function () {
    let text = this.textContent.replace('€', '').trim();
    const annualValue = parseFloat(text) || 0;
    const monthlyCell = row.querySelector('.monthly-dividend');
    monthlyCell.textContent = (annualValue / 12).toFixed(2) + ' €';
  });

  // Focus and select all text
  annualDividendCell.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(annualDividendCell);
  selection.removeAllRanges();
  selection.addRange(range);
};

// Update monthly dividend in real-time
function updateMonthlyDividend(e) {
  const row = e.target.closest('tr');
  let text = e.target.textContent.replace('€', '').trim();
  const annualValue = parseFloat(text) || 0;
  const monthlyCell = row.querySelector('.monthly-dividend');
  monthlyCell.textContent = (annualValue / 12).toFixed(2);
}

// Save edited dividend
window.saveEditedDividend = async function (id) {
  const row = dividendsTbody.querySelector(`tr[data-id="${id}"]`);
  if (!row) return;

  const year = parseInt(row.querySelector('.year-select').value);
  const annualText = row.querySelector('.annual-dividend-cell').textContent.replace('€', '').trim();
  const annualDividend = parseFloat(annualText) || 0;

  try {
    const response = await fetch(`/api/dividends/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year: year,
        annual_dividend: annualDividend,
      }),
    });

    if (response.ok) {
      currentEditingDividendRow = null;
      await loadDividends();
    }
  } catch (error) {
    console.error('Error updating dividend:', error);
  }
};

// Add new dividend row (editable)
function addNewDividendRow() {
  if (currentEditingDividendRow) {
    currentEditingDividendRow.remove();
  }

  const row = document.createElement('tr');
  row.classList.add('editing');
  currentEditingDividendRow = row;

  const currentYear = new Date().getFullYear();
  const rowNumber = dividendsTbody.querySelectorAll('tr:not(.editing)').length + 1;

  // Generate year options from 2022 to 2100
  let yearOptions = '';
  for (let year = 2022; year <= 2100; year++) {
    yearOptions += `<option value="${year}" ${year === currentYear ? 'selected' : ''}>${year}</option>`;
  }

  row.innerHTML = `
      <td data-field="nr">${rowNumber}</td>
      <td data-field="year">
            <select class="year-select">
                ${yearOptions}
            </select>
        </td>
      <td contenteditable="true" class="annual-dividend-input editable" data-field="annual_dividend">0 €</td>
      <td class="monthly-dividend" data-field="monthly_dividend">0.00 €</td>
        <td>
            <button class="save-icon-btn" onclick="saveDividend()" title="Save">✓</button>
            <button class="delete-icon-btn" onclick="cancelDividendEdit()" title="Cancel">✕</button>
        </td>
    `;

  dividendsTbody.insertBefore(row, dividendsTbody.firstChild);
  // Add input event listener for real-time calculation
  const annualDividendInput = row.querySelector('.annual-dividend-input');
  annualDividendInput.addEventListener('input', updateMonthlyDividend);
  // Ensure immediate edit-focus with caret inside the Annual Dividend cell
  try {
    annualDividendInput.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(annualDividendInput);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {}
  setTimeout(() => {
    try {
      annualDividendInput.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(annualDividendInput);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {}
  }, 0);
}

// Save new dividend
window.saveDividend = async function () {
  if (!currentEditingDividendRow) return;

  const year = parseInt(currentEditingDividendRow.querySelector('.year-select').value);
  const annualText = currentEditingDividendRow
    .querySelector('.annual-dividend-input')
    .textContent.replace('€', '')
    .trim();
  const annualDividend = parseFloat(annualText) || 0;

  try {
    const response = await fetch('/api/dividends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year: year,
        annual_dividend: annualDividend,
      }),
    });

    if (response.ok) {
      currentEditingDividendRow = null;
      await loadDividends();
    }
  } catch (error) {
    console.error('Error saving dividend:', error);
  }
};

// Cancel dividend edit
window.cancelDividendEdit = function () {
  if (currentEditingDividendRow) {
    const id = currentEditingDividendRow.dataset.id;
    if (id) {
      // Editing existing row - reload to restore
      loadDividends();
    } else {
      // New row - just remove
      currentEditingDividendRow.remove();
    }
    currentEditingDividendRow = null;
  }
};

// Update dividend in database
async function updateDividend(id) {
  const row = dividendsTbody.querySelector(`tr[data-id="${id}"]`);
  if (!row) return;

  const year = parseInt(row.querySelector('.year-select').value);
  const annualDividend =
    parseFloat(row.querySelector('[data-field="annual_dividend"]').textContent) || 0;

  try {
    const response = await fetch(`/api/dividends/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year: year,
        annual_dividend: annualDividend,
      }),
    });

    if (response.ok) {
      console.log('Dividend updated successfully');
    }
  } catch (error) {
    console.error('Error updating dividend:', error);
  }
}

// Delete dividend
window.deleteDividend = async function (id) {
  if (!confirm('Are you sure you want to delete this dividend?')) return;

  try {
    const response = await fetch(`/api/dividends/${id}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      await loadDividends();
    }
  } catch (error) {
    console.error('Error deleting dividend:', error);
  }
};

// Add new dividend button
if (addDividendBtn) {
  addDividendBtn.addEventListener('click', () => {
    if (dividendsView === 'monthly') {
      addNewMonthlyDividendRow();
    } else {
      addNewDividendRow();
    }
  });
}

if (floatingAddDividendBtn) {
  floatingAddDividendBtn.addEventListener('click', () => {
    if (dividendsView === 'monthly') {
      addNewMonthlyDividendRow();
    } else {
      addNewDividendRow();
    }
  });
}

// Floating button visibility for Dividends (mirror stocks behavior)
function handleFloatingDividendButtonVisibility() {
  if (!addDividendBtn || !floatingAddDividendBtn) return;
  const dividendsSection = document.getElementById('dividends-section');
  if (!dividendsSection || !dividendsSection.classList.contains('active')) {
    floatingAddDividendBtn.classList.remove('visible');
    return;
  }
  const btnRect = addDividendBtn.getBoundingClientRect();
  const isVisible = btnRect.top >= 0 && btnRect.bottom <= window.innerHeight;
  if (!isVisible) {
    floatingAddDividendBtn.classList.add('visible');
  } else {
    floatingAddDividendBtn.classList.remove('visible');
  }
}

window.addEventListener('scroll', handleFloatingDividendButtonVisibility);
window.addEventListener('resize', handleFloatingDividendButtonVisibility);
document.querySelectorAll('.nav-link').forEach((link) => {
  link.addEventListener('click', () => {
    setTimeout(handleFloatingDividendButtonVisibility, 120);
  });
});

// ========== PERFORMANCE CHART ==========
let performanceChart = null;
// ========== FX ANNUAL AVERAGES (Admin) ==========
async function fetchEcbSeriesCSV(seriesUrl) {
  try {
    const res = await fetch(seriesUrl, { headers: { 'Accept': 'text/csv' } });
    const text = await res.text();
    return text;
  } catch (e) {
    console.warn('FX fetch failed', e);
    return '';
  }
}

function computeYearlyAverageFromCSV(csvText) {
  // ECB CSV has header; last column value. Parse date,value rows.
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  // Find columns by header if present; fallback: date,value at end
  const dataLines = lines.filter((l) => /\d{4}-\d{2}-\d{2}/.test(l));
  const byYear = {};
  dataLines.forEach((line) => {
    const parts = line.split(',');
    const dateStr = parts.find((p) => /\d{4}-\d{2}-\d{2}/.test(p)) || '';
    const year = parseInt(dateStr.slice(0, 4));
    const valueStr = parts[parts.length - 1];
    const val = parseFloat(valueStr);
    if (!Number.isFinite(val)) return;
    if (!byYear[year]) byYear[year] = { sum: 0, count: 0 };
    byYear[year].sum += val;
    byYear[year].count += 1;
  });
  const averages = {};
  Object.keys(byYear).forEach((y) => {
    const { sum, count } = byYear[y];
    averages[parseInt(y)] = count > 0 ? +(sum / count).toFixed(4) : null;
  });
  return averages;
}

async function loadFxAnnualAverages(startYear = 2022) {
  const currentYear = new Date().getFullYear();
  const base = 'https://sdw-wsrest.ecb.europa.eu/service/data/EXR';
  const q = (code) => `${base}/D.${code}.EUR.SP00.A?startPeriod=${startYear}&endPeriod=${currentYear}&format=csv`;
  // EUR/RON: RON.EUR (EUR base → RON)
  const eurRonCSV = await fetchEcbSeriesCSV(q('RON'));
  const eurRonAvg = computeYearlyAverageFromCSV(eurRonCSV);
  // USD/EUR
  const usdEurCSV = await fetchEcbSeriesCSV(q('USD'));
  const usdEurAvg = computeYearlyAverageFromCSV(usdEurCSV);
  // Derive USD/RON = USD/EUR × EUR/RON per year
  const fxRows = [];
  for (let y = startYear; y <= currentYear; y++) {
    const eurRon = eurRonAvg[y] ?? null;
    const usdEur = usdEurAvg[y] ?? null;
    const usdRon = eurRon && usdEur ? +(eurRon * usdEur).toFixed(4) : null;
    fxRows.push({ year: y, eurRon, usdRon, usdEur: usdEur ?? null });
  }
  return fxRows;
}

function renderFxAnnualAverages(rows) {
  const tbody = document.getElementById('fx-averages-table-body');
  const updatedSpan = document.getElementById('fx-avg-last-updated');
  if (!tbody) return;
  tbody.innerHTML = '';
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-field="year">${r.year}</td>
      <td data-field="eur_ron">${r.eurRon ?? '—'}</td>
      <td data-field="usd_ron">${r.usdRon ?? '—'}</td>
      <td data-field="usd_eur">${r.usdEur ?? (r.eurRon && r.usdRon ? +(r.usdRon / r.eurRon).toFixed(4) : '—')}</td>
    `;
    tbody.appendChild(tr);
  });
  if (updatedSpan) {
    const ts = new Date();
    updatedSpan.textContent = `Last updated: ${ts.toLocaleString()}`;
  }
}

async function refreshFxAnnualAverages() {
  let rows = await loadFxAnnualAverages(2022);
  const allEmpty = rows.every((r) => (r.eurRon == null || r.eurRon === '—') && (r.usdRon == null || r.usdRon === '—'));
  if (allEmpty) {
    // Fallback demo values to visualize the table immediately
    rows = [
      { year: 2022, eurRon: 4.93, usdRon: 4.70 },
      { year: 2023, eurRon: 4.94, usdRon: 4.55 },
      { year: 2024, eurRon: 4.97, usdRon: 4.61 },
      { year: new Date().getFullYear(), eurRon: 4.97, usdRon: 4.58 },
    ];
  }
  renderFxAnnualAverages(rows);
  localStorage.setItem('fxAvgLastMonth', String(new Date().getMonth()));
  localStorage.setItem('fxAvgLastYear', String(new Date().getFullYear()));
}

function setupFxAdmin() {
  const btn = document.getElementById('refresh-fx-avg-btn');
  if (btn && !btn.dataset.initialized) {
    btn.dataset.initialized = 'true';
    btn.addEventListener('click', () => refreshFxAnnualAverages());
  }
  // Auto update on 1st of each month
  const today = new Date();
  const isFirst = today.getDate() === 1;
  const lastMonth = parseInt(localStorage.getItem('fxAvgLastMonth') || '-1');
  const lastYear = parseInt(localStorage.getItem('fxAvgLastYear') || '-1');
  if (isFirst) {
    const changedMonth = lastMonth !== today.getMonth() || lastYear !== today.getFullYear();
    if (changedMonth) refreshFxAnnualAverages();
  }
}

// Fetch and generate performance data from database snapshots (percentages already calculated)
async function generatePerformanceData(range) {
  try {
    console.log(`📊 Fetching performance snapshots for range: ${range}`);

    const response = await fetch(`${API_BASE}/api/performance-snapshots?range=${range}`);
    const data = await response.json();
    const snapshots = data.snapshots || [];

    console.log(`Retrieved ${snapshots.length} snapshots from database`);

    if (snapshots.length === 0) {
      console.warn('⚠️ No snapshots available yet — using S&P 500 fallback');
      // Fallback: fetch S&P 500 historical and build percent series
      const hist = await fetch(`${API_BASE}/api/historical/^GSPC?range=${range}`)
        .then((r) => r.json())
        .catch(() => null);
      if (hist && Array.isArray(hist.data) && hist.data.length > 1) {
        const base = hist.data[0].price;
        const labels = hist.data.map((p) => {
          const ts = new Date(p.timestamp);
          if (range === '1h')
            return ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          if (range === '1d') return ts.toLocaleTimeString('en-US', { hour: '2-digit' });
          if (range === '1w' || range === '1m')
            return ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return ts.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        });
        const sp500Data = hist.data
          .map((p) => ((p.price - base) / base) * 100)
          .map((x) => parseFloat(x.toFixed(2)));
        return { labels, portfolioData: [], depositsData: [], sp500Data, betTRData: [] };
      }
      return { labels: [], portfolioData: [], depositsData: [], sp500Data: [], betTRData: [] };
    }

    const labels = [];
    const portfolioData = [];
    const depositsData = [];
    const sp500Data = [];
    const betTRData = [];

    // Get first snapshot as reference point for this range
    const firstSnapshot = snapshots[0];
    const firstPortfolioBalance = parseFloat(firstSnapshot.portfolio_balance || 0);
    const firstDepositsPercent = parseFloat(firstSnapshot.deposits_percent || 0);
    const firstSP500Percent = parseFloat(firstSnapshot.sp500_percent || 0);
    const firstBETPercent = parseFloat(firstSnapshot.bet_percent || 0);

    // Process each snapshot - recalculate percentages relative to first snapshot in range
    snapshots.forEach((snapshot) => {
      const timestamp = new Date(snapshot.timestamp);

      // Format label based on range
      let label;
      if (range === '1h') {
        label = timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      } else if (range === '1d') {
        label = timestamp.toLocaleTimeString('en-US', { hour: '2-digit' });
      } else if (range === '1w' || range === '1m') {
        label = timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else {
        // For longer ranges show month + abbreviated year with apostrophe to avoid
        // misreading year as a day-of-month (e.g. 'Dec 25' interpreted as Dec 25th).
        const monthStr = timestamp.toLocaleString('en-US', { month: 'short' });
        const yearShort = String(timestamp.getFullYear()).slice(-2);
        label = `${monthStr} '${yearShort}`; // e.g. Dec '25
      }
      labels.push(label);

      // Calculate percentage change relative to first snapshot in this range
      const currentBalance = parseFloat(snapshot.portfolio_balance || 0);
      const portfolioChange =
        firstPortfolioBalance > 0
          ? ((currentBalance - firstPortfolioBalance) / firstPortfolioBalance) * 100
          : 0;

      // For other metrics, calculate relative change from their first values
      const depositsRaw = parseFloat(snapshot.deposits_percent);
      const sp500Raw = parseFloat(snapshot.sp500_percent);
      const betRaw = parseFloat(snapshot.bet_percent);

      const depositsChange =
        (Number.isFinite(depositsRaw) ? depositsRaw : 0) - firstDepositsPercent;
      const sp500Change = (Number.isFinite(sp500Raw) ? sp500Raw : 0) - firstSP500Percent;
      const betChange = (Number.isFinite(betRaw) ? betRaw : 0) - firstBETPercent;

      portfolioData.push(parseFloat(portfolioChange.toFixed(2)));
      depositsData.push(parseFloat(depositsChange.toFixed(2)));
      sp500Data.push(parseFloat(sp500Change.toFixed(2)));
      betTRData.push(parseFloat(betChange.toFixed(2)));
    });

    console.log(`✅ Generated chart data: ${labels.length} points`);
    // If S&P 500 series ended empty (e.g., missing sp500_percent in snapshots), fallback to Yahoo historical
    if (sp500Data.length === 0) {
      try {
        const hist = await fetch(`${API_BASE}/api/historical/^GSPC?range=${range}`).then((r) =>
          r.json()
        );
        if (hist && Array.isArray(hist.data) && hist.data.length > 1) {
          const base = hist.data[0].price;
          const histLabels = hist.data.map((p) => {
            const ts = new Date(p.timestamp);
            if (range === '1h')
              return ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            if (range === '1d') return ts.toLocaleTimeString('en-US', { hour: '2-digit' });
            if (range === '1w' || range === '1m')
              return ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return ts.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
          });
          const sp = hist.data
            .map((p) => ((p.price - base) / base) * 100)
            .map((x) => parseFloat(x.toFixed(2)));
          // Align labels if snapshots produced some; otherwise use historical labels
          if (labels.length === 0) {
            return { labels: histLabels, portfolioData, depositsData, sp500Data: sp, betTRData };
          }
          // If labels exist, just inject sp500 series
          return { labels, portfolioData, depositsData, sp500Data: sp, betTRData };
        }
      } catch (e) {
        console.warn('S&P 500 fallback failed:', e.message);
      }
    }

    // Store snapshots globally for tooltip access
    window.currentSnapshots = snapshots;

    return { labels, portfolioData, depositsData, sp500Data, betTRData };
  } catch (error) {
    console.error('❌ Error generating performance data:', error);
    return { labels: [], portfolioData: [], depositsData: [], sp500Data: [], betTRData: [] };
  }
}

Date.prototype.getDayOfYear = function () {
  const start = new Date(this.getFullYear(), 0, 0);
  const diff = this - start;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
};

async function updatePerformanceChart(range = '1m') {
  const ctx = document.getElementById('performance-chart');
  if (!ctx) {
    console.error('❌ Performance chart canvas not found');
    return;
  }

  console.log(`📈 Updating performance chart for range: ${range}`);
  const data = await generatePerformanceData(range);

  console.log('📊 Chart data received:', {
    labels: data.labels.length,
    portfolio: data.portfolioData.length,
    deposits: data.depositsData.length,
    sp500: data.sp500Data.length,
    betTR: data.betTRData.length,
  });

  // Update performance return display
  const returnElement = document.getElementById('performance-return');
  if (
    returnElement &&
    data.portfolioData.length > 0 &&
    window.currentSnapshots &&
    window.currentSnapshots.length > 0
  ) {
    const latestReturn = data.portfolioData[data.portfolioData.length - 1];
    const firstSnapshot = window.currentSnapshots[0];
    const lastSnapshot = window.currentSnapshots[window.currentSnapshots.length - 1];

    const firstBalance = parseFloat(firstSnapshot.portfolio_balance || 0);
    const lastBalance = parseFloat(lastSnapshot.portfolio_balance || 0);
    const euroChange = lastBalance - firstBalance;

    const sign = latestReturn >= 0 ? '+' : '';
    const euroSign = euroChange >= 0 ? '+' : '';
    const color = latestReturn >= 0 ? '#00ff88' : '#ff6b6b';

    returnElement.textContent = `${euroSign}€${euroChange.toFixed(2)} (${sign}${latestReturn.toFixed(2)}%)`;
    returnElement.style.color = color;
    returnElement.style.textShadow =
      latestReturn >= 0
        ? '0 0 15px rgba(0,255,136,0.4)'
        : '0 0 15px rgba(255,107,107,0.4), 0 0 2px rgba(0,0,0,1)';
  }

  if (performanceChart) {
    performanceChart.destroy();
  }

  // Line thickness per range
  const bw = (range === '1h') ? 3.5 : (range === '1d') ? 3 : 2.5;

  performanceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: 'Portfolio Balance',
          data: data.portfolioData,
          borderColor: '#00d9ff',
          backgroundColor: 'rgba(0, 217, 255, 0.1)',
          borderWidth: bw,
          hidden: (window.legendVisibility && window.legendVisibility[0] === false) ? true : false,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 3,
          pointHoverBackgroundColor: '#00d9ff',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
        },
        {
          label: 'Total Deposits',
          data: data.depositsData,
          borderColor: '#ffffff',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: bw,
          hidden: (window.legendVisibility && window.legendVisibility[1] === false) ? true : false,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 3,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          borderDash: [5, 5],
        },
        {
          label: 'S&P 500',
          data: data.sp500Data,
          borderColor: '#FFC107',
          backgroundColor: 'rgba(255, 193, 7, 0.05)',
          borderWidth: bw,
          hidden: (window.legendVisibility && window.legendVisibility[2] === false) ? true : false,
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 3,
          pointHoverBackgroundColor: '#FFC107',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
        },
        {
          label: 'BET-TR',
          data: data.betTRData,
          borderColor: '#ff8a80',
          backgroundColor: 'rgba(255, 138, 128, 0.05)',
          borderWidth: bw,
          hidden: (window.legendVisibility && window.legendVisibility[3] === false) ? true : false,
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 3,
          pointHoverBackgroundColor: '#ff8a80',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          titleColor: '#ffffff',
          bodyColor: '#ffffff',
          titleFont: {
            size: 15,
            weight: 'bold',
            family: "'Inter', 'Segoe UI', sans-serif",
          },
          bodyFont: {
            size: 14,
            weight: '900',
            family: "'Inter', 'Segoe UI', sans-serif",
          },
          padding: 12,
          cornerRadius: 8,
          borderColor: 'rgba(255, 255, 255, 0.2)',
          borderWidth: 1,
          displayColors: true,
          boxWidth: 10,
          boxHeight: 10,
          boxPadding: 6,
          usePointStyle: true,
          multiKeyBackground: 'transparent',
          callbacks: {
            title: function (context) {
              const index = context[0].dataIndex;
              const snapshots = window.currentSnapshots || [];
              if (snapshots[index]) {
                const timestamp = new Date(snapshots[index].timestamp);
                const balance = parseFloat(snapshots[index].portfolio_balance || 0);
                const dateStr = timestamp.toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return [
                  '📊 ' + dateStr,
                  `💰 Balance: €${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                ];
              }
              return context[0].label;
            },
            labelColor: function (context) {
              return {
                borderColor: context.dataset.borderColor,
                backgroundColor: context.dataset.borderColor,
                borderWidth: 2,
                borderRadius: 4,
              };
            },
            label: function (context) {
              // Skip Total Deposits from tooltip
              if (context.dataset.label === 'Total Deposits') {
                return null;
              }
              const value = parseFloat(context.parsed.y).toFixed(2);
              const label = context.dataset.label || '';
              const sign = value >= 0 ? '+' : '';
              return ` ${label}: ${sign}${value}%`;
            },
            labelTextColor: function (context) {
              return '#ffffff';
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
            drawBorder: false,
          },
          ticks: {
            color: 'rgba(255, 255, 255, 0.8)',
            maxTicksLimit: 10,
            // Prevent showing a future month tick beyond now when using category labels
            callback: function(value, index, ticks) {
              const label = this.getLabelForValue(value);
              // If label contains a year and represents a month beyond current date, drop it
              // Parse pattern like "Dec '25".
              const match = /^(\w{3}) '\d{2}$/.exec(label);
              if (match) {
                const monthStr = match[1];
                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                const monthIndex = months.indexOf(monthStr);
                const now = new Date();
                // If this is the last tick and month is greater than current month and year equals current year
                if (index === ticks.length - 1) {
                  // Extract year
                  const yearShort = label.slice(-2);
                  const yearFull = Number('20' + yearShort);
                  if (yearFull === now.getFullYear() && monthIndex > now.getMonth()) {
                    return ''; // hide future month tick
                  }
                }
              }
              return label;
            }
          },
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
            drawBorder: false,
          },
          ticks: {
            color: 'rgba(255, 255, 255, 0.8)',
            maxTicksLimit: 8,
            callback: function (value) {
              return value.toFixed(2) + '%';
            },
          },
        },
      },
      animation: {
        duration: 750,
        easing: 'easeInOutQuart',
      },
    },
  });

  // Store chart globally for checkbox access
  window.performanceChart = performanceChart;
}

// ========== ADMIN SECTION ==========

// Load all snapshots
async function loadSnapshotsData() {
  try {
    const response = await fetch(`${API_BASE}/api/performance-snapshots?range=max`);
    const data = await response.json();
    const snapshots = data.snapshots || [];

    console.log(`📊 Loaded ${snapshots.length} snapshots`);

    // Update stats
    document.getElementById('total-snapshots-count').textContent = snapshots.length;

    if (snapshots.length > 0) {
      const firstDate = new Date(snapshots[0].timestamp).toLocaleDateString();
      const lastDate = new Date(snapshots[snapshots.length - 1].timestamp).toLocaleDateString();
      document.getElementById('snapshots-date-range').textContent = `${firstDate} - ${lastDate}`;

      // Estimate size (70 bytes per snapshot)
      const sizeKB = Math.round((snapshots.length * 70) / 1024);
      document.getElementById('snapshots-size').textContent = `${sizeKB} KB`;
    } else {
      document.getElementById('snapshots-date-range').textContent = '-';
      document.getElementById('snapshots-size').textContent = '0 KB';
    }

    // Populate table
    const tbody = document.getElementById('snapshots-tbody');
    if (snapshots.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="8" style="text-align: center; padding: 2rem;">No snapshots available</td></tr>';
      return;
    }

    tbody.innerHTML = snapshots
      .map((snapshot) => {
        const date = new Date(snapshot.timestamp);
        const dateStr = date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

        const balanceFormatted = snapshot.portfolio_balance
          ? `€${snapshot.portfolio_balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : '-';

        return `
            <tr class="snapshot-row" data-snapshot-id="${snapshot.id}" data-timestamp="${snapshot.timestamp}" data-balance="${snapshot.portfolio_balance || 0}" data-portfolio-percent="${snapshot.portfolio_percent}" data-deposits-percent="${snapshot.deposits_percent}" data-sp500-percent="${snapshot.sp500_percent}" data-bet-percent="${snapshot.bet_percent}">
              <td data-field="id">${snapshot.id}</td>
              <td data-field="datetime">${dateStr}</td>
              <td data-field="balance">${balanceFormatted}</td>
              <td data-field="portfolio_percent">${snapshot.portfolio_percent.toFixed(4)}%</td>
              <td data-field="deposits_percent">${snapshot.deposits_percent.toFixed(4)}%</td>
              <td data-field="sp500_percent">${snapshot.sp500_percent.toFixed(4)}%</td>
              <td data-field="bet_percent">${snapshot.bet_percent.toFixed(4)}%</td>
              <td style="display:flex;gap:4px;justify-content:flex-end;">
                <button class="edit-snapshot-btn btn-sm" title="Edit" onclick="editSnapshot(${snapshot.id})">✏️</button>
                <button class="delete-snapshot-btn btn-sm" title="Delete" onclick="deleteSnapshot(${snapshot.id})">🗑️</button>
              </td>
            </tr>
          `;
      })
      .join('');
  } catch (error) {
    console.error('Error loading snapshots:', error);
    document.getElementById('snapshots-tbody').innerHTML =
      '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: #f44336;">Error loading snapshots</td></tr>';
  }
}

// Delete a single snapshot
async function deleteSnapshot(id) {
  if (!confirm(`Delete snapshot #${id}?`)) return;

  try {
    const response = await fetch(`/api/performance-snapshot/${id}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      console.log(`✅ Deleted snapshot #${id}`);
      loadSnapshotsData();
    } else {
      alert('Failed to delete snapshot');
    }
  } catch (error) {
    console.error('Error deleting snapshot:', error);
    alert('Error deleting snapshot');
  }
}

// Edit an existing snapshot inline
async function editSnapshot(id) {
  const tbody = document.getElementById('snapshots-tbody');
  if (!tbody) return;
  // If manual new row is open, remove it
  if (currentEditingSnapshotRow && currentEditingSnapshotRow.classList.contains('editing-new')) {
    currentEditingSnapshotRow.remove();
    currentEditingSnapshotRow = null;
  }
  // If another snapshot is being edited, reload to reset
  if (currentEditingSnapshotRow && currentEditingSnapshotRow.dataset && currentEditingSnapshotRow.dataset.snapshotId !== String(id)) {
    await loadSnapshotsData();
  }
  const row = tbody.querySelector(`tr[data-snapshot-id="${id}"]`);
  if (!row) return;
  currentEditingSnapshotRow = row;
  const ts = Number(row.getAttribute('data-timestamp')) || Date.now();
  const bal = Number(row.getAttribute('data-balance')) || 0;
  const pPct = Number(row.getAttribute('data-portfolio-percent')) || 0;
  const dPct = Number(row.getAttribute('data-deposits-percent')) || 0;
  const spPct = Number(row.getAttribute('data-sp500-percent')) || 0;
  const betPct = Number(row.getAttribute('data-bet-percent')) || 0;
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  row.innerHTML = `
    <td data-field="id">${id}</td>
    <td data-field="datetime"><input type="datetime-local" value="${dateStr}" style="width:100%;background:#232323;color:#fff;border:1px solid #444;border-radius:6px;padding:4px 6px;font-size:0.7rem;" /></td>
    <td data-field="balance"><input type="text" value="${bal}" style="width:100%;background:#232323;color:#fff;border:1px solid #444;border-radius:6px;padding:4px 6px;font-size:0.7rem;" /></td>
    <td data-field="portfolio_percent"><input type="text" value="${pPct.toFixed(4)}" style="width:100%;background:#232323;color:#fff;border:1px solid #444;border-radius:6px;padding:4px 6px;font-size:0.7rem;" /></td>
    <td data-field="deposits_percent"><input type="text" value="${dPct.toFixed(4)}" style="width:100%;background:#232323;color:#fff;border:1px solid #444;border-radius:6px;padding:4px 6px;font-size:0.7rem;" /></td>
    <td data-field="sp500_percent"><input type="text" value="${spPct.toFixed(4)}" style="width:100%;background:#232323;color:#fff;border:1px solid #444;border-radius:6px;padding:4px 6px;font-size:0.7rem;" /></td>
    <td data-field="bet_percent"><input type="text" value="${betPct.toFixed(4)}" style="width:100%;background:#232323;color:#fff;border:1px solid #444;border-radius:6px;padding:4px 6px;font-size:0.7rem;" /></td>
    <td style="display:flex;gap:6px;align-items:center;justify-content:flex-end;">
      <button class="btn-sm btn-primary" onclick="saveEditedSnapshot(${id})">Save</button>
      <button class="btn-sm btn-danger" onclick="cancelEditSnapshot()">Cancel</button>
    </td>
  `;
}

function cancelEditSnapshot() {
  currentEditingSnapshotRow = null;
  loadSnapshotsData();
}

async function saveEditedSnapshot(id) {
  const row = currentEditingSnapshotRow;
  if (!row) return;
  const getVal = (field) => {
    const input = row.querySelector(`td[data-field="${field}"] input`);
    return input ? input.value.trim() : null;
  };
  const dtRaw = getVal('datetime');
  let timestamp = Date.parse(dtRaw);
  if (!Number.isFinite(timestamp)) timestamp = undefined; // Skip invalid timestamp
  const balanceRaw = getVal('balance');
  const portfolioPercentRaw = getVal('portfolio_percent');
  const depositsPercentRaw = getVal('deposits_percent');
  const sp500PercentRaw = getVal('sp500_percent');
  const betPercentRaw = getVal('bet_percent');
  const payload = {};
  const parseNum = (v) => {
    if (v == null) return undefined;
    const num = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(num) ? num : undefined;
  };
  const balNum = parseNum(balanceRaw);
  if (balNum !== undefined) payload.portfolio_balance = balNum;
  const pPct = parseNum(portfolioPercentRaw);
  if (pPct !== undefined) payload.portfolio_percent = pPct;
  const dPct = parseNum(depositsPercentRaw);
  if (dPct !== undefined) payload.deposits_percent = dPct;
  const spPct = parseNum(sp500PercentRaw);
  if (spPct !== undefined) payload.sp500_percent = spPct;
  const betPct = parseNum(betPercentRaw);
  if (betPct !== undefined) payload.bet_percent = betPct;
  if (timestamp !== undefined) payload.timestamp = timestamp;
  if (Object.keys(payload).length === 0) {
    alert('No valid values to update');
    return;
  }
  try {
    const resp = await fetch(`${API_BASE}/api/performance-snapshot/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      alert('Update failed: ' + (err.error || resp.status));
      return;
    }
    currentEditingSnapshotRow = null;
    await loadSnapshotsData();
  } catch (e) {
    console.error('Error updating snapshot', e);
    alert('Error updating snapshot');
  }
}

// ===== Manual Snapshot Row Creation =====
let currentEditingSnapshotRow = null;
function createEditableSnapshotRow() {
  const tbody = document.getElementById('snapshots-tbody');
  if (!tbody) return;
  // Remove existing editing row if any
  if (currentEditingSnapshotRow) {
    currentEditingSnapshotRow.remove();
    currentEditingSnapshotRow = null;
  }
  const row = document.createElement('tr');
  row.classList.add('editing');
  // Build a local datetime value suitable for <input type="datetime-local">
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const localValue = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  row.innerHTML = `
    <td data-field="id">New</td>
    <td data-field="datetime"><input type="datetime-local" value="${localValue}" style="width:100%;background:#232323;color:#fff;border:1px solid #444;border-radius:6px;padding:4px 6px;font-size:0.7rem;" /></td>
    <td data-field="balance"><input type="text" placeholder="Balance €" style="width:100%;background:#232323;color:#fff;border:1px solid #444;border-radius:6px;padding:4px 6px;font-size:0.7rem;" /></td>
    <td data-field="portfolio_percent"><input type="text" placeholder="Portfolio %" style="width:100%;background:#232323;color:#fff;border:1px solid #444;border-radius:6px;padding:4px 6px;font-size:0.7rem;" /></td>
    <td data-field="deposits_percent"><input type="text" placeholder="Deposits %" style="width:100%;background:#232323;color:#fff;border:1px solid #444;border-radius:6px;padding:4px 6px;font-size:0.7rem;" /></td>
    <td data-field="sp500_percent"><input type="text" placeholder="S&P 500 %" style="width:100%;background:#232323;color:#fff;border:1px solid #444;border-radius:6px;padding:4px 6px;font-size:0.7rem;" /></td>
    <td data-field="bet_percent"><input type="text" placeholder="BET-TR %" style="width:100%;background:#232323;color:#fff;border:1px solid #444;border-radius:6px;padding:4px 6px;font-size:0.7rem;" /></td>
    <td style="display:flex;gap:6px;align-items:center;justify-content:flex-end;">
      <button class="btn-sm btn-primary" id="save-manual-snapshot-btn">Save</button>
      <button class="btn-sm btn-danger" id="cancel-manual-snapshot-btn">Cancel</button>
    </td>
  `;
  tbody.insertBefore(row, tbody.firstChild);
  currentEditingSnapshotRow = row;
  const balanceInput = row.querySelector('td[data-field="balance"] input');
  if (balanceInput) balanceInput.focus();
  const cancelBtn = row.querySelector('#cancel-manual-snapshot-btn');
  const saveBtn = row.querySelector('#save-manual-snapshot-btn');
  cancelBtn.addEventListener('click', () => {
    row.remove();
    currentEditingSnapshotRow = null;
  });
  saveBtn.addEventListener('click', async () => {
    await saveManualSnapshotFromRow(row);
  });
}

async function saveManualSnapshotFromRow(row) {
  if (!row) return;
  const getVal = (field) => {
    const input = row.querySelector(`td[data-field="${field}"] input`);
    if (!input) return null;
    return input.value.trim();
  };
  const datetimeRaw = getVal('datetime');
  let timestampOverride;
  if (datetimeRaw) {
    // Support datetime-local format and ISO
    const parsedDate = new Date(datetimeRaw);
    const parsed = parsedDate.getTime();
    if (Number.isFinite(parsed)) {
      timestampOverride = parsed;
    }
  }
  const balanceRaw = getVal('balance');
  const depositsPercentRaw = getVal('deposits_percent');
  const portfolioPercentRaw = getVal('portfolio_percent');
  const sp500PercentRaw = getVal('sp500_percent');
  const betPercentRaw = getVal('bet_percent');
  const balance = parseFloat(balanceRaw.replace(/[^0-9.\-]/g,'')) || 0;
  // Derive total deposits if deposits % provided and portfolio percent present
  let totalDeposits = 0;
  const depositsPct = parseFloat(depositsPercentRaw.replace(/[^0-9.\-]/g,''));
  if (Number.isFinite(depositsPct) && depositsPct !== 0 && balance > 0) {
    // deposits_percent was stored as percentage change baseline? unknown; fallback simple proportional
    totalDeposits = balance * (1 - (depositsPct/100));
  } else {
    // Fallback: use existing deposits total from DOM if available
    const depositsEl = document.getElementById('total-deposits-embedded') || document.getElementById('total-deposits-amount');
    if (depositsEl) totalDeposits = parseFloat(depositsEl.textContent.replace(/[^0-9.\-]/g,'')) || 0;
  }
  const bodyBase = {
    portfolio_balance: Math.round(balance * 100)/100,
    total_deposits: Math.round(totalDeposits * 100)/100
  };
  if (timestampOverride) bodyBase.timestamp = timestampOverride;
  // Try manual endpoint first if percent overrides supplied
  let manualPayload = { ...bodyBase };
  const portfolioPct = parseFloat(portfolioPercentRaw.replace(/[^0-9.\-]/g,''));
  const sp500Pct = parseFloat(sp500PercentRaw.replace(/[^0-9.\-]/g,''));
  const betPct = parseFloat(betPercentRaw.replace(/[^0-9.\-]/g,''));
  if (Number.isFinite(portfolioPct)) manualPayload.portfolio_percent_override = portfolioPct;
  if (Number.isFinite(depositsPct)) manualPayload.deposits_percent_override = depositsPct;
  if (Number.isFinite(sp500Pct)) manualPayload.sp500_percent_override = sp500Pct;
  if (Number.isFinite(betPct)) manualPayload.bet_percent_override = betPct;
  let ok = false;
  try {
    const respManual = await fetch(`${API_BASE}/api/performance-snapshot/manual`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(manualPayload)
    });
    if (respManual.ok) {
      ok = true;
    }
  } catch (e) {
    console.warn('Manual snapshot endpoint failed', e.message);
  }
  if (!ok) {
    try {
      const resp = await fetch(`${API_BASE}/api/performance-snapshot`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyBase)
      });
      ok = resp.ok;
    } catch (e) {
      console.error('Fallback snapshot save failed', e.message);
    }
  }
  if (ok) {
    row.remove();
    currentEditingSnapshotRow = null;
    await loadSnapshotsData();
  } else {
    alert('Failed to save snapshot');
  }
}

// Delete old snapshots (>30 days)
async function deleteOldSnapshots() {
  try {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const response = await fetch(
      `${API_BASE}/api/performance-snapshots/delete-old?before=${thirtyDaysAgo}`,
      {
        method: 'DELETE',
      }
    );

    const result = await response.json();
    alert(`Deleted ${result.deleted || 0} old snapshots`);
    loadSnapshotsData();
  } catch (error) {
    console.error('Error deleting old snapshots:', error);
    alert('Error deleting old snapshots');
  }
}

// Delete all snapshots
async function deleteAllSnapshots() {
  try {
    const response = await fetch(`${API_BASE}/api/performance-snapshots/delete-all`, {
      method: 'DELETE',
    });

    const result = await response.json();
    alert(`Deleted all ${result.deleted || 0} snapshots`);
    loadSnapshotsData();
  } catch (error) {
    console.error('Error deleting all snapshots:', error);
    alert('Error deleting all snapshots');
  }
}

// Initialize delete range button
function initDeleteRangeButton() {
  const deleteRangeBtn = document.getElementById('delete-range-btn');
  if (deleteRangeBtn) {
    console.log('Delete range button found and event listener added');
    // Remove any existing listeners by cloning the button
    const newBtn = deleteRangeBtn.cloneNode(true);
    deleteRangeBtn.parentNode.replaceChild(newBtn, deleteRangeBtn);

    newBtn.addEventListener('click', async () => {
      console.log('Delete range button clicked');
      const fromId = parseInt(document.getElementById('delete-range-from').value);
      const toId = parseInt(document.getElementById('delete-range-to').value);

      console.log('From ID:', fromId, 'To ID:', toId);

      if (!fromId || !toId) {
        alert('Please enter both From and To ID values');
        return;
      }

      if (fromId > toId) {
        alert('From ID must be less than or equal to To ID');
        return;
      }

      console.log('About to show confirm dialog');
      const confirmed = confirm(`Delete snapshots with IDs from ${fromId} to ${toId}?`);
      console.log('Confirm result:', confirmed);

      if (confirmed) {
        console.log('User confirmed deletion');
        await deleteSnapshotRange(fromId, toId);
      } else {
        console.log('User cancelled deletion');
      }
    });
  } else {
    console.error('Delete range button NOT found');
  }

  // Scroll shortcuts
  const firstBtn = document.getElementById('scroll-first-row-btn');
  const lastBtn = document.getElementById('scroll-last-row-btn');
  const container = document.querySelector('.admin-table-panel .table-container');
  if (firstBtn) {
    const newBtn = firstBtn.cloneNode(true);
    firstBtn.parentNode.replaceChild(newBtn, firstBtn);
    newBtn.addEventListener('click', () => {
      const tbody = document.getElementById('snapshots-tbody');
      if (!tbody) return;
      const firstRow = tbody.querySelector('tr');
      if (!firstRow) return;
      if (container) container.scrollTop = 0;
      firstRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  if (lastBtn) {
    const newBtn = lastBtn.cloneNode(true);
    lastBtn.parentNode.replaceChild(newBtn, lastBtn);
    newBtn.addEventListener('click', () => {
      const tbody = document.getElementById('snapshots-tbody');
      if (!tbody) return;
      const rows = tbody.querySelectorAll('tr');
      const lastRow = rows[rows.length - 1];
      if (!lastRow) return;
      if (container) container.scrollTop = container.scrollHeight;
      lastRow.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }
}

// Delete snapshots by ID range
async function deleteSnapshotRange(fromId, toId) {
  console.log('deleteSnapshotRange called with:', fromId, toId);
  try {
    const url = `${API_BASE}/api/performance-snapshots/delete-range?from=${fromId}&to=${toId}`;
    console.log('Fetching:', url);

    const response = await fetch(url, {
      method: 'DELETE',
    });

    console.log('Response status:', response.status);
    const result = await response.json();
    console.log('Result:', result);

    alert(`Deleted ${result.deleted || 0} snapshots (IDs ${fromId} to ${toId})`);
    loadSnapshotsData();

    // Clear input fields
    document.getElementById('delete-range-from').value = '';
    document.getElementById('delete-range-to').value = '';
  } catch (error) {
    console.error('Error deleting snapshot range:', error);
    alert('Error deleting snapshot range: ' + error.message);
  }
}

// Reset baseline (T0) to current values
async function resetBaseline() {
  try {
    // Get latest snapshot data to use as new baseline
    const snapshotsResponse = await fetch(`${API_BASE}/api/performance-snapshots?range=max`);
    const snapshotsData = await snapshotsResponse.json();
    const snapshots = snapshotsData.snapshots || [];

    if (snapshots.length === 0) {
      alert('Nu există snapshots pentru a reseta baseline-ul!');
      return;
    }

    // Use the most recent snapshot as the new baseline
    const latestSnapshot = snapshots[snapshots.length - 1];
    const portfolioBalance = latestSnapshot.portfolio_balance;

    // Calculate total deposits from deposits API
    const depositsResponse = await fetch(`${API_BASE}/api/deposits`);
    const depositsData = await depositsResponse.json();

    const totalDeposits = depositsData.reduce((sum, deposit) => {
      const amount = parseFloat(deposit.amount.replace(/[^0-9.-]/g, ''));
      return sum + amount;
    }, 0);

    console.log(
      `🔄 Resetting baseline to: Portfolio=${portfolioBalance}€, Deposits=${totalDeposits}€`
    );

    const response = await fetch(`${API_BASE}/api/performance-baseline/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        portfolio_balance: portfolioBalance,
        total_deposits: totalDeposits,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to reset baseline');
    }

    console.log('✅ Baseline reset successfully:', result);
    alert('✅ T0 resetat! Toate graficele pornesc acum de la 0%.');

    // Reload snapshots and refresh chart
    loadSnapshotsData();
    updatePerformanceChart('max');
  } catch (error) {
    console.error('Error resetting baseline:', error);
    alert('Error resetting baseline: ' + error.message);
  }
}

// Export snapshots to CSV
function exportSnapshotsToCSV() {
  fetch(`${API_BASE}/api/performance-snapshots?range=max`)
    .then((response) => response.json())
    .then((data) => {
      const snapshots = data.snapshots || [];

      if (snapshots.length === 0) {
        alert('No snapshots to export');
        return;
      }

      // Create CSV content
      let csv = 'ID,Timestamp,Date,Portfolio %,Deposits %,S&P 500 %,BET-TR %\n';

      snapshots.forEach((snapshot) => {
        const date = new Date(snapshot.timestamp).toLocaleString();
        csv += `${snapshot.id},${snapshot.timestamp},"${date}",${snapshot.portfolio_percent},${snapshot.deposits_percent},${snapshot.sp500_percent},${snapshot.bet_percent}\n`;
      });

      // Download CSV
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `performance-snapshots-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      console.log('✅ Exported CSV with', snapshots.length, 'snapshots');
    })
    .catch((error) => {
      console.error('Error exporting snapshots:', error);
      alert('Error exporting snapshots');
    });
}

// Allocation Chart (Sectors/Countries)
let allocationPieChart = null;
let currentView = 'sectors'; // 'sectors' or 'countries'

// Color palette for charts
const CHART_COLORS = [
  '#FFC107',
  '#2196F3',
  '#4CAF50',
  '#9C27B0',
  '#F44336',
  '#FF9800',
  '#00BCD4',
  '#795548',
  '#E91E63',
  '#607D8B',
  '#8BC34A',
  '#FF5722',
  '#3F51B5',
  '#009688',
  '#CDDC39',
  '#673AB7',
  '#FFC107',
  '#00BCD4',
  '#E91E63',
  '#4CAF50',
];

function createAllocationPieChart(data, title) {
  if (!Array.isArray(data)) {
    console.warn('Allocation data not array, coercing to empty list');
    data = [];
  }
  const ctx = document.getElementById('allocation-pie-chart');
  if (!ctx) {
    console.error('Allocation canvas not found!');
    return;
  }

  const labels = data.map((item) => item.name);
  const values = data.map((item) => item.percentage);

  if (allocationPieChart) {
    allocationPieChart.destroy();
  }

  allocationPieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [
        {
          data: values,
          backgroundColor: CHART_COLORS.slice(0, data.length),
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1,
      animation: {
        animateRotate: false,
        animateScale: false,
      },
      plugins: {
        legend: {
          display: false, // Hide legend, we'll show it separately
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          titleColor: 'white',
          bodyColor: 'white',
          borderColor: 'rgba(255, 255, 255, 0.3)',
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          callbacks: {
            label: function (context) {
              return `${context.label}: ${context.parsed.toFixed(2)}%`;
            },
          },
        },
      },
    },
  });

  // Update the allocation list
  updateAllocationList(data);
}

function updateAllocationList(data) {
  const listDiv = document.getElementById('allocation-list');
  if (!listDiv) return;
  listDiv.innerHTML = data
    .map((item, index) => {
      const color = CHART_COLORS[index % CHART_COLORS.length];
      return `
        <div class="allocation-item" style="border-left:4px solid ${color};">
            <div style="display:flex; align-items:center; gap:0.4rem;">
                <div style="width:8px; height:8px; border-radius:2px; background:${color}; flex-shrink:0;"></div>
                <span class="allocation-name">${item.name}</span>
            </div>
            <span class="allocation-percentage">${item.percentage.toFixed(2)}%</span>
        </div>`;
    })
    .join('');
}

async function loadAllocationData(view) {
  try {
    const endpointPath =
      view === 'sectors' ? '/api/allocation/sectors' : '/api/allocation/countries';
    const response = await fetch(`${API_BASE}${endpointPath}`);
    let data = await response.json();
    if (!Array.isArray(data)) {
      // Some backends may wrap the payload
      if (data && Array.isArray(data.data)) data = data.data;
      else {
        console.warn('Unexpected allocation payload', data);
        data = [];
      }
    }

    // If backend returns nothing, compute client-side from /api/stocks
    if (!data.length) {
      console.log('Computing allocation client-side from /api/stocks');
      const stocksResp = await fetch(`${API_BASE}/api/stocks`);
      const stocks = await stocksResp.json();
      if (Array.isArray(stocks) && stocks.length) {
        data =
          view === 'sectors'
            ? computeSectorsAllocation(stocks)
            : computeCountriesAllocation(stocks);
      }
    }

    // For countries view, recalculate Romania percentage from UI balances
    if (view === 'countries') {
      data = await adjustCountriesWithRealBalances(data);
    }

    const title = view === 'sectors' ? 'Sector Allocation' : 'Country Allocation';
    createAllocationPieChart(data, title);

    console.log(`✅ Loaded ${view} allocation:`, data);
  } catch (error) {
    console.error(`Error loading ${view} allocation:`, error);
  }
}

async function computeSectorsAllocation(stocks) {
  // Fetch FX for EUR reference
  const rates = await fetch(`${API_BASE}/api/exchange-rates`)
    .then((r) => r.json())
    .catch(() => ({ USD: 1.16, GBP: 0.86, RON: 5.09 }));
  const USD = rates.USD ?? 1.16;
  const GBP = rates.GBP ?? 0.86;
  const RON = rates.RON ?? 5.09;
  const totals = {};
  let grand = 0;
  stocks.forEach((stock) => {
    const sector = stock.sector || 'Unknown';
    if (sector === 'Cash' || sector === 'Cryptocurrency') return; // exclude Cash/Crypto
    const shares = parseFloat(String(stock.shares).replace(/[^0-9.-]/g, '')) || 0;
    const raw = String(stock.share_price || '0');
    const num = parseFloat(raw.replace(/[^0-9.-]/g, '')) || 0;
    let priceEUR = num;
    const broker = String(stock.broker || '');
    if (raw.includes('$') || broker === 'Crypto') priceEUR = num / USD;
    else if (raw.includes('£')) priceEUR = num / GBP;
    else if (/GBX|GBp|p\b/.test(raw)) priceEUR = num / 100 / GBP;
    else if (/RON|Lei|lei/i.test(raw)) priceEUR = num / RON;
    const value = shares * (priceEUR || 0);
    totals[sector] = (totals[sector] || 0) + value;
    grand += value;
  });
  const out = Object.entries(totals)
    .filter(([_, v]) => v > 0)
    .map(([name, v]) => ({ name, percentage: grand > 0 ? (v / grand) * 100 : 0 }))
    .sort((a, b) => b.percentage - a.percentage);
  return out;
}

async function computeCountriesAllocation(stocks) {
  // Fetch FX for EUR reference
  const rates = await fetch(`${API_BASE}/api/exchange-rates`)
    .then((r) => r.json())
    .catch(() => ({ USD: 1.16, GBP: 0.86, RON: 5.09 }));
  const USD = rates.USD ?? 1.16;
  const GBP = rates.GBP ?? 0.86;
  const RON = rates.RON ?? 5.09;
  const totals = {};
  let grand = 0;
  function assignCountry(stock) {
    const sector = (stock.sector || '').toLowerCase();
    const sym = String(stock.symbol || '').toUpperCase();
    const broker = String(stock.broker || '');
    if (sym.endsWith('.RO') || broker === 'Tradeville' || sym.includes('TLV.RO')) return 'Romania';
    if (sector.startsWith('etf us')) return 'United States';
    if (sector.startsWith('etf europe')) return 'Europe';
    if (sector.startsWith('etf uk')) return 'United Kingdom';
    if (sector.startsWith('etf')) return 'Global';
    if (broker === 'XTB-USD' || broker === 'Trading212') return 'United States';
    return 'United States';
  }
  stocks.forEach((stock) => {
    const sector = stock.sector || '';
    if (sector === 'Cash' || sector === 'Cryptocurrency') return;
    const shares = parseFloat(String(stock.shares).replace(/[^0-9.-]/g, '')) || 0;
    const raw = String(stock.share_price || '0');
    const num = parseFloat(raw.replace(/[^0-9.-]/g, '')) || 0;
    let priceEUR = num;
    const broker = String(stock.broker || '');
    if (raw.includes('$') || broker === 'Crypto') priceEUR = num / USD;
    else if (raw.includes('£')) priceEUR = num / GBP;
    else if (/GBX|GBp|p\b/.test(raw)) priceEUR = num / 100 / GBP;
    else if (/RON|Lei|lei/i.test(raw)) priceEUR = num / RON;
    const value = shares * (priceEUR || 0);
    const country = assignCountry(stock);
    totals[country] = (totals[country] || 0) + value;
    grand += value;
  });
  const out = Object.entries(totals)
    .filter(([name, v]) => v > 0 && name !== 'Cash')
    .map(([name, v]) => ({ name, percentage: grand > 0 ? (v / grand) * 100 : 0 }))
    .sort((a, b) => b.percentage - a.percentage);
  return out;
}

async function adjustCountriesWithRealBalances(countriesData) {
  try {
    if (!Array.isArray(countriesData)) {
      console.warn('countriesData not array; skipping adjustment');
      return [];
    }
    // Fetch stocks to calculate balances
    const stocksResponse = await fetch('/api/stocks');
    const stocks = await stocksResponse.json();

    // Calculate Tradeville balance (Romanian stocks only - no ETFs)
    let tradevilleBalance = 0;
    stocks.forEach((stock) => {
      if (stock.broker === 'Tradeville' || stock.symbol === 'Cash Tradeville') {
        const shares = parseFloat(stock.shares) || 0;
        let priceStr = String(stock.share_price || '0')
          .replace(/[€$\s]/g, '')
          .replace(',', '.');
        const price = parseFloat(priceStr) || 0;
        tradevilleBalance += shares * price;
      }
    });

    // Calculate total balance for non-ETF, non-Cash, non-Crypto stocks in XTB-EUR, XTB-USD, Trading212
    let nonRomanianStocksBalance = 0;
    stocks.forEach((stock) => {
      const broker = stock.broker || '';
      const sector = stock.sector || '';

      if (
        (broker === 'XTB-EUR' || broker === 'XTB-USD' || broker === 'Trading212') &&
        sector !== 'Cash' &&
        sector !== 'Cryptocurrency' &&
        !sector.startsWith('ETF')
      ) {
        const shares = parseFloat(stock.shares) || 0;
        let priceStr = String(stock.share_price || '0')
          .replace(/[€$\s]/g, '')
          .replace(',', '.');
        const price = parseFloat(priceStr) || 0;
        nonRomanianStocksBalance += shares * price;
      }
    });

    // Calculate total balance from ETFs (will be distributed by their country breakdown)
    let totalETFBalance = 0;
    stocks.forEach((stock) => {
      const sector = stock.sector || '';
      if (sector.startsWith('ETF')) {
        const shares = parseFloat(stock.shares) || 0;
        let priceStr = String(stock.share_price || '0')
          .replace(/[€$\s]/g, '')
          .replace(',', '.');
        const price = parseFloat(priceStr) || 0;
        totalETFBalance += shares * price;
      }
    });

    // Total balance (excluding Cash and Crypto)
    const totalBalance = tradevilleBalance + nonRomanianStocksBalance + totalETFBalance;

    // Calculate real Romania percentage (only from Tradeville - Romanian stocks)
    const realRomaniaPercent = (tradevilleBalance / totalBalance) * 100;

    // Calculate US percentage (non-Romanian stocks + weighted contribution from ETFs)
    // From API data, we already have the weighted ETF contribution to each country
    // We just need to adjust based on real balances

    const romaniaIndex = countriesData.findIndex((c) => c.name === 'Romania');

    if (romaniaIndex !== -1) {
      const oldRomaniaPercent = countriesData[romaniaIndex].percentage;

      // Calculate the scaling factor based on how much the actual total differs from weight-based total
      // The API uses weights which sum to 145.46%, but real total should be 100%
      const apiRomaniaContribution = oldRomaniaPercent; // This is based on weights

      // Set Romania to real calculated value
      countriesData[romaniaIndex].percentage = parseFloat(realRomaniaPercent.toFixed(2));

      // Recalculate all other countries proportionally to sum to 100%
      const otherCountriesSum = countriesData
        .filter((c, i) => i !== romaniaIndex)
        .reduce((sum, c) => sum + c.percentage, 0);

      const scaleFactor = (100 - realRomaniaPercent) / otherCountriesSum;

      countriesData.forEach((country, i) => {
        if (i !== romaniaIndex) {
          country.percentage = parseFloat((country.percentage * scaleFactor).toFixed(2));
        }
      });

      console.log(
        `🔧 Adjusted Romania: ${oldRomaniaPercent.toFixed(2)}% → ${realRomaniaPercent.toFixed(2)}%`
      );
      console.log(`   Tradeville: €${tradevilleBalance.toFixed(2)}`);
      console.log(`   Non-RO stocks: €${nonRomanianStocksBalance.toFixed(2)}`);
      console.log(`   ETFs: €${totalETFBalance.toFixed(2)}`);
      console.log(`   Total: €${totalBalance.toFixed(2)}`);
    }

    return countriesData;
  } catch (error) {
    console.error('Error adjusting countries data:', error);
    return countriesData; // Return original if error
  }
}

function setupAllocationToggle() {
  const sectorsBtn = document.getElementById('toggle-sectors-btn');
  const countriesBtn = document.getElementById('toggle-countries-btn');

  if (!sectorsBtn || !countriesBtn) {
    console.error('Toggle buttons not found!');
    return;
  }
  const switchContainer =
    sectorsBtn.parentElement?.parentElement?.querySelector('.allocation-switch');
  function applyActive(view) {
    if (!switchContainer) return;
    if (view === 'sectors') {
      switchContainer.classList.add('sectors-active');
      switchContainer.classList.remove('countries-active');
      sectorsBtn.classList.add('active');
      countriesBtn.classList.remove('active');
    } else {
      switchContainer.classList.add('countries-active');
      switchContainer.classList.remove('sectors-active');
      countriesBtn.classList.add('active');
      sectorsBtn.classList.remove('active');
    }
  }
  sectorsBtn.addEventListener('click', () => {
    if (currentView !== 'sectors') {
      currentView = 'sectors';
      applyActive('sectors');
      loadAllocationData('sectors');
      sectorsBtn.setAttribute('aria-selected', 'true');
      countriesBtn.setAttribute('aria-selected', 'false');
      sectorsBtn.setAttribute('tabindex', '0');
      countriesBtn.setAttribute('tabindex', '-1');
    }
  });
  countriesBtn.addEventListener('click', () => {
    if (currentView !== 'countries') {
      currentView = 'countries';
      applyActive('countries');
      loadAllocationData('countries');
      countriesBtn.setAttribute('aria-selected', 'true');
      sectorsBtn.setAttribute('aria-selected', 'false');
      countriesBtn.setAttribute('tabindex', '0');
      sectorsBtn.setAttribute('tabindex', '-1');
    }
  });
  // Keyboard accessibility
  [sectorsBtn, countriesBtn].forEach((btn) => {
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        if (document.activeElement === sectorsBtn) {
          countriesBtn.click();
          countriesBtn.focus();
        } else {
          sectorsBtn.click();
          sectorsBtn.focus();
        }
      }
    });
  });
  applyActive(currentView);
}
