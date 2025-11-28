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
    'Utilities'
];

// Navigation functionality
const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('.section');

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Remove active class from all links
        navLinks.forEach(l => l.classList.remove('active'));
        
        // Add active class to clicked link
        link.classList.add('active');
        
        // Hide all sections
        sections.forEach(s => s.classList.remove('active'));
        
        // Show selected section
        const section = link.getAttribute('data-section');
        const targetSection = document.getElementById(`${section}-section`);
        if (targetSection) {
            targetSection.classList.add('active');
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
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        setTimeout(handleFloatingButtonVisibility, 100);
    });
});

// Load data from database on page load
async function loadTableData() {
    try {
        const response = await fetch(API_URL);
        const stocks = await response.json();
        stocks.forEach(stock => {
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
    
    const rows = stocksTbody.querySelectorAll('tr');
    
    for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length === 0) continue;
        
        const symbol = cells[1].textContent.trim();
        // Hardcode PREM.L share price to stabilize UI
        if (symbol.toUpperCase() === 'PREM' || symbol.toUpperCase() === 'PREM.L') {
            const shares = parseFloat(cells[5].textContent) || 0;
            const hardEUR = 0.000575;
            cells[6].textContent = `€${hardEUR.toFixed(6)}`;
            const allocation = shares * hardEUR;
            cells[4].textContent = `€${allocation.toFixed(2)}`;
            updateWeightForRow(row);
            // Persist the displayed price to DB
            const stockId = row.dataset.id;
            if (stockId) {
                await fetch(`${API_URL}/${stockId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ share_price: cells[6].textContent })
                });
            }
            continue; // Skip network fetch for PREM
        }
        const broker = cells[7].textContent.trim();
        const symbolLower = symbol.toLowerCase();
        const isManualPrice = symbolLower.includes('bank deposit') || broker === 'Bank Deposit' || broker === 'Cash';
        
        // Only fetch price for non-manual stocks
        if (!isManualPrice && symbol && symbol !== '-') {
            try {
                const priceData = await fetchStockPrice(symbol);
                if (priceData) {
                    // For PREM skip unvalidated interim prices
                    if ((symbol.toUpperCase() === 'PREM' || symbol.toUpperCase() === 'PREM.L') && !priceData.validated) {
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
                        cells[6].textContent = `£${gbpFromPence.toFixed(decimalsGBP)}`;
                    } else if (Number.isFinite(priceGBP) && priceGBP > 0 && !isCrypto) {
                        const decimalsGBP = priceGBP < 0.1 ? 6 : 4;
                        cells[6].textContent = `£${priceGBP.toFixed(decimalsGBP)}`;
                    } else if (Number.isFinite(priceEUR) && priceEUR > 0) {
                        // For US stocks: display USD, keep allocation in EUR
                        const originalCurrency = (priceData.originalCurrency || '').toUpperCase();
                        const brokerText = (broker || '').toUpperCase();
                        const brokerHintsUSD = brokerText.includes('XTB-USD') || brokerText.includes('TRADING212') || brokerText.includes('XTB USD');
                        const isUSStock = (!isCrypto) && (originalCurrency === 'USD' || brokerHintsUSD);
                        if (isUSStock) {
                            try {
                                const rates = await fetch(`${API_BASE}/api/exchange-rates`).then(r => r.json());
                                const usdPrice = priceEUR * (rates.USD || 1.16);
                                const decimalsUSD = usdPrice < 0.1 ? 6 : 2;
                                cells[6].textContent = `$${usdPrice.toFixed(decimalsUSD)}`;
                            } catch {
                                const decimalsEUR = priceEUR < 0.1 ? 6 : 2;
                                cells[6].textContent = `€${priceEUR.toFixed(decimalsEUR)}`;
                            }
                        } else {
                            const decimalsEUR = (broker === 'Crypto' || priceEUR < 0.1) ? 6 : 2;
                            const currency = isCrypto ? '$' : '€';
                            cells[6].textContent = `${currency}${priceEUR.toFixed(decimalsEUR)}`;
                        }
                    } else {
                        console.warn(`Skipping UI price update for ${symbol}: invalid/zero price`, priceData);
                    }
                    
                    // Recalculate Allocation (always in EUR)
                    const shares = parseFloat(cells[5].textContent) || 0;
                    let allocPriceEUR = priceEUR;
                    
                    // Convert USD to EUR for crypto
                    if (isCrypto && Number.isFinite(priceEUR)) {
                        const exchangeRates = await fetch(`${API_BASE}/api/exchange-rates`).then(r => r.json()).catch(() => ({ USD: 1.16 }));
                        allocPriceEUR = priceEUR / exchangeRates.USD;
                    }
                    // If EUR missing but GBP available, convert GBP→EUR for allocation
                    if ((!Number.isFinite(allocPriceEUR) || allocPriceEUR <= 0) && Number.isFinite(priceGBP) && priceGBP > 0) {
                        const rates = await fetch(`${API_BASE}/api/exchange-rates`).then(r => r.json()).catch(() => ({ GBP: 0.86 }));
                        allocPriceEUR = priceGBP / (rates.GBP || 0.86);
                    }
                    
                    if (Number.isFinite(allocPriceEUR) && allocPriceEUR > 0 && Number.isFinite(shares) && shares > 0) {
                        let allocation = shares * allocPriceEUR;
                        // Special-case PREM: compute using displayed GBP, convert to EUR (no extra divide)
                        if (symbol.toUpperCase() === 'PREM' || symbol.toUpperCase() === 'PREM.L') {
                            const display = (cells[6].textContent || '').trim();
                            const rateResp = await fetch(`${API_BASE}/api/exchange-rates`).then(r => r.json()).catch(() => ({ GBP: 0.86 }));
                            const gbpRate = rateResp.GBP || 0.86;
                            let displayValue = parseFloat(display.replace(/[^0-9.\-]/g, '')) || 0;
                            // If display is in pounds (prefixed with £), use directly; else fall back to computed EUR path
                            if (display.startsWith('£') && displayValue > 0) {
                                const amountGBP = shares * displayValue;
                                const amountEUR = amountGBP / gbpRate;
                                allocation = amountEUR;
                            }
                        }
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
                            body: JSON.stringify({ share_price: displayText })
                        });
                    }
                }
            } catch (error) {
                console.error(`Error refreshing price for ${symbol}:`, error);
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
        rows.forEach(r => {
            const symCell = r.querySelector('td[data-field="symbol"]');
            if (symCell) symbolToRow[symCell.textContent.trim()] = r;
        });
        quotes.forEach(q => {
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
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
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
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            if (response.status === 409) {
                alert(`⚠️ WARNING!\n\nStock with symbol "${data.symbol}" already exists in your portfolio!\n\nPlease use a different symbol.`);
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
            method: 'DELETE'
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
        risk: '-'
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
        const headers = ['Symbol', 'Weight', 'Company', 'Allocation', 'Shares', 'Share Price', 'Broker', 'Sector', 'Risk'];
        
        // Convert stocks data to CSV rows
        const csvRows = [
            headers.join(','), // Header row
            ...stocks.map(stock => [
                stock.symbol || '',
                stock.weight || '',
                `"${(stock.company || '').replace(/"/g, '""')}"`, // Escape quotes in company names
                stock.allocation || '',
                stock.shares || '',
                stock.share_price || '',
                stock.broker || '',
                stock.sector || '',
                stock.risk || ''
            ].join(','))
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
            
            editableCells.forEach(cell => {
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
                sharePriceCell.textContent = priceValue ? `€${priceValue}` : '-';
            }
            
            // Fetch stock price based on symbol and broker
            const symbol = cells[1].textContent.trim();
            const broker = cells[7].textContent.trim();
            const symbolLower = symbol.toLowerCase();
            const isManualPrice = symbolLower.includes('bank deposit') || broker === 'Bank Deposit' || broker === 'Cash';
            
            // Special handling for Bank Deposit and Cash - use manual price, calculate allocation
            if (isManualPrice) {
                // Get manually entered Share_Price (in RON for Bank Deposits)
                const priceText = cells[6].textContent.replace('€', '').trim();
                let manualPrice = parseFloat(priceText);
                
                if (!isNaN(manualPrice) && manualPrice > 0) {
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
                }
                
                // Update weight
                updateWeightForRow(currentEditingRow);
            } else if (symbol && symbol !== '-') {
                // Hardcode PREM in edit-save path as well
                if (symbol.toUpperCase() === 'PREM' || symbol.toUpperCase() === 'PREM.L') {
                    const hardEUR = 0.000575;
                    cells[6].textContent = `€${hardEUR.toFixed(6)}`;
                    const shares = parseFloat(cells[5].textContent) || 0;
                    const allocation = shares * hardEUR;
                    cells[4].textContent = `€${allocation.toFixed(2)}`;
                    updateWeightForRow(currentEditingRow);
                    return; // Skip fetch
                }
                const priceObj = await fetchStockPrice(symbol);
                if (priceObj) {
                    if ((symbol.toUpperCase() === 'PREM' || symbol.toUpperCase() === 'PREM.L') && !priceObj.validated) {
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
                            cells[6].textContent = `£${gbpFromPence.toFixed(decimalsGBP)}`;
                        } else if (Number.isFinite(priceGBP) && priceGBP > 0) {
                            const decimalsGBP = priceGBP < 0.1 ? 6 : 4;
                            cells[6].textContent = `£${priceGBP.toFixed(decimalsGBP)}`;
                        } else if (Number.isFinite(priceEUR) && priceEUR > 0) {
                            // For US stocks: display USD, keep allocation in EUR
                            const originalCurrency = (priceObj.originalCurrency || '').toUpperCase();
                            const brokerText = (broker || '').toUpperCase();
                            const brokerHintsUSD = brokerText.includes('XTB-USD') || brokerText.includes('TRADING212') || brokerText.includes('XTB USD');
                            const isUSStock = (originalCurrency === 'USD' || brokerHintsUSD) && !(broker === 'Crypto');
                            if (isUSStock) {
                                try {
                                    const rates = await fetch(`${API_BASE}/api/exchange-rates`).then(r => r.json());
                                    const usdPrice = priceEUR * (rates.USD || 1.16);
                                    const decimalsUSD = usdPrice < 0.1 ? 6 : 2;
                                    cells[6].textContent = `$${usdPrice.toFixed(decimalsUSD)}`;
                                } catch {
                                    const decimals = (broker === 'Crypto' || priceEUR < 0.1) ? 6 : 2;
                                    cells[6].textContent = `€${priceEUR.toFixed(decimals)}`;
                                }
                            } else {
                                const decimals = (broker === 'Crypto' || priceEUR < 0.1) ? 6 : 2;
                                cells[6].textContent = `€${priceEUR.toFixed(decimals)}`;
                            }
                        } else {
                            console.warn(`Skipping UI price update for ${symbol}: invalid/zero`, priceObj);
                        }
                        // Allocation uses EUR (fallback convert GBP→EUR if needed)
                        let allocEur = priceEUR;
                        if ((!Number.isFinite(allocEur) || allocEur <= 0) && Number.isFinite(priceGBP) && priceGBP > 0) {
                            try {
                                const rates = await fetch(`${API_BASE}/api/exchange-rates`).then(r => r.json());
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
                                    const rateResp = await fetch(`${API_BASE}/api/exchange-rates`).then(r => r.json());
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
                const getField = (field) => currentEditingRow.querySelector(`td[data-field="${field}"]`)?.textContent.trim() || '-';
                const data = {
                    symbol: getField('symbol'),
                    weight: getField('weight'),
                    company: getField('company'),
                    allocation: getField('allocation'),
                    shares: getField('shares'),
                    share_price: getField('share_price'),
                    broker: getField('broker'),
                    sector: getField('sector'),
                    risk: getField('risk')
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
            
            if (symbolValue === 'Bank Deposit' && allocationCell && !allocationCell.classList.contains('editable-cell')) {
                allocationCell.classList.add('editable-cell');
            }
            
            const editableCells = row.querySelectorAll('.editable-cell');
            
            editableCells.forEach(cell => {
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
                    dropdown.style.cssText = 'position: absolute; top: 100%; left: 0; right: 0; background: #2a2a2a; border: 1px solid #444; max-height: 200px; overflow-y: auto; z-index: 1000; display: none;';
                    
                    const updateDropdown = (filter = '') => {
                        const filtered = AVAILABLE_SECTORS.filter(s => s.toLowerCase().includes(filter.toLowerCase()));
                        dropdown.innerHTML = filtered.map(s => 
                            `<div style="padding: 8px; cursor: pointer; color: white;" data-value="${s}">${s}</div>`
                        ).join('');
                        
                        dropdown.querySelectorAll('div').forEach(opt => {
                            opt.addEventListener('mouseenter', () => opt.style.background = '#3a3a3a');
                            opt.addEventListener('mouseleave', () => opt.style.background = 'transparent');
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
                        setTimeout(() => dropdown.style.display = 'none', 200);
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
            const sharePriceCell = row.querySelector('[data-field="share_price"]');
            
            const updateSharePriceField = () => {
                const symbolValue = symbolInput?.value.trim().toLowerCase() || '';
                const brokerValue = brokerSelect?.value || '';
                const isManualPrice = symbolValue.includes('bank deposit') || brokerValue === 'Bank Deposit' || brokerValue === 'Cash';
                
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
            fetch(`${API_BASE}/api/exchange-rates`).then(r => r.json()).catch(() => ({ USD: 1.16, RON: 4.95 }))
        ]);
        const stocks = await stocksResponse.json();
        let total = 0;
        stocks.forEach(stock => {
            const shares = parseFloat(stock.shares) || 0;
            let priceStr = String(stock.share_price || '0').replace(/[$€\s]/g, '').replace(',', '.');
            let price = parseFloat(priceStr) || 0;
            const broker = stock.broker || '';
            const symbol = (stock.symbol || '').toLowerCase();
            // Crypto prices are USD -> convert to EUR
            if (broker === 'Crypto' || String(stock.share_price).includes('$')) {
                price = price / (rates.USD || 1);
            }
            // Bank Deposit may be entered in EUR already; if in RON, convert (heuristic: symbol contains 'bank deposit' and price was large)
            if (broker === 'Bank Deposit' && rates.RON) {
                // If original string had no currency and seems RON (fallback heuristic), keep as-is; conversion handled when editing
            }
            total += shares * price;
        });
        return total;
    } catch (e) {
        console.error('Error computing unified EUR balance:', e);
        return null;
    }
}

// Calculate and update total balance using unified computation
async function updateTotalBalance() {
    const unifiedTotal = await computeUnifiedPortfolioBalanceEUR();
    const balanceElement = document.getElementById('total-balance');
    if (balanceElement && unifiedTotal != null) {
        balanceElement.textContent = unifiedTotal.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        // Update profit after balance changes
        updateProfit();
        // Update all weights after balance changes (weights still based on table allocations)
        updateAllWeights(unifiedTotal);
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
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5) {
            const allocationText = cells[4].textContent.replace('€', '').replace('$', '').replace(',', '');
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

// ========== TABLE SORTING ==========
let currentSortColumn = null;
let currentSortDirection = 'asc';

function sortTable(column) {
    const rows = Array.from(stocksTbody.querySelectorAll('tr'));
    
    // Toggle direction if clicking same column
    if (currentSortColumn === column) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortDirection = 'asc';
    }
    
    // Remove all sorted classes
    document.querySelectorAll('.stocks-table th').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
    });
    
    // Add sorted class to current column
    const header = document.querySelector(`.stocks-table th[data-column="${column}"]`);
    if (header) {
        header.classList.add(currentSortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
    }
    
    // Sort rows
    rows.sort((a, b) => {
        let aValue, bValue;
        
        const getText = (row, field) => row.querySelector(`td[data-field="${field}"]`)?.textContent.trim() || '';
        if (column === 'weight') {
            aValue = parseFloat(getText(a, 'weight').replace('%', '')) || 0;
            bValue = parseFloat(getText(b, 'weight').replace('%', '')) || 0;
        } else if (column === 'allocation') {
            aValue = parseFloat(getText(a, 'allocation').replace(/[^0-9.-]/g, '')) || 0;
            bValue = parseFloat(getText(b, 'allocation').replace(/[^0-9.-]/g, '')) || 0;
        } else if (column === 'price_change') {
            const aText = getText(a, 'price_change');
            const bText = getText(b, 'price_change');
            const aNum = parseFloat(aText.replace('%', ''));
            const bNum = parseFloat(bText.replace('%', ''));
            aValue = isNaN(aNum) ? -Infinity : aNum;
            bValue = isNaN(bNum) ? -Infinity : bNum;
        } else if (column === 'broker') {
            aValue = getText(a, 'broker');
            bValue = getText(b, 'broker');
            
            // Alphabetical comparison
            if (currentSortDirection === 'asc') {
                return aValue.localeCompare(bValue);
            } else {
                return bValue.localeCompare(aValue);
            }
        } else if (column === 'sector') {
            aValue = getText(a, 'sector');
            bValue = getText(b, 'sector');
            
            // Alphabetical comparison
            if (currentSortDirection === 'asc') {
                return aValue.localeCompare(bValue);
            } else {
                return bValue.localeCompare(aValue);
            }
        } else if (column === 'risk') {
            const aRisk = getText(a, 'risk');
            const bRisk = getText(b, 'risk');
            
            // Map risk text to numeric values - default to 5 for unknown
            aValue = 5;
            bValue = 5;
            
            if (aRisk.includes('🟩') || aRisk.includes('Very Safe')) aValue = 1;
            else if (aRisk.includes('🟦') || aRisk.includes('Safe')) aValue = 2;
            else if (aRisk.includes('🟨') || aRisk.includes('Medium')) aValue = 3;
            else if (aRisk.includes('🟥') || aRisk.includes('High Risk')) aValue = 4;
            
            if (bRisk.includes('🟩') || bRisk.includes('Very Safe')) bValue = 1;
            else if (bRisk.includes('🟦') || bRisk.includes('Safe')) bValue = 2;
            else if (bRisk.includes('🟨') || bRisk.includes('Medium')) bValue = 3;
            else if (bRisk.includes('🟥') || bRisk.includes('High Risk')) bValue = 4;
        }
        
        if (currentSortDirection === 'asc') {
            return aValue - bValue;
        } else {
            return bValue - aValue;
        }
    });
    
    // Reappend sorted rows and update numbers
    rows.forEach(row => stocksTbody.appendChild(row));
    updateStockNumbers();
}

// Add click listeners to sortable headers
function initializeSortListeners() {
    document.querySelectorAll('.stocks-table th.sortable').forEach(header => {
        header.addEventListener('click', (e) => {
            // Don't sort if clicking info icon or its svg children
            const target = e.target;
            const isInfoIcon = target.classList.contains('info-icon') || 
                              target.closest('.info-icon') || 
                              target.id === 'risk-info' ||
                              target.closest('#risk-info');
            
            if (isInfoIcon) {
                console.log('Clicked info icon, not sorting');
                return;
            }
            
            const column = header.dataset.column;
            console.log('Sorting by column:', column);
            if (column) {
                sortTable(column);
            }
        });
    });
}

// Initialize sort listeners after DOM is ready
setTimeout(() => {
    initializeSortListeners();
    console.log('Sort listeners initialized');
}, 100);

// (removed) Market status badge logic reverted

// ========== PIE CHART ==========
let balancePieChart = null;

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
        deposits.forEach(deposit => {
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
            body: JSON.stringify(data)
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
            body: JSON.stringify(data)
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
            method: 'DELETE'
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
        <td class="editable-cell" data-field="amount">${data?.amount || '-'}</td>
        <td class="editable-cell" data-field="account">${data?.account || '-'}</td>
        <td class="editable-cell" data-field="month">${data?.month || '-'}</td>
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
            editableCells.forEach(cell => {
                const currentValue = cell.textContent;
                const fieldName = cell.dataset.field;
                
                if (fieldName === 'month') {
                    const select = document.createElement('select');
                    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                                  'July', 'August', 'September', 'October', 'November', 'December'];
                    select.innerHTML = '<option value="">Select Month</option>' + 
                        months.map(m => `<option value="${m}" ${currentValue === m ? 'selected' : ''}>${m}</option>`).join('');
                    cell.textContent = '';
                    cell.appendChild(select);
                } else if (fieldName === 'account') {
                    const select = document.createElement('select');
                    const accounts = ['Tradeville', 'XTB-EURO', 'XTB-USD', 'Trading212', 'Bank Deposit', 'Crypto'];
                    select.innerHTML = '<option value="">Select Account</option>' + 
                        accounts.map(a => `<option value="${a}" ${currentValue === a ? 'selected' : ''}>${a}</option>`).join('');
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
                month: ''
            };
            
            editableCells.forEach(cell => {
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
                updateTotalDeposits();
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
    
    rows.forEach(row => {
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
    
    // Calculate and update profit (Balance - Total Deposits)
    updateProfit();
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
        deposits.forEach(deposit => {
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
        
        // Update UI - Money invested section
        document.getElementById('xtb-eur-value').textContent = xtbEur.toFixed(2) + ' €';
        document.getElementById('tradeville-value').textContent = tradeville.toFixed(2) + ' €';
        document.getElementById('t212-xtb-usd-value').textContent = t212XtbUsd.toFixed(2) + ' €';
        document.getElementById('crypto-value').textContent = crypto.toFixed(2) + ' €';
        document.getElementById('bank-deposits-value').textContent = bankDeposits.toFixed(2) + ' €';
        
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
            fetch(`${API_BASE}/api/exchange-rates`).then(r => r.json()).catch(() => ({ USD: 1.16 }))
        ]);
        
        const stocks = await stocksResponse.json();
        const deposits = await depositsResponse.json();
        
        // Calculate XTB EUR balance (specific symbols)
        let xtbEurBalance = 0;
        const xtbEurSymbols = ['SXR8.DE', 'VGWD.DE', 'VDIV.DE', 'VGWL.DE'];
        
        stocks.forEach(stock => {
            if (stock.symbol && xtbEurSymbols.includes(stock.symbol)) {
                const shares = parseFloat(stock.shares) || 0;
                let priceStr = String(stock.share_price || '0').replace(/[€$\s]/g, '').replace(',', '.');
                const price = parseFloat(priceStr) || 0;
                xtbEurBalance += shares * price;
            }
        });
        
        // Calculate T212 + XTB USD balance (all stocks from these brokers)
        let t212XtbUsdBalance = 0;
        
        stocks.forEach(stock => {
            const broker = stock.broker || '';
            if (broker === 'Trading212' || broker === 'XTB-USD') {
                const shares = parseFloat(stock.shares) || 0;
                let priceStr = String(stock.share_price || '0').replace(/[€$\s]/g, '').replace(',', '.');
                let price = parseFloat(priceStr) || 0;
                
                // Convert USD to EUR only if price has $ symbol (exclude EUR-based ETFs)
                if (String(stock.share_price).includes('$')) {
                    price = price / exchangeRates.USD;
                }
                // EUR-based ETFs (like ESP0.DE, JEDI.DE, ASWC.DE, NUKL.DE, DFNS.UK) already in EUR, no conversion needed
                
                t212XtbUsdBalance += shares * price;
            }
        });
        
        // Calculate Tradeville balance (all stocks with broker 'Tradeville' + Cash Tradeville)
        let tradevilleBalance = 0;
        
        stocks.forEach(stock => {
            if (stock.broker === 'Tradeville' || stock.symbol === 'Cash Tradeville') {
                const shares = parseFloat(stock.shares) || 0;
                let priceStr = String(stock.share_price || '0').replace(/[€$\s]/g, '').replace(',', '.');
                const price = parseFloat(priceStr) || 0;
                tradevilleBalance += shares * price;
            }
        });
        
        // Calculate Crypto balance (prices in USD, need to convert to EUR)
        let cryptoBalance = 0;
        
        stocks.forEach(stock => {
            const broker = stock.broker || '';
            if (broker === 'Crypto') {
                const shares = parseFloat(stock.shares) || 0;
                // Clean price: remove $, €, spaces, and replace comma with dot
                let priceStr = String(stock.share_price || '0').replace(/[$€\s]/g, '').replace(',', '.');
                const priceUSD = parseFloat(priceStr) || 0;
                // Convert USD to EUR
                const priceEUR = priceUSD / exchangeRates.USD;
                cryptoBalance += shares * priceEUR;
            }
        });
        
        // Calculate Bank Deposit balance
        let bankDepositBalance = 0;
        stocks.forEach(stock => {
            const broker = stock.broker || '';
            if (broker === 'Bank Deposit') {
                const shares = parseFloat(stock.shares) || 0;
                // Clean price: remove €, spaces, and replace comma with dot
                let priceStr = String(stock.share_price || '0').replace(/[€\s]/g, '').replace(',', '.');
                const price = parseFloat(priceStr) || 0;
                bankDepositBalance += shares * price;
            }
        });
        
        // Calculate deposits for each broker
        let xtbEurDeposits = 0;
        let tradevilleDeposits = 0;
        let t212XtbUsdDeposits = 0;
        let cryptoDeposits = 0;
        let bankDepositsDeposits = 0;
        
        deposits.forEach(deposit => {
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
        const tradevilleReturn = tradevilleDeposits > 0 ? (tradevilleProfit / tradevilleDeposits) * 100 : 0;
        
        const t212XtbUsdProfit = t212XtbUsdBalance - t212XtbUsdDeposits;
        const t212XtbUsdReturn = t212XtbUsdDeposits > 0 ? (t212XtbUsdProfit / t212XtbUsdDeposits) * 100 : 0;
        
        const cryptoProfit = cryptoBalance - cryptoDeposits;
        const cryptoReturn = cryptoDeposits > 0 ? (cryptoProfit / cryptoDeposits) * 100 : 0;
        
        const bankDepositsProfit = bankDepositBalance - bankDepositsDeposits;
        const bankDepositsReturn = bankDepositsDeposits > 0 ? (bankDepositsProfit / bankDepositsDeposits) * 100 : 0;
        
        // Update UI - Balance section (values are EUR)
        const xtbEurBalanceElement = document.getElementById('xtb-eur-balance-value');
        if (xtbEurBalanceElement) {
            xtbEurBalanceElement.textContent = xtbEurBalance.toFixed(2) + ' €';
        }
        
        const tradevilleBalanceElement = document.getElementById('tradeville-balance-value');
        if (tradevilleBalanceElement) {
            tradevilleBalanceElement.textContent = tradevilleBalance.toFixed(2) + ' €';
        }
        
        const t212XtbUsdBalanceElement = document.getElementById('t212-xtb-usd-balance-value');
        if (t212XtbUsdBalanceElement) {
            t212XtbUsdBalanceElement.textContent = t212XtbUsdBalance.toFixed(2) + ' €';
        }
        
        const cryptoBalanceElement = document.getElementById('crypto-balance-value');
        if (cryptoBalanceElement) {
            cryptoBalanceElement.textContent = cryptoBalance.toFixed(2) + ' €';
        }
        
        const bankDepositBalanceElement = document.getElementById('bank-deposit-balance-value');
        if (bankDepositBalanceElement) {
            bankDepositBalanceElement.textContent = bankDepositBalance.toFixed(2) + ' €';
        }
        
        // Recalculate XTB EUR profit from UI values
        const xtbEurBalanceFromUI = parseFloat(document.getElementById('xtb-eur-balance-value')?.textContent.replace(/[^0-9.-]/g, '')) || 0;
        const xtbEurDepositsFromUI = parseFloat(document.getElementById('xtb-eur-value')?.textContent.replace(/[^0-9.-]/g, '')) || 0;
        const xtbEurProfitFromUI = xtbEurBalanceFromUI - xtbEurDepositsFromUI;
        const xtbEurReturnFromUI = xtbEurDepositsFromUI > 0 ? (xtbEurProfitFromUI / xtbEurDepositsFromUI) * 100 : 0;
        
        // Update UI - Profit section
        // Helper function to update profit and return for a broker
        const updateBrokerProfit = (profitId, returnId, profit, returnPercent, brokerName) => {
            const profitElement = document.getElementById(profitId);
            const returnElement = document.getElementById(returnId);
            
            if (profitElement) {
                // Set profit value
                profitElement.textContent = profit.toFixed(2) + ' €';
                
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
                returnElement.textContent = `  ${returnSign}${returnPercent.toFixed(2)}%`;
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
        updateBrokerProfit('xtb-eur-profit-value', 'xtb-eur-return-percentage', xtbEurProfitFromUI, xtbEurReturnFromUI, 'XTB EUR');
        updateBrokerProfit('tradeville-profit-value', 'tradeville-return-percentage', tradevilleProfit, tradevilleReturn, 'Tradeville');
        updateBrokerProfit('t212-xtb-usd-profit-value', 't212-xtb-usd-return-percentage', t212XtbUsdProfit, t212XtbUsdReturn, 'T212 + XTB USD');
        updateBrokerProfit('crypto-profit-value', 'crypto-return-percentage', cryptoProfit, cryptoReturn, 'Crypto');
        updateBrokerProfit('bank-deposits-profit-value', 'bank-deposits-return-percentage', bankDepositsProfit, bankDepositsReturn, 'Bank Deposits');
        
        // Ensure top Balance equals sum of breakdowns
        const unifiedTop = xtbEurBalance + tradevilleBalance + t212XtbUsdBalance + cryptoBalance + bankDepositBalance;
        const balanceElement = document.getElementById('total-balance');
        if (balanceElement) {
            balanceElement.textContent = unifiedTop.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        updateProfit();
        updateAllWeights(unifiedTop);
        
    } catch (error) {
        console.error('Error updating balance breakdown:', error);
    }
}

function updateProfit() {
    const balanceElement = document.getElementById('total-balance');
    const depositsElement = document.getElementById('total-deposits-amount');
    const profitElement = document.getElementById('total-profit');
    
    if (balanceElement && depositsElement && profitElement) {
        const balance = parseFloat(balanceElement.textContent.replace(/[^0-9.-]/g, '')) || 0;
        const deposits = parseFloat(depositsElement.textContent.replace(/[^0-9.-]/g, '')) || 0;
        const profit = balance - deposits;
        
        profitElement.textContent = profit.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
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
            month: '-'
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
        '🟥 High Risk': 0
    };
    
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length > 0) {
            const weightText = cells[2].textContent.trim();
            const riskText = cells[9].textContent.trim();
            const weight = parseFloat(weightText.replace('%', '')) || 0;
            // Map risk to categories
            if (riskText.includes('Medium-Safe') || riskText.includes('🟨') || riskText.includes('Medium')) {
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
    const totalFromTable = Object.values(riskData).reduce((s,v)=>s+v,0);
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
            stocks.forEach(st => {
                const shares = parseFloat(st.shares) || 0;
                let priceStr = String(st.share_price || '0').replace(/[$€\s]/g, '').replace(',', '.');
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
                Object.keys(riskData).forEach(k => {
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
    const translucentColors = colors.map(color => {
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
        gradient.addColorStop(0, `rgba(${Math.min(r + 60, 255)}, ${Math.min(g + 60, 255)}, ${Math.min(b + 60, 255)}, 0.95)`);
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
                'Safe': { x: chartArea.right - 5, y: chartArea.bottom + 20, align: 'right' }
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
        }
    };
    
    const pluginsArr = [cornerLegendsPlugin];
    if (typeof ChartDataLabels !== 'undefined') {
        pluginsArr.unshift(ChartDataLabels);
    }

    balancePieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: translucentColors,
                borderColor: 'rgba(255, 255, 255, 0.15)',
                borderWidth: 3,
                hoverOffset: 20,
                hoverBorderColor: 'rgba(255, 255, 255, 0.4)',
                hoverBorderWidth: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '60%',
            plugins: {
                legend: {
                    display: false
                },
                datalabels: typeof ChartDataLabels !== 'undefined' ? {
                    color: 'white',
                    anchor: 'center',
                    align: 'center',
                    clamp: true,
                    font: {
                        weight: '700',
                        size: 12
                    },
                    formatter: (value, ctx) => {
                        // value is already percentage string; ensure numeric
                        const v = parseFloat(value);
                        if (!isFinite(v) || v <= 0) return '';
                        return `${v.toFixed(2)}%`;
                    }
                } : undefined,
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
                        title: function() {
                            return '';
                        },
                        label: function(context) {
                            return context.parsed + '%';
                        }
                    }
                },
                cornerLegends: {}
            },
            animation: {
                animateRotate: true,
                animateScale: true,
                duration: 1000,
                easing: 'easeInOutQuart'
            },
            layout: {
                padding: 20
            }
        },
        plugins: pluginsArr
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
                console.log(`📸 Skipping snapshot (only ${Math.round(timeSinceLastSnapshot/1000)}s since last one in DB)`);
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
        
        const response = await fetch('/api/performance-snapshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                portfolio_balance: normalizedBalance,
                total_deposits: totalDeposits
            })
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
    loadTableData().then(async () => {
        // CRITICAL: Fetch fresh prices BEFORE calculating balance
        console.log('🚀 Fetching fresh prices before first display...');
        await refreshStockPrices();
        console.log('✅ Fresh prices loaded');
        
        updateTotalBalance();
        updateBalancePieChart();
        updatePerformanceChart('1d');
        
        // Start auto-refresh and snapshot saving after initial load
        startAutoRefresh();
        startSnapshotSaving();
        startPriceChangeUpdates();
    });
    
    loadDepositsData().then(async () => {
        updateTotalDeposits();
        updateDepositsBreakdown();
        await updateBalanceBreakdown();
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
    
    // Load dividends when dividends section is opened
    document.querySelectorAll('.nav-link').forEach(link => {
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
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const range = btn.getAttribute('data-range');
            updatePerformanceChart(range);
        });
    });

    // Legend checkbox toggles for chart datasets
    document.querySelectorAll('.legend-toggle').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const datasetIndex = parseInt(this.dataset.dataset);
            if (window.performanceChart && window.performanceChart.data.datasets[datasetIndex]) {
                window.performanceChart.data.datasets[datasetIndex].hidden = !this.checked;
                window.performanceChart.update();
            }
        });
    });

    // Admin section event listeners
    const refreshSnapshotsBtn = document.getElementById('refresh-snapshots-btn');
    const exportSnapshotsBtn = document.getElementById('export-snapshots-btn');
    const resetBaselineBtn = document.getElementById('reset-baseline-btn');
    const deleteOldSnapshotsBtn = document.getElementById('delete-old-snapshots-btn');
    const deleteAllSnapshotsBtn = document.getElementById('delete-all-snapshots-btn');

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

    // Load snapshots when admin section is opened
    document.querySelectorAll('.nav-link').forEach(link => {
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
                }, 100);
            }
        });
    });
    
    // Also try to initialize immediately if admin section is already visible
    if (document.querySelector('.section.active')?.id === 'admin-section') {
        console.log('Admin section already visible, initializing immediately');
        initDeleteRangeButton();
    }
});

// ========== DIVIDENDS SECTION ==========

const dividendsTbody = document.getElementById('dividends-table-body');
const addDividendBtn = document.getElementById('add-dividend-btn');
const floatingAddDividendBtn = document.getElementById('floating-add-dividend-btn');
const dividendsTable = document.getElementById('dividends-table');
let currentEditingDividendRow = null;

// Auto-save on click outside table
document.addEventListener('click', function(e) {
    if (!currentEditingDividendRow) return;
    
    // Ignore clicks on edit/save/cancel buttons to prevent immediate trigger
    if (e.target.closest('.edit-icon-btn') || 
        e.target.closest('.save-icon-btn') || 
        e.target.closest('.cancel-icon-btn')) {
        return;
    }
    
    // Check if click is outside the dividends table
    if (!dividendsTable.contains(e.target)) {
        const id = currentEditingDividendRow.dataset.id;
        if (id) {
            // Editing existing row - save it
            saveEditedDividend(parseInt(id));
        } else {
            // New row - save it
            saveDividend();
        }
    }
});

// Dividends Chart
let dividendsChart = null;

function createDividendsChart(dividends) {
    const ctx = document.getElementById('dividendsChart');
    if (!ctx) return;
    
    // Destroy existing chart if it exists
    if (dividendsChart) {
        dividendsChart.destroy();
    }
    
    // Prepare data - reverse for chronological order on chart
    const reversedDividends = [...dividends].reverse();
    const years = reversedDividends.map(d => d.year);
    const monthlyDividends = reversedDividends.map(d => (d.annual_dividend / 12).toFixed(2));
    
    // Create gradient with teal color
    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(100, 255, 218, 0.8)');
    gradient.addColorStop(1, 'rgba(100, 255, 218, 0.4)');
    
    dividendsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: years,
            datasets: [{
                label: 'Monthly Dividend (€)',
                data: monthlyDividends,
                backgroundColor: gradient,
                borderColor: 'rgba(100, 255, 218, 1)',
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false,
            }]
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
                        font: {
                            size: 14,
                            weight: 'bold'
                        },
                        padding: 20
                    }
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
                        label: function(context) {
                            return `€${context.parsed.y} per month`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: 'white',
                        font: {
                            size: 12,
                            weight: 'bold'
                        },
                        callback: function(value) {
                            return '€' + value;
                        }
                    }
                },
                x: {
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        color: 'white',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    }
                }
            }
        }
    });
}

// Load dividends from database
async function loadDividends() {
    try {
        const response = await fetch('/api/dividends');
        const dividends = await response.json();
        
        dividendsTbody.innerHTML = '';
        dividends.forEach((dividend, index) => {
            addDividendRow(dividend, index + 1);
        });
        
        // Update chart
        createDividendsChart(dividends);
    } catch (error) {
        console.error('Error loading dividends:', error);
    }
}

// Add dividend row to table (read-only mode)
function addDividendRow(dividend, rowNumber) {
    const row = document.createElement('tr');
    row.dataset.id = dividend.id;
    
    const monthlyDividend = (dividend.annual_dividend / 12).toFixed(2);
    
    row.innerHTML = `
        <td>${rowNumber}</td>
        <td class="year-cell">${dividend.year}</td>
        <td class="annual-dividend-cell">${dividend.annual_dividend} €</td>
        <td class="monthly-dividend">${monthlyDividend} €</td>
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

// Edit dividend row
window.editDividend = function(id) {
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
    annualDividendCell.addEventListener('input', function() {
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
}

// Update monthly dividend in real-time
function updateMonthlyDividend(e) {
    const row = e.target.closest('tr');
    let text = e.target.textContent.replace('€', '').trim();
    const annualValue = parseFloat(text) || 0;
    const monthlyCell = row.querySelector('.monthly-dividend');
    monthlyCell.textContent = (annualValue / 12).toFixed(2);
}

// Save edited dividend
window.saveEditedDividend = async function(id) {
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
                annual_dividend: annualDividend
            })
        });
        
        if (response.ok) {
            currentEditingDividendRow = null;
            await loadDividends();
        }
    } catch (error) {
        console.error('Error updating dividend:', error);
    }
}

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
        <td>${rowNumber}</td>
        <td>
            <select class="year-select">
                ${yearOptions}
            </select>
        </td>
        <td contenteditable="true" class="annual-dividend-input editable">0 €</td>
        <td class="monthly-dividend">0.00 €</td>
        <td>
            <button class="save-icon-btn" onclick="saveDividend()" title="Save">✓</button>
            <button class="delete-icon-btn" onclick="cancelDividendEdit()" title="Cancel">✕</button>
        </td>
    `;
    
    dividendsTbody.insertBefore(row, dividendsTbody.firstChild);
    
    // Add input event listener for real-time calculation
    const annualDividendInput = row.querySelector('.annual-dividend-input');
    annualDividendInput.addEventListener('input', updateMonthlyDividend);
    
    // Focus on annual dividend input
    annualDividendInput.focus();
}

// Save new dividend
window.saveDividend = async function() {
    if (!currentEditingDividendRow) return;
    
    const year = parseInt(currentEditingDividendRow.querySelector('.year-select').value);
    const annualText = currentEditingDividendRow.querySelector('.annual-dividend-input').textContent.replace('€', '').trim();
    const annualDividend = parseFloat(annualText) || 0;
    
    try {
        const response = await fetch('/api/dividends', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                year: year,
                annual_dividend: annualDividend
            })
        });
        
        if (response.ok) {
            currentEditingDividendRow = null;
            await loadDividends();
        }
    } catch (error) {
        console.error('Error saving dividend:', error);
    }
}

// Cancel dividend edit
window.cancelDividendEdit = function() {
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
}

// Update dividend in database
async function updateDividend(id) {
    const row = dividendsTbody.querySelector(`tr[data-id="${id}"]`);
    if (!row) return;
    
    const year = parseInt(row.querySelector('.year-select').value);
    const annualDividend = parseFloat(row.querySelector('[data-field="annual_dividend"]').textContent) || 0;
    
    try {
        const response = await fetch(`/api/dividends/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                year: year,
                annual_dividend: annualDividend
            })
        });
        
        if (response.ok) {
            console.log('Dividend updated successfully');
        }
    } catch (error) {
        console.error('Error updating dividend:', error);
    }
}

// Delete dividend
window.deleteDividend = async function(id) {
    if (!confirm('Are you sure you want to delete this dividend?')) return;
    
    try {
        const response = await fetch(`/api/dividends/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            await loadDividends();
        }
    } catch (error) {
        console.error('Error deleting dividend:', error);
    }
}

// Add new dividend button
if (addDividendBtn) {
    addDividendBtn.addEventListener('click', () => {
        addNewDividendRow();
    });
}

if (floatingAddDividendBtn) {
    floatingAddDividendBtn.addEventListener('click', () => {
        addNewDividendRow();
    });
}

// ========== PERFORMANCE CHART ==========
let performanceChart = null;

// Fetch and generate performance data from database snapshots (percentages already calculated)
async function generatePerformanceData(range) {
    try {
        console.log(`📊 Fetching performance snapshots for range: ${range}`);
        
        const response = await fetch(`/api/performance-snapshots?range=${range}`);
        const data = await response.json();
        const snapshots = data.snapshots || [];
        
        console.log(`Retrieved ${snapshots.length} snapshots from database`);
        
        if (snapshots.length === 0) {
            console.warn('⚠️ No snapshots available yet — using S&P 500 fallback');
            // Fallback: fetch S&P 500 historical and build percent series
            const hist = await fetch(`/api/historical/^GSPC?range=${range}`).then(r => r.json()).catch(() => null);
            if (hist && Array.isArray(hist.data) && hist.data.length > 1) {
                const base = hist.data[0].price;
                const labels = hist.data.map(p => {
                    const ts = new Date(p.timestamp);
                    if (range === '1h') return ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    if (range === '1d') return ts.toLocaleTimeString('en-US', { hour: '2-digit' });
                    if (range === '1w' || range === '1m') return ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    return ts.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                });
                const sp500Data = hist.data.map(p => ((p.price - base) / base) * 100).map(x => parseFloat(x.toFixed(2)));
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
        snapshots.forEach(snapshot => {
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
                label = timestamp.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            }
            labels.push(label);
            
            // Calculate percentage change relative to first snapshot in this range
            const currentBalance = parseFloat(snapshot.portfolio_balance || 0);
            const portfolioChange = firstPortfolioBalance > 0 ? ((currentBalance - firstPortfolioBalance) / firstPortfolioBalance) * 100 : 0;
            
            // For other metrics, calculate relative change from their first values
            const depositsRaw = parseFloat(snapshot.deposits_percent);
            const sp500Raw = parseFloat(snapshot.sp500_percent);
            const betRaw = parseFloat(snapshot.bet_percent);

            const depositsChange = (Number.isFinite(depositsRaw) ? depositsRaw : 0) - firstDepositsPercent;
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
                const hist = await fetch(`/api/historical/^GSPC?range=${range}`).then(r => r.json());
                if (hist && Array.isArray(hist.data) && hist.data.length > 1) {
                    const base = hist.data[0].price;
                    const histLabels = hist.data.map(p => {
                        const ts = new Date(p.timestamp);
                        if (range === '1h') return ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                        if (range === '1d') return ts.toLocaleTimeString('en-US', { hour: '2-digit' });
                        if (range === '1w' || range === '1m') return ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        return ts.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                    });
                    const sp = hist.data.map(p => ((p.price - base) / base) * 100).map(x => parseFloat(x.toFixed(2)));
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

Date.prototype.getDayOfYear = function() {
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
        betTR: data.betTRData.length
    });
    
    // Update performance return display
    const returnElement = document.getElementById('performance-return');
    if (returnElement && data.portfolioData.length > 0 && window.currentSnapshots && window.currentSnapshots.length > 0) {
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
        returnElement.style.textShadow = latestReturn >= 0 ? '0 0 15px rgba(0,255,136,0.4)' : '0 0 15px rgba(255,107,107,0.4), 0 0 2px rgba(0,0,0,1)';
    }
    
    if (performanceChart) {
        performanceChart.destroy();
    }
    
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
                    borderWidth: 3.5,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 3,
                    pointHoverBackgroundColor: '#00d9ff',
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2
                },
                {
                    label: 'Total Deposits',
                    data: data.depositsData,
                    borderColor: '#ffffff',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 3.5,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 3,
                    pointHoverBackgroundColor: '#ffffff',
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2,
                    borderDash: [5, 5]
                },
                {
                    label: 'S&P 500',
                    data: data.sp500Data,
                    borderColor: '#FFC107',
                    backgroundColor: 'rgba(255, 193, 7, 0.05)',
                    borderWidth: 3.5,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 3,
                    pointHoverBackgroundColor: '#FFC107',
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2
                },
                {
                    label: 'BET-TR',
                    data: data.betTRData,
                    borderColor: '#ff8a80',
                    backgroundColor: 'rgba(255, 138, 128, 0.05)',
                    borderWidth: 3.5,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 3,
                    pointHoverBackgroundColor: '#ff8a80',
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    titleFont: {
                        size: 15,
                        weight: 'bold',
                        family: "'Inter', 'Segoe UI', sans-serif"
                    },
                    bodyFont: {
                        size: 14,
                        weight: '900',
                        family: "'Inter', 'Segoe UI', sans-serif"
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
                        title: function(context) {
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
                                    minute: '2-digit'
                                });
                                return ['📊 ' + dateStr, `💰 Balance: €${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`];
                            }
                            return context[0].label;
                        },
                        labelColor: function(context) {
                            return {
                                borderColor: context.dataset.borderColor,
                                backgroundColor: context.dataset.borderColor,
                                borderWidth: 2,
                                borderRadius: 4
                            };
                        },
                        label: function(context) {
                            // Skip Total Deposits from tooltip
                            if (context.dataset.label === 'Total Deposits') {
                                return null;
                            }
                            const value = parseFloat(context.parsed.y).toFixed(2);
                            const label = context.dataset.label || '';
                            const sign = value >= 0 ? '+' : '';
                            return ` ${label}: ${sign}${value}%`;
                        },
                        labelTextColor: function(context) {
                            return '#ffffff';
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.8)',
                        maxTicksLimit: 10
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.8)',
                        maxTicksLimit: 8,
                        callback: function(value) {
                            return value.toFixed(2) + '%';
                        }
                    }
                }
            },
            animation: {
                duration: 750,
                easing: 'easeInOutQuart'
            }
        }
    });

    // Store chart globally for checkbox access
    window.performanceChart = performanceChart;
}

