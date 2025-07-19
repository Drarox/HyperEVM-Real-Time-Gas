const HYPEREVM_RPC = 'https://rpc.hyperliquid.xyz/evm';
const UPDATE_INTERVAL = 5; // seconds
const PRICE_CACHE_DURATION = 60000; // 60 seconds cache duration

let gasData = {
  normal: 0,
  fast: 0,
  instant: 0,
  hypePrice: 0,
  lastUpdate: null
};

// Cache for HYPE price to avoid hitting CoinGecko API too frequently
let priceCache = {
  hypePrice: 0,
  lastFetch: null
};

// Fetch HYPE price for USD calculations with caching
async function fetchHypePrice() {
  const now = Date.now();

  // Check if we have cached price and it's still valid (less than 60 seconds old)
  if (priceCache.lastFetch && (now - priceCache.lastFetch) < PRICE_CACHE_DURATION) {
    //console.log('Using cached HYPE price:', priceCache.hypePrice);
    return priceCache.hypePrice;
  }

  try {
    console.log('Fetching fresh HYPE price from CoinGecko...');
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=hyperliquid&vs_currencies=usd');
    const data = await response.json();
    const price = data.hyperliquid?.usd || 0;

    // Update cache
    priceCache.hypePrice = price;
    priceCache.lastFetch = now;

    console.log('Fresh HYPE price fetched and cached:', price);
    return price;
  } catch (error) {
    console.error('Error fetching HYPE price:', error);
    // Return cached price if available, otherwise 0
    return priceCache.hypePrice || 0;
  }
}

// Fetch gas price from HyperEVM
async function fetchGasPrice() {
  try {
    const response = await fetch(HYPEREVM_RPC, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_gasPrice',
        params: [],
        id: 1
      })
    });

    const data = await response.json();
    //console.log('Raw RPC response:', data);

    if (data.result) {
      // Convert hex to decimal and then to Gwei
      const gasPriceWei = parseInt(data.result, 16);
      //console.log('Gas price in Wei:', gasPriceWei);

      // Convert Wei to Gwei (1 Gwei = 10^9 Wei)
      const gasPriceGwei = gasPriceWei / 1000000000;
      console.log('Gas price in Gwei:', gasPriceGwei);

      // Round to reasonable precision
      const roundedGwei = Math.round(gasPriceGwei * 100) / 100;

      // Fetch HYPE price for USD calculations
      const hypePrice = await fetchHypePrice();

      // Create Normal, Fast, Instant variations
      // Normal = current network gas price (base price)
      // Fast = current price + 25% premium for faster confirmation
      // Instant = current price + 50% premium for immediate confirmation
      const basePrice = Math.max(0.01, roundedGwei); // Ensure minimum price

      gasData = {
        normal: Math.round(basePrice * 100) / 100,
        fast: Math.round((basePrice * 1.25) * 100) / 100,
        instant: Math.round((basePrice * 1.5) * 100) / 100,
        hypePrice: hypePrice,
        lastUpdate: new Date().toISOString()
      };

      // Store in chrome storage
      await chrome.storage.local.set({ gasData });

      // Update badge with normal gas price (current network price)
      await updateBadge(gasData.normal);

      console.log('Gas data updated:', gasData);
    } else if (data.error) {
      console.error('RPC Error:', data.error);
    }
  } catch (error) {
    console.error('Error fetching gas price:', error);
  }
}

// Update extension badge
async function updateBadge(gasPrice) {
  // For very small gas prices, show with decimal places
  let badgeText;
  if (gasPrice < 1) {
    badgeText = gasPrice.toFixed(2);
  } else if (gasPrice < 10) {
    badgeText = gasPrice.toFixed(1);
  } else if (gasPrice > 999) {
    badgeText = '999+';
  } else {
    badgeText = Math.round(gasPrice).toString();
  }

  await chrome.action.setBadgeText({
    text: badgeText
  });

  await chrome.action.setBadgeBackgroundColor({
    color: getGasColor(gasPrice)
  });
}

// Get color based on gas price
function getGasColor(gasPrice) {
  if (gasPrice < 1) return '#4CAF50'; // Green - very low
  if (gasPrice < 5) return '#FF9800'; // Orange - medium
  return '#F44336'; // Red - high
}

// Initialize and start periodic updates
async function initialize() {
  // Load existing data
  const stored = await chrome.storage.local.get(['gasData']);
  if (stored.gasData) {
    gasData = stored.gasData;
    await updateBadge(gasData.normal || 0);
  }

  // Fetch initial data
  await fetchGasPrice();

  // Set up periodic updates using Chrome alarms
  const intervalInMinutes = UPDATE_INTERVAL / 60;
  chrome.alarms.create('gasUpdate', { periodInMinutes: intervalInMinutes });
}

// Event listeners
chrome.runtime.onStartup.addListener(initialize);
chrome.runtime.onInstalled.addListener(initialize);

// Handle alarm for periodic gas price updates
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'gasUpdate') {
    fetchGasPrice();
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'fetchGasPrice') {
    fetchGasPrice().then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep message channel open for async response
  }
});