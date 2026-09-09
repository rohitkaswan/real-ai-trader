#!/usr/bin/env bash
set -e

echo "======================================================================"
echo "   DARWINIAN SWARM QUANTITATIVE TRADING ENGINE"
echo "   100% Local Runtime Launcher - macOS / Linux"
echo "======================================================================"

# 1. Check Node.js
echo "[1/4] Checking Node.js environment..."
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed or not in PATH! Please install Node.js v18+."
    exit 1
fi
echo "[OK] Detected Node.js: $(node -v)"

# 2. Check Python
echo "[2/4] Checking Python environment..."
if command -v python3 &> /dev/null; then
    echo "[OK] Detected Python: $(python3 --version)"
    if [ ! -d "server/brokers/.venv" ]; then
        echo "Creating Python virtual environment in server/brokers/.venv..."
        python3 -m venv server/brokers/.venv
    fi
    source server/brokers/.venv/bin/activate || true
    echo "Verifying Python dependencies..."
    pip install -q -r server/brokers/requirements.txt || true
    
    echo "Launching MT5 Bridge on http://127.0.0.1:8000 (background)..."
    python server/brokers/mt5_bridge.py &
    MT5_PID=$!
    trap "kill $MT5_PID 2>/dev/null || true" EXIT
else
    echo "[INFO] Python3 not found. Local fallback exchange and Binance mode active."
fi

# 3. Check node_modules
echo "[3/4] Verifying Node packages..."
if [ ! -d "node_modules" ]; then
    npm install
fi

# 4. Launch Quantitative Swarm Server + UI
echo "[4/4] Starting Darwinian Swarm Engine on http://localhost:3000..."
echo "[INFO] Zero cloud dependence: 100% local persistence and deterministic execution."
echo "======================================================================"
npm run dev