// ========== ADMIN SECTION ==========

// Load all snapshots
async function loadSnapshotsData() {
    try {
        const response = await fetch('/api/performance-snapshots?range=max');
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
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">No snapshots available</td></tr>';
            return;
        }

        tbody.innerHTML = snapshots.map(snapshot => {
            const date = new Date(snapshot.timestamp);
            const dateStr = date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            const balanceFormatted = snapshot.portfolio_balance ? `€${snapshot.portfolio_balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';
            
            return `
                <tr>
                    <td>${snapshot.id}</td>
                    <td>${dateStr}</td>
                    <td>${balanceFormatted}</td>
                    <td>${snapshot.portfolio_percent.toFixed(4)}%</td>
                    <td>${snapshot.deposits_percent.toFixed(4)}%</td>
                    <td>${snapshot.sp500_percent.toFixed(4)}%</td>
                    <td>${snapshot.bet_percent.toFixed(4)}%</td>
                    <td>
                        <button class="delete-snapshot-btn" onclick="deleteSnapshot(${snapshot.id})">🗑️ Delete</button>
                    </td>
                </tr>
            `;
        }).join('');

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
            method: 'DELETE'
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

// Delete old snapshots (>30 days)
async function deleteOldSnapshots() {
    try {
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const response = await fetch(`/api/performance-snapshots/delete-old?before=${thirtyDaysAgo}`, {
            method: 'DELETE'
        });

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
        const response = await fetch('/api/performance-snapshots/delete-all', {
            method: 'DELETE'
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
}

// Delete snapshots by ID range
async function deleteSnapshotRange(fromId, toId) {
    console.log('deleteSnapshotRange called with:', fromId, toId);
    try {
        const url = `/api/performance-snapshots/delete-range?from=${fromId}&to=${toId}`;
        console.log('Fetching:', url);
        
        const response = await fetch(url, {
            method: 'DELETE'
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
        const snapshotsResponse = await fetch('/api/performance-snapshots?range=max');
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
        const depositsResponse = await fetch('/api/deposits');
        const depositsData = await depositsResponse.json();
        
        const totalDeposits = depositsData.reduce((sum, deposit) => {
            const amount = parseFloat(deposit.amount.replace(/[^0-9.-]/g, ''));
            return sum + amount;
        }, 0);
        
        console.log(`🔄 Resetting baseline to: Portfolio=${portfolioBalance}€, Deposits=${totalDeposits}€`);
        
        const response = await fetch('/api/performance-baseline/reset', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                portfolio_balance: portfolioBalance,
                total_deposits: totalDeposits
            })
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
    fetch('/api/performance-snapshots?range=max')
        .then(response => response.json())
        .then(data => {
            const snapshots = data.snapshots || [];
            
            if (snapshots.length === 0) {
                alert('No snapshots to export');
                return;
            }

            // Create CSV content
            let csv = 'ID,Timestamp,Date,Portfolio %,Deposits %,S&P 500 %,BET-TR %\n';
            
            snapshots.forEach(snapshot => {
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
        .catch(error => {
            console.error('Error exporting snapshots:', error);
            alert('Error exporting snapshots');
        });
}

// Allocation Chart (Sectors/Countries)
let allocationPieChart = null;
let currentView = 'sectors'; // 'sectors' or 'countries'

// Color palette for charts
const CHART_COLORS = [
    '#FFC107', '#2196F3', '#4CAF50', '#9C27B0', '#F44336', 
    '#FF9800', '#00BCD4', '#795548', '#E91E63', '#607D8B', 
    '#8BC34A', '#FF5722', '#3F51B5', '#009688', '#CDDC39',
    '#673AB7', '#FFC107', '#00BCD4', '#E91E63', '#4CAF50'
];

function createAllocationPieChart(data, title) {
    const ctx = document.getElementById('allocation-pie-chart');
    if (!ctx) {
        console.error('Allocation canvas not found!');
        return;
    }

    const labels = data.map(item => item.name);
    const values = data.map(item => item.percentage);
    
    if (allocationPieChart) {
        allocationPieChart.destroy();
    }

    allocationPieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: CHART_COLORS.slice(0, data.length),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1,
            animation: {
                animateRotate: false,
                animateScale: false
            },
            plugins: {
                legend: {
                    display: false  // Hide legend, we'll show it separately
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
                        label: function(context) {
                            return `${context.label}: ${context.parsed.toFixed(2)}%`;
                        }
                    }
                }
            }
        }
    });
    
    // Update the allocation list
    updateAllocationList(data);
}

function updateAllocationList(data) {
    const listDiv = document.getElementById('allocation-list');
    if (!listDiv) return;
    
    listDiv.innerHTML = data.map((item, index) => `
        <div style="display: flex; flex-direction: column; gap: 0.1rem; padding: 0.4rem; background: rgba(255, 255, 255, 0.05); border-radius: 4px; border-left: 2px solid ${CHART_COLORS[index % CHART_COLORS.length]};">
            <div style="display: flex; align-items: center; gap: 0.3rem;">
                <div style="width: 6px; height: 6px; border-radius: 1px; background: ${CHART_COLORS[index % CHART_COLORS.length]}; flex-shrink: 0;"></div>
                <span style="color: white; font-weight: 500; font-size: 0.65rem; line-height: 1.1;">${item.name}</span>
            </div>
            <span style="color: #00ff88; font-weight: bold; font-size: 0.75rem; padding-left: 0.9rem;">${item.percentage.toFixed(2)}%</span>
        </div>
    `).join('');
}

async function loadAllocationData(view) {
    try {
        const endpoint = view === 'sectors' ? '/api/allocation/sectors' : '/api/allocation/countries';
        const response = await fetch(endpoint);
        let data = await response.json();
        
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

async function adjustCountriesWithRealBalances(countriesData) {
    try {
        // Fetch stocks to calculate balances
        const stocksResponse = await fetch('/api/stocks');
        const stocks = await stocksResponse.json();
        
        // Calculate Tradeville balance (Romanian stocks only - no ETFs)
        let tradevilleBalance = 0;
        stocks.forEach(stock => {
            if (stock.broker === 'Tradeville' || stock.symbol === 'Cash Tradeville') {
                const shares = parseFloat(stock.shares) || 0;
                let priceStr = String(stock.share_price || '0').replace(/[€$\s]/g, '').replace(',', '.');
                const price = parseFloat(priceStr) || 0;
                tradevilleBalance += shares * price;
            }
        });
        
        // Calculate total balance for non-ETF, non-Cash, non-Crypto stocks in XTB-EUR, XTB-USD, Trading212
        let nonRomanianStocksBalance = 0;
        stocks.forEach(stock => {
            const broker = stock.broker || '';
            const sector = stock.sector || '';
            
            if ((broker === 'XTB-EUR' || broker === 'XTB-USD' || broker === 'Trading212') 
                && sector !== 'Cash' && sector !== 'Cryptocurrency' && !sector.startsWith('ETF')) {
                const shares = parseFloat(stock.shares) || 0;
                let priceStr = String(stock.share_price || '0').replace(/[€$\s]/g, '').replace(',', '.');
                const price = parseFloat(priceStr) || 0;
                nonRomanianStocksBalance += shares * price;
            }
        });
        
        // Calculate total balance from ETFs (will be distributed by their country breakdown)
        let totalETFBalance = 0;
        stocks.forEach(stock => {
            const sector = stock.sector || '';
            if (sector.startsWith('ETF')) {
                const shares = parseFloat(stock.shares) || 0;
                let priceStr = String(stock.share_price || '0').replace(/[€$\s]/g, '').replace(',', '.');
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
        
        const romaniaIndex = countriesData.findIndex(c => c.name === 'Romania');
        
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
            
            console.log(`🔧 Adjusted Romania: ${oldRomaniaPercent.toFixed(2)}% → ${realRomaniaPercent.toFixed(2)}%`);
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
    
    sectorsBtn.addEventListener('click', () => {
        if (currentView !== 'sectors') {
            currentView = 'sectors';
            
            // Update button styles
            sectorsBtn.style.background = '#4CAF50';
            sectorsBtn.style.color = 'white';
            sectorsBtn.style.borderColor = '#4CAF50';
            
            countriesBtn.style.background = 'white';
            countriesBtn.style.color = '#333';
            countriesBtn.style.borderColor = '#ddd';
            
            // Load sectors data
            loadAllocationData('sectors');
        }
    });
    
    countriesBtn.addEventListener('click', () => {
        if (currentView !== 'countries') {
            currentView = 'countries';
            
            // Update button styles
            countriesBtn.style.background = '#4CAF50';
            countriesBtn.style.color = 'white';
            countriesBtn.style.borderColor = '#4CAF50';
            
            sectorsBtn.style.background = 'white';
            sectorsBtn.style.color = '#333';
            sectorsBtn.style.borderColor = '#ddd';
            
            // Load countries data
            loadAllocationData('countries');
        }
    });
}


