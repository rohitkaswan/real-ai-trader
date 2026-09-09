import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  Zap,
  AlertTriangle,
  Check,
  Layers,
  KeyRound,
  ExternalLink,
  Coins,
  Gauge,
  Sliders,
} from 'lucide-react';
import { RiskSentinelLimits } from '../types';

interface BrokerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentVenue: 'LOCAL_EXCHANGE' | 'BINANCE' | 'MT5';
  currentCapacity: number;
  currentSymbol: string;
  riskLimits: RiskSentinelLimits;
  onUpdateVenue: (venue: 'LOCAL_EXCHANGE' | 'BINANCE' | 'MT5') => Promise<void>;
  onUpdateCapacity: (capacity: number) => Promise<void>;
  onUpdateSymbol: (symbol: string) => Promise<void>;
  onUpdateRiskLimits: (limits: Partial<RiskSentinelLimits>) => Promise<void>;
  onInjectShock: (type: string) => Promise<void>;
}

export const BrokerSettingsModal: React.FC<BrokerSettingsModalProps> = ({
  isOpen,
  onClose,
  currentVenue,
  currentCapacity,
  currentSymbol,
  riskLimits,
  onUpdateVenue,
  onUpdateCapacity,
  onUpdateSymbol,
  onUpdateRiskLimits,
  onInjectShock,
}) => {
  const [selectedVenue, setSelectedVenue] = useState(currentVenue);
  const [capacityInput, setCapacityInput] = useState(currentCapacity);
  const [symbolInput, setSymbolInput] = useState(currentSymbol);
  const [riskPerTrade, setRiskPerTrade] = useState(riskLimits.maxRiskPerTradeEquityPct);
  const [dailyDrawdown, setDailyDrawdown] = useState(riskLimits.maxDailyDrawdownEquityPct);
  const [spreadGate, setSpreadGate] = useState(riskLimits.maxSpreadBps);
  const [latencyGate, setLatencyGate] = useState(riskLimits.maxTickLatencyMs);

  const [binanceConfig, setBinanceConfig] = useState<{
    configured: boolean;
    maskedApiKey: string;
    testnet: boolean;
  } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [shockStatus, setShockStatus] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedVenue(currentVenue);
      setCapacityInput(currentCapacity);
      setSymbolInput(currentSymbol);
      setRiskPerTrade(riskLimits.maxRiskPerTradeEquityPct);
      setDailyDrawdown(riskLimits.maxDailyDrawdownEquityPct);
      setSpreadGate(riskLimits.maxSpreadBps);
      setLatencyGate(riskLimits.maxTickLatencyMs);

      // Fetch config info
      fetch('/api/config/info')
        .then(res => res.json())
        .then(data => {
          if (data.binance) {
            setBinanceConfig(data.binance);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, currentVenue, currentCapacity, currentSymbol, riskLimits]);

  if (!isOpen) return null;

  const popularSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (selectedVenue !== currentVenue) {
        await onUpdateVenue(selectedVenue);
      }
      if (capacityInput !== currentCapacity) {
        await onUpdateCapacity(capacityInput);
      }
      if (symbolInput.trim().toUpperCase() !== currentSymbol.toUpperCase()) {
        await onUpdateSymbol(symbolInput.trim().toUpperCase());
      }
      if (
        riskPerTrade !== riskLimits.maxRiskPerTradeEquityPct ||
        dailyDrawdown !== riskLimits.maxDailyDrawdownEquityPct ||
        spreadGate !== riskLimits.maxSpreadBps ||
        latencyGate !== riskLimits.maxTickLatencyMs
      ) {
        await onUpdateRiskLimits({
          maxRiskPerTradeEquityPct: riskPerTrade,
          maxDailyDrawdownEquityPct: dailyDrawdown,
          maxSpreadBps: spreadGate,
          maxTickLatencyMs: latencyGate,
        });
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleTriggerShock = async (type: string) => {
    setShockStatus(`Injecting ${type}...`);
    try {
      await onInjectShock(type);
      setShockStatus(`Shock injected! Observe Reaper cull & AI auto-healer response.`);
      setTimeout(() => setShockStatus(null), 4000);
    } catch (e: any) {
      setShockStatus(`Error: ${e.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 font-mono text-xs">
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg max-w-2xl w-full p-5 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-zinc-300" />
            <div>
              <h2 className="text-sm font-bold text-zinc-100">
                SYSTEM CONFIGURATION &amp; BROKER GATEWAY
              </h2>
              <p className="text-[11px] text-zinc-400">
                Manage Binance API, active asset pair, execution venue, and risk parameters
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 text-sm px-2 py-1"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 text-zinc-300 flex-1 overflow-y-auto pr-1">
          {/* 1. Binance API Credential Status & Instruction Box */}
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-md p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-zinc-100 text-xs">
                  BINANCE API INTEGRATION
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  binanceConfig?.configured
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}
              >
                {binanceConfig?.configured
                  ? `KEY ACTIVE (${binanceConfig.maskedApiKey})`
                  : 'NOT YET SET (DEFAULT LOCAL)'}
              </span>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              To update your <strong>Binance API Key</strong> and <strong>Secret</strong>:
            </p>
            <div className="bg-black/60 p-2.5 rounded border border-zinc-800 text-[11px] space-y-1 text-zinc-300">
              <div>
                <span className="text-amber-400 font-bold">1. In AI Studio:</span> Open the <strong>Settings (Gear icon) &gt; Secrets</strong> menu, and define:
                <ul className="list-disc list-inside ml-2 mt-0.5 text-zinc-400">
                  <li><code className="text-zinc-200">BINANCE_API_KEY</code> = your 64-character Binance API key</li>
                  <li><code className="text-zinc-200">BINANCE_API_SECRET</code> = your HMAC secret key</li>
                  <li><code className="text-zinc-200">BINANCE_TESTNET</code> = <span className="text-cyan-400">true</span> (or <span className="text-cyan-400">false</span> for live mainnet)</li>
                </ul>
              </div>
              <div className="pt-1">
                <span className="text-amber-400 font-bold">2. When Running Locally:</span> Set these in your local <code className="text-zinc-200">.env</code> file at the project root.
              </div>
            </div>
          </div>

          {/* 2. Trading Pair / Symbol Selection */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-zinc-400 font-bold block text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-cyan-400" />
                Active Market Symbol
              </label>
              <span className="text-emerald-400 font-bold text-xs">{symbolInput.toUpperCase()}</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={symbolInput}
                onChange={e => setSymbolInput(e.target.value.toUpperCase())}
                placeholder="e.g. BTCUSDT, ETHUSDT"
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-zinc-500 text-[10px]">Quick Select:</span>
              {popularSymbols.map(sym => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => setSymbolInput(sym)}
                  className={`px-2 py-0.5 rounded text-[10px] border transition ${
                    symbolInput === sym
                      ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Execution Venue Selection */}
          <div className="space-y-2">
            <label className="text-zinc-400 font-bold block text-[11px] uppercase tracking-wider">
              Execution Venue
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedVenue('LOCAL_EXCHANGE')}
                className={`p-3 rounded border text-left flex flex-col gap-1 transition ${
                  selectedVenue === 'LOCAL_EXCHANGE'
                    ? 'bg-emerald-950/40 border-emerald-500 text-zinc-100'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <span className="font-bold text-[11px]">LOCAL HIGH-PERF</span>
                <span className="text-[10px] text-zinc-500">Internal Microstructure Slippage Engine</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedVenue('BINANCE')}
                className={`p-3 rounded border text-left flex flex-col gap-1 transition ${
                  selectedVenue === 'BINANCE'
                    ? 'bg-emerald-950/40 border-emerald-500 text-zinc-100'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <span className="font-bold text-[11px]">BINANCE API</span>
                <span className="text-[10px] text-zinc-500">Spot &amp; Futures REST + WebSocket</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedVenue('MT5')}
                className={`p-3 rounded border text-left flex flex-col gap-1 transition ${
                  selectedVenue === 'MT5'
                    ? 'bg-emerald-950/40 border-emerald-500 text-zinc-100'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <span className="font-bold text-[11px]">METATRADER 5</span>
                <span className="text-[10px] text-zinc-500">Local FastAPI IPC Bridge (:8000)</span>
              </button>
            </div>
          </div>

          {/* 4. Swarm Pool Capacity */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-zinc-400 font-bold block text-[11px] uppercase tracking-wider flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-cyan-400" /> Swarm Slot Capacity (N)
              </label>
              <span className="font-bold text-emerald-400">{capacityInput} Active Agents</span>
            </div>
            <input
              type="range"
              min="15"
              max="50"
              step="1"
              value={capacityInput}
              onChange={e => setCapacityInput(parseInt(e.target.value, 10))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* 5. Chief Risk Sentinel Parameters */}
          <div className="bg-zinc-900/50 p-3.5 rounded border border-zinc-800 space-y-3">
            <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-[11px]">
              <Shield className="w-3.5 h-3.5" />
              <span>CHIEF RISK SENTINEL HARD LIMITS</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-zinc-400 block mb-1">
                  Half-Kelly Max Risk Per Trade: <strong>{riskPerTrade.toFixed(1)}%</strong>
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="3.0"
                  step="0.1"
                  value={riskPerTrade}
                  onChange={e => setRiskPerTrade(parseFloat(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-400 block mb-1">
                  Daily Drawdown Circuit Breaker: <strong>{dailyDrawdown.toFixed(1)}%</strong>
                </label>
                <input
                  type="range"
                  min="1.5"
                  max="6.0"
                  step="0.5"
                  value={dailyDrawdown}
                  onChange={e => setDailyDrawdown(parseFloat(e.target.value))}
                  className="w-full accent-rose-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-400 block mb-1">
                  Max Spread Gate: <strong>{spreadGate.toFixed(1)} bps</strong>
                </label>
                <input
                  type="range"
                  min="3.0"
                  max="20.0"
                  step="0.5"
                  value={spreadGate}
                  onChange={e => setSpreadGate(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-400 block mb-1">
                  Max Tick Latency Gate: <strong>{latencyGate} ms</strong>
                </label>
                <input
                  type="range"
                  min="50"
                  max="300"
                  step="10"
                  value={latencyGate}
                  onChange={e => setLatencyGate(parseInt(e.target.value, 10))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* 6. Stress Testing / Shock Injection */}
          <div className="bg-zinc-900/60 p-3 rounded border border-zinc-800 space-y-2">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>TEST CULL &amp; AUTO-HEALER DIAGNOSTICS</span>
            </div>
            <p className="text-[10px] text-zinc-400">
              Inject synthetic volatility or spread shocks to test real-time Darwinian culling and auto-healing:
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleTriggerShock('ADVERSE_PLUNGE')}
                className="px-3 py-1.5 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800 text-[11px] font-semibold transition"
              >
                Inject Volatility Shock (-5%)
              </button>
              <button
                type="button"
                onClick={() => handleTriggerShock('SPREAD_BLOWOUT')}
                className="px-3 py-1.5 rounded bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-800 text-[11px] font-semibold transition"
              >
                Inject Spread Blowout (15 bps)
              </button>
            </div>
            {shockStatus && (
              <div className="text-[10px] text-zinc-300 bg-zinc-950 p-2 rounded border border-zinc-800">
                {shockStatus}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-zinc-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition disabled:opacity-50"
          >
            {isSaving ? 'Applying...' : 'Apply & Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};
