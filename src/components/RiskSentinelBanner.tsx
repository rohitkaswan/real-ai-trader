import React from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle, Gauge, Wifi, ZapOff } from 'lucide-react';
import { RiskSentinelLimits } from '../types';

interface RiskSentinelBannerProps {
  limits: RiskSentinelLimits;
  feedLatencyMs: number;
  currentSpreadBps: number;
  onResetBreaker: () => void;
}

export const RiskSentinelBanner: React.FC<RiskSentinelBannerProps> = ({
  limits,
  feedLatencyMs,
  currentSpreadBps,
  onResetBreaker,
}) => {
  const isBreakerTripped = limits.circuitBreakerTripped;
  const isKillSwitchActive = limits.killSwitchActive;
  const isLatencyHigh = feedLatencyMs > limits.maxTickLatencyMs;
  const isSpreadWide = currentSpreadBps > limits.maxSpreadBps;

  return (
    <div className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3.5 text-xs font-mono">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left Status Header */}
        <div className="flex items-center gap-2.5">
          <div
            className={`w-7 h-7 rounded-md flex items-center justify-center ${
              isBreakerTripped || isKillSwitchActive
                ? 'bg-rose-950/80 text-rose-400 border border-rose-800'
                : 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
            }`}
          >
            {isBreakerTripped || isKillSwitchActive ? (
              <ShieldAlert className="w-4 h-4" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-wider text-zinc-200">
                CHIEF RISK SENTINEL
              </span>
              <span
                className={`px-2 py-0.2 rounded text-[10px] font-semibold ${
                  isBreakerTripped
                    ? 'bg-rose-900/80 text-rose-200'
                    : isKillSwitchActive
                    ? 'bg-amber-900/80 text-amber-200'
                    : 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/50'
                }`}
              >
                {isBreakerTripped
                  ? 'CIRCUIT BREAKER TRIPPED'
                  : isKillSwitchActive
                  ? 'HALTED (KILL SWITCH)'
                  : 'FIREWALL ARMED'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Deterministic hard limits with non-overridable veto power
            </p>
          </div>
        </div>

        {/* Middle Metric Telemetry */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 lg:gap-5">
          {/* Daily Drawdown Gauge */}
          <div className="flex flex-col bg-zinc-900/80 px-3 py-1.5 rounded border border-zinc-800">
            <div className="flex items-center justify-between text-zinc-400 text-[10px]">
              <span className="flex items-center gap-1">
                <Gauge className="w-3 h-3 text-cyan-400" /> DAILY DD
              </span>
              <span className="text-zinc-500">MAX 3.0%</span>
            </div>
            <div className="flex items-baseline justify-between mt-0.5">
              <span
                className={`text-sm font-bold ${
                  limits.currentDailyDrawdownPct > 2.0
                    ? 'text-rose-400'
                    : 'text-zinc-200'
                }`}
              >
                {limits.currentDailyDrawdownPct.toFixed(2)}%
              </span>
              <div className="w-14 h-1.5 bg-zinc-800 rounded-full overflow-hidden ml-2">
                <div
                  className={`h-full ${
                    limits.currentDailyDrawdownPct > 2.0
                      ? 'bg-rose-500'
                      : 'bg-cyan-500'
                  }`}
                  style={{
                    width: `${Math.min(100, (limits.currentDailyDrawdownPct / 3.0) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Half-Kelly Sizing Limit */}
          <div className="flex flex-col bg-zinc-900/80 px-3 py-1.5 rounded border border-zinc-800">
            <div className="flex items-center justify-between text-zinc-400 text-[10px]">
              <span>HALF-KELLY</span>
              <span className="text-zinc-500">PER TRADE</span>
            </div>
            <div className="flex items-baseline justify-between mt-0.5">
              <span className="text-sm font-bold text-zinc-200">
                {limits.maxRiskPerTradeEquityPct.toFixed(1)}%
              </span>
              <span className="text-[10px] text-zinc-500">
                ${((limits.totalAccountEquity * limits.maxRiskPerTradeEquityPct) / 100).toFixed(0)} max
              </span>
            </div>
          </div>

          {/* Spread Gate */}
          <div
            className={`flex flex-col px-3 py-1.5 rounded border ${
              isSpreadWide
                ? 'bg-rose-950/40 border-rose-800/80'
                : 'bg-zinc-900/80 border-zinc-800'
            }`}
          >
            <div className="flex items-center justify-between text-zinc-400 text-[10px]">
              <span className="flex items-center gap-1">SPREAD</span>
              <span className="text-zinc-500">GATE &lt;8 bps</span>
            </div>
            <div className="flex items-baseline justify-between mt-0.5">
              <span
                className={`text-sm font-bold ${
                  isSpreadWide ? 'text-rose-400' : 'text-zinc-200'
                }`}
              >
                {currentSpreadBps.toFixed(2)} bps
              </span>
              <span
                className={`text-[10px] ${
                  isSpreadWide ? 'text-rose-400 font-bold' : 'text-emerald-400'
                }`}
              >
                {isSpreadWide ? 'BLOCKED' : 'PASS'}
              </span>
            </div>
          </div>

          {/* Feed Latency Gate */}
          <div
            className={`flex flex-col px-3 py-1.5 rounded border ${
              isLatencyHigh
                ? 'bg-rose-950/40 border-rose-800/80'
                : 'bg-zinc-900/80 border-zinc-800'
            }`}
          >
            <div className="flex items-center justify-between text-zinc-400 text-[10px]">
              <span className="flex items-center gap-1">
                <Wifi className="w-3 h-3 text-emerald-400" /> FEED PING
              </span>
              <span className="text-zinc-500">&lt;150ms</span>
            </div>
            <div className="flex items-baseline justify-between mt-0.5">
              <span
                className={`text-sm font-bold ${
                  isLatencyHigh ? 'text-rose-400' : 'text-zinc-200'
                }`}
              >
                {feedLatencyMs} ms
              </span>
              <span
                className={`text-[10px] ${
                  isLatencyHigh ? 'text-rose-400 font-bold' : 'text-emerald-400'
                }`}
              >
                {isLatencyHigh ? 'STALE' : 'OK'}
              </span>
            </div>
          </div>
        </div>

        {/* Right Action */}
        {isBreakerTripped && (
          <button
            onClick={onResetBreaker}
            className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs font-mono transition"
          >
            DISMISS &amp; RESET BREAKER
          </button>
        )}
      </div>
    </div>
  );
};
