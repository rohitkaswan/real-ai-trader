import React from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Zap,
  Activity,
  Skull,
  Play,
  Pause,
  Settings,
  Cpu,
  RefreshCw,
  FlaskConical,
  BrainCircuit,
} from 'lucide-react';
import { RiskSentinelLimits } from '../types';

interface NavbarProps {
  feedStatus: {
    symbol: string;
    status: 'CONNECTED' | 'CONNECTING' | 'RECONNECTING' | 'OFFLINE';
    latencyMs: number;
  };
  capacity: number;
  totalDeaths: number;
  totalEquity: number;
  venue: string;
  riskLimits: RiskSentinelLimits;
  onToggleKillSwitch: (active: boolean) => void;
  onOpenSettings: () => void;
  onOpenUnitTests: () => void;
  onOpenHistoricalTrainer?: () => void;
  onResetBreaker: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  feedStatus,
  capacity,
  totalDeaths,
  totalEquity,
  venue,
  riskLimits,
  onToggleKillSwitch,
  onOpenSettings,
  onOpenUnitTests,
  onOpenHistoricalTrainer,
  onResetBreaker,
}) => {
  const isKillSwitchActive = riskLimits.killSwitchActive;
  const isBreakerTripped = riskLimits.circuitBreakerTripped;

  const getFeedStatusBadge = () => {
    switch (feedStatus.status) {
      case 'CONNECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            LIVE FEED ({feedStatus.latencyMs}ms)
          </span>
        );
      case 'CONNECTING':
      case 'RECONNECTING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-950/80 text-amber-400 border border-amber-800/60">
            <RefreshCw className="w-3 h-3 animate-spin" />
            RECONNECTING
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-900 text-zinc-400 border border-zinc-700">
            RING BUFFER
          </span>
        );
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800 px-4 lg:px-6 py-3">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left Branding */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-bold text-lg shadow-sm">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-zinc-100 font-mono">
                DARWINIAN SWARM
              </h1>
              <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono font-medium">
                v2.4 LOCAL
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-mono flex items-center gap-2">
              <span>{feedStatus.symbol}</span>
              <span className="text-zinc-600">•</span>
              <span className="uppercase text-zinc-300">VENUE: {venue}</span>
            </p>
          </div>
        </div>

        {/* Center Live Telemetry Badges */}
        <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
          {getFeedStatusBadge()}

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>SLOTS:</span>
            <span className="text-zinc-100 font-semibold">{capacity} ACTIVE</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">
            <Skull className="w-3.5 h-3.5 text-rose-400" />
            <span>CULLED:</span>
            <span className="text-rose-400 font-semibold">{totalDeaths} DEAD</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>EQUITY:</span>
            <span className="text-emerald-400 font-semibold">
              ${totalEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2">
          {/* Circuit Breaker Alert Indicator */}
          {isBreakerTripped && (
            <button
              onClick={onResetBreaker}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-semibold animate-pulse transition"
              title="Daily Drawdown Breached 3%. Click to reset."
            >
              <ShieldAlert className="w-4 h-4" />
              RESET BREAKER
            </button>
          )}

          {/* Historical Training Button */}
          {onOpenHistoricalTrainer && (
            <button
              onClick={onOpenHistoricalTrainer}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/80 text-xs font-mono transition shadow-sm"
              title="Train Swarm on 20 Years of Historical Macro Data"
            >
              <BrainCircuit className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">TRAIN (20-YR)</span>
            </button>
          )}

          {/* Unit Tests Button */}
          <button
            onClick={onOpenUnitTests}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs font-mono transition"
            title="Run Quantitative Unit Tests"
          >
            <FlaskConical className="w-3.5 h-3.5 text-indigo-400" />
            <span>TESTS</span>
          </button>

          {/* Settings Button */}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs font-mono transition"
            title="Configure Swarm & Venue"
          >
            <Settings className="w-3.5 h-3.5 text-zinc-400" />
            <span>CONFIG</span>
          </button>

          {/* Emergency Kill Switch Button */}
          <button
            onClick={() => onToggleKillSwitch(!isKillSwitchActive)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-mono text-xs font-bold transition shadow-sm ${
              isKillSwitchActive
                ? 'bg-amber-600 hover:bg-amber-500 text-white animate-bounce'
                : 'bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/80'
            }`}
            title="Deterministic Emergency Halt: Liquidates active trades and freezes order transmission"
          >
            {isKillSwitchActive ? (
              <>
                <Play className="w-3.5 h-3.5" />
                RESUME TRADING
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5" />
                KILL SWITCH
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
