document.addEventListener('DOMContentLoaded', async () => {
    const statusEl = document.getElementById('status');
    const normalGasEl = document.getElementById('normalGas');
    const fastGasEl = document.getElementById('fastGas');
    const instantGasEl = document.getElementById('instantGas');
    const normalCostEl = document.getElementById('normalCost');
    const fastCostEl = document.getElementById('fastCost');
    const instantCostEl = document.getElementById('instantCost');
    const hypePriceEl = document.getElementById('hypePrice');
    const refreshBtn = document.getElementById('refreshBtn');
    const infoBtn = document.getElementById('infoBtn');
    const aboutModal = document.getElementById('aboutModal');
    const closeBtn = document.getElementById('closeBtn');
    const versionInfo = document.getElementById('versionInfo');
    const copyrightInfo = document.getElementById('copyrightInfo');

    // Load and display gas data
    async function loadGasData() {
        try {
            const result = await chrome.storage.local.get(['gasData']);

            if (result.gasData) {
                const { normal, fast, instant, hypePrice, lastUpdate } = result.gasData;

                // Format gas prices with appropriate decimal places
                const formatGasPrice = (price) => {
                    if (price < 1) return price.toFixed(3);
                    if (price < 10) return price.toFixed(2);
                    return price.toFixed(1);
                };

                // Calculate USD cost for a transfer (46000 gas) on HyperEVM
                // Formula: Gas Fee (in HYPE) = Gas Price (in gwei) × Gas Limit × 0.000000001
                const calculateCost = (gasPriceGwei) => {
                    if (!hypePrice || hypePrice === 0) return '--';
                    const gasLimit = 46000; // Standard ERC20 token transfer
                    // Convert gwei to HYPE: gwei * gasLimit / 1,000,000,000 (since 1 gwei = 10^9 wei)
                    const costInHype = (gasPriceGwei * gasLimit) / 1000000000;
                    const costInUsd = costInHype * hypePrice;

                    //console.log(`Debug: ${gasPriceGwei} gwei * ${gasLimit} gas / 1B = ${costInHype} HYPE * $${hypePrice} = $${costInUsd.toFixed(4)}`);
                    return costInUsd < 0.01 ? '<$0.01' : `$${costInUsd.toFixed(2)}`;
                };

                // Update display
                normalGasEl.innerHTML = `${formatGasPrice(normal)}<span class="gas-unit">gwei</span>`;
                fastGasEl.innerHTML = `${formatGasPrice(fast)}<span class="gas-unit">gwei</span>`;
                instantGasEl.innerHTML = `${formatGasPrice(instant)}<span class="gas-unit">gwei</span>`;

                // Update USD costs
                normalCostEl.textContent = calculateCost(normal);
                fastCostEl.textContent = calculateCost(fast);
                instantCostEl.textContent = calculateCost(instant);

                // Update HYPE price display

                if (hypePrice && hypePrice > 0) {
                    hypePriceEl.textContent = `HYPE: $${hypePrice.toFixed(2)}`;
                } else {
                    hypePriceEl.textContent = 'HYPE: $--';
                }

                // Update status with actual time
                if (lastUpdate) {
                    const updateTime = new Date(lastUpdate);
                    const timeString = updateTime.toLocaleTimeString('en-US', {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });
                    statusEl.textContent = `Updated at ${timeString}`;
                } else {
                    statusEl.textContent = 'Data loaded';
                }
            } else {
                statusEl.textContent = 'No data available';
            }
        } catch (error) {
            console.error('Error loading gas data:', error);
            statusEl.textContent = 'Error loading data';
        }
    }

    // Refresh gas data
    async function refreshGasData() {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Refreshing...';
        refreshBtn.classList.add('loading');
        statusEl.textContent = 'Fetching latest prices...';

        try {
            // Send message to background script to fetch new data
            await chrome.runtime.sendMessage({ action: 'fetchGasPrice' });

            // Wait a moment for the background script to update storage
            setTimeout(async () => {
                await loadGasData();
                refreshBtn.disabled = false;
                refreshBtn.textContent = 'Refresh Gas Prices';
                refreshBtn.classList.remove('loading');
            }, 2000);

        } catch (error) {
            console.error('Error refreshing gas data:', error);
            statusEl.textContent = 'Error refreshing data';
            refreshBtn.disabled = false;
            refreshBtn.textContent = 'Refresh Gas Prices';
            refreshBtn.classList.remove('loading');
        }
    }

    // Load extension version from manifest
    async function loadExtensionInfo() {
        try {
            const manifest = chrome.runtime.getManifest();
            versionInfo.textContent = `v${manifest.version}`;
            
            // Set current year for copyright
            const currentYear = new Date().getFullYear();
            copyrightInfo.textContent = `© ${currentYear} HyperEVM Real-Time Gas`;
        } catch (error) {
            console.error('Error loading extension info:', error);
            versionInfo.textContent = 'Unknown';
            copyrightInfo.textContent = '© HyperEVM Real-Time Gas';
        }
    }

    // Modal functionality
    function openModal() {
        aboutModal.style.display = 'block';
    }

    function closeModal() {
        aboutModal.style.display = 'none';
    }

    // Event listeners
    refreshBtn.addEventListener('click', refreshGasData);
    infoBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    
    // Close modal when clicking outside
    aboutModal.addEventListener('click', (e) => {
        if (e.target === aboutModal) {
            closeModal();
        }
    });

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.gasData) {
            loadGasData();
        }
    });

    // Initial load
    await loadGasData();
    await loadExtensionInfo();
});