import React, { useState, useEffect, useRef } from 'react';
import {
  Trophy,
  Skull,
  Activity,
  Sparkles,
  Layers,
  Terminal,
} from 'lucide-react';
import { Navbar } from './components/Navbar';
import { RiskSentinelBanner } from './components/RiskSentinelBanner';
import { MarketMicrostructureChart } from './components/MarketMicrostructureChart';
import { EquityCurveChart } from './components/EquityCurveChart';
import { ActiveSwarmLeaderboard } from './components/ActiveSwarmLeaderboard';
import { GraveyardView } from './components/GraveyardView';
import { OrderExecutionLog } from './components/OrderExecutionLog';
import { AutoHealerPanel } from './components/AutoHealerPanel';
import { UnitTestsModal } from './components/UnitTestsModal';
import { BrokerSettingsModal } from './components/BrokerSettingsModal';
import {
  AgentState,
  GraveyardRecord,
  MarketTick,
  OrderExecutionResult,
  RiskSentinelLimits,
  SwarmStatePayload,
  SystemDiagnosticAlert,
} from './types';

export default function App() {
  // Swarm State
  const [totalEquity, setTotalEquity] = useState<number>(100000);
  const [totalDeaths, setTotalDeaths] = useState<number>(0);
  const [capacity, setCapacity] = useState<number>(30);
  const [venue, setVenue] = useState<'LOCAL_EXCHANGE' | 'BINANCE' | 'MT5'>('LOCAL_EXCHANGE');
  const [feedStatus, setFeedStatus] = useState<{
    symbol: string;
    status: 'CONNECTED' | 'CONNECTING' | 'RECONNECTING' | 'OFFLINE';
    latencyMs: number;
    reconnectAttempts: number;
  }>({
    symbol: 'BTCUSDT',
    status: 'CONNECTING',
    latencyMs: 15,
    reconnectAttempts: 0,
  });

  const [riskLimits, setRiskLimits] = useState<RiskSentinelLimits>({
    maxRiskPerTradeEquityPct: 1.5,
    maxDailyDrawdownEquityPct: 3.0,
    maxSpreadBps: 8.0,
    maxTickLatencyMs: 150,
    circuitBreakerTripped: false,
    killSwitchActive: false,
    totalAccountEquity: 100000,
    dailyStartingEquity: 100000,
    currentDailyDrawdownPct: 0.0,
  });

  const [activeAgents, setActiveAgents] = useState<AgentState[]>([]);
  const [recentExecutions, setRecentExecutions] = useState<OrderExecutionResult[]>([]);
  const [recentTicks, setRecentTicks] = useState<MarketTick[]>([]);
  const [equityHistory, setEquityHistory] = useState<{ timestamp: number; equity: number; drawdownPct: number }[]>([]);
  const [graveyardRecords, setGraveyardRecords] = useState<GraveyardRecord[]>([]);
  const [incidents, setIncidents] = useState<SystemDiagnosticAlert[]>([]);

  // Navigation & Modals
  const [activeTab, setActiveTab] = useState<'LEADERBOARD' | 'GRAVEYARD' | 'EXECUTIONS' | 'AUTO_HEALER'>('LEADERBOARD');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUnitTestsOpen, setIsUnitTestsOpen] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  // 1. Initial State Fetch
  const fetchSnapshot = async () => {
    try {
      const res = await fetch('/api/swarm/state');
      if (res.ok) {
        const data = await res.json();
        setTotalEquity(data.totalEquity);
        setTotalDeaths(data.totalDeaths);
        setCapacity(data.capacity);
        setVenue(data.venue);
        if (data.feedStatus) setFeedStatus(data.feedStatus);
        if (data.riskLimits) setRiskLimits(data.riskLimits);
        if (data.activeAgents) setActiveAgents(data.activeAgents);
        if (data.recentExecutions) setRecentExecutions(data.recentExecutions);
        if (data.graveyard) setGraveyardRecords(data.graveyard);
        if (data.equityHistory) setEquityHistory(data.equityHistory);
        if (data.incidents) setIncidents(data.incidents);
      }
    } catch (e) {
      console.warn('Could not fetch snapshot:', e);
    }
  };

  // 2. WebSocket Real-Time Connection
  useEffect(() => {
    fetchSnapshot();

    let retryTimer: NodeJS.Timeout;
    const connectWs = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/swarm`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const payload: SwarmStatePayload = JSON.parse(event.data);
          if (payload.type === 'SWARM_STATE_UPDATE') {
            setTotalEquity(payload.totalEquity);
            setTotalDeaths(payload.totalDeaths);
            setCapacity(payload.capacity);
            setVenue(payload.venue);
            setFeedStatus(payload.feedStatus);
            setRiskLimits(payload.riskLimits);
            setActiveAgents(payload.activeAgents || []);
            setRecentExecutions(payload.recentExecutions || []);
            setRecentTicks(payload.recentTicks || []);
            setEquityHistory(payload.equityHistory || []);
            setIncidents(payload.incidents || []);
          }
        } catch (err) {
          // ignore
        }
      };

      ws.onclose = () => {
        retryTimer = setTimeout(connectWs, 2000);
      };
    };

    connectWs();

    // Fallback polling for graveyard refresh
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/graveyard?limit=40');
        if (res.ok) {
          const gy = await res.json();
          setGraveyardRecords(gy);
        }
      } catch (e) {
        // ignore
      }
    }, 4000);

    return () => {
      clearTimeout(retryTimer);
      clearInterval(pollInterval);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Handlers
  const handleToggleKillSwitch = async (active: boolean) => {
    try {
      const res = await fetch('/api/swarm/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      if (res.ok) {
        const data = await res.json();
        setRiskLimits(prev => ({ ...prev, killSwitchActive: data.killSwitchActive }));
      }
    } catch (err) {
      console.error('Kill switch error:', err);
    }
  };

  const handleResetBreaker = async () => {
    try {
      const res = await fetch('/api/swarm/reset-breaker', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setRiskLimits(data.limits);
      }
    } catch (err) {
      console.error('Reset breaker error:', err);
    }
  };

  const handleUpdateVenue = async (newVenue: 'LOCAL_EXCHANGE' | 'BINANCE' | 'MT5') => {
    const res = await fetch('/api/swarm/venue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venue: newVenue }),
    });
    if (res.ok) {
      setVenue(newVenue);
    }
  };

  const handleUpdateCapacity = async (newCapacity: number) => {
    const res = await fetch('/api/swarm/capacity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capacity: newCapacity }),
    });
    if (res.ok) {
      setCapacity(newCapacity);
    }
  };

  const handleUpdateSymbol = async (newSymbol: string) => {
    const res = await fetch('/api/swarm/symbol', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: newSymbol }),
    });
    if (res.ok) {
      setFeedStatus(prev => ({ ...prev, symbol: newSymbol }));
    }
  };

  const handleUpdateRiskLimits = async (newLimits: Partial<RiskSentinelLimits>) => {
    const res = await fetch('/api/swarm/risk-limits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newLimits),
    });
    if (res.ok) {
      const data = await res.json();
      setRiskLimits(data.limits);
    }
  };

  const handleInjectShock = async (type: string) => {
    await fetch('/api/swarm/shock-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    });
  };

  const handleTriggerAIScan = async () => {
    await fetch('/api/healer/diagnose', { method: 'POST' });
  };

  const latestTick = recentTicks[recentTicks.length - 1];
  const currentSpreadBps = latestTick && latestTick.lastPrice > 0
    ? ((latestTick.askPrice - latestTick.bidPrice) / latestTick.lastPrice) * 10000
    : 1.5;

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-mono flex flex-col selection:bg-emerald-500 selection:text-black">
      {/* 1. Global Navigation Bar */}
      <Navbar
        feedStatus={feedStatus}
        capacity={capacity}
        totalDeaths={totalDeaths}
        totalEquity={totalEquity}
        venue={venue}
        riskLimits={riskLimits}
        onToggleKillSwitch={handleToggleKillSwitch}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenUnitTests={() => setIsUnitTestsOpen(true)}
        onResetBreaker={handleResetBreaker}
      />

      {/* 2. Main Terminal Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 lg:p-6 space-y-4">
        {/* Risk Sentinel Firewall HUD */}
        <RiskSentinelBanner
          limits={riskLimits}
          feedLatencyMs={feedStatus.latencyMs}
          currentSpreadBps={currentSpreadBps}
          onResetBreaker={handleResetBreaker}
        />

        {/* Real-Time Microstructure & Equity Analytics Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MarketMicrostructureChart
            ticks={recentTicks}
            recentExecutions={recentExecutions}
            symbol={feedStatus.symbol}
          />
          <EquityCurveChart
            equityHistory={equityHistory}
            currentEquity={totalEquity}
            startingEquity={riskLimits.dailyStartingEquity}
            maxDailyDrawdownPct={riskLimits.maxDailyDrawdownEquityPct}
          />
        </div>

        {/* Swarm Tournament & System Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2 pt-2">
          <div className="flex items-center gap-2 overflow-x-auto text-xs">
            <button
              onClick={() => setActiveTab('LEADERBOARD')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-bold transition whitespace-nowrap ${
                activeTab === 'LEADERBOARD'
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>SWARM LEADERBOARD ({activeAgents.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('GRAVEYARD')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-bold transition whitespace-nowrap ${
                activeTab === 'GRAVEYARD'
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Skull className="w-3.5 h-3.5 text-rose-400" />
              <span>EVOLUTIONARY GRAVEYARD ({graveyardRecords.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('EXECUTIONS')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-bold transition whitespace-nowrap ${
                activeTab === 'EXECUTIONS'
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>STATE MACHINE &amp; FILLS ({recentExecutions.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('AUTO_HEALER')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-bold transition whitespace-nowrap ${
                activeTab === 'AUTO_HEALER'
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>AI AUTO-HEALER ({incidents.length})</span>
            </button>
          </div>
        </div>

        {/* Tab Content Display */}
        {activeTab === 'LEADERBOARD' && (
          <ActiveSwarmLeaderboard agents={activeAgents} />
        )}

        {activeTab === 'GRAVEYARD' && (
          <GraveyardView records={graveyardRecords} />
        )}

        {activeTab === 'EXECUTIONS' && (
          <OrderExecutionLog executions={recentExecutions} />
        )}

        {activeTab === 'AUTO_HEALER' && (
          <AutoHealerPanel
            incidents={incidents}
            onTriggerScan={handleTriggerAIScan}
          />
        )}
      </main>

      {/* Footer System Telemetry Status */}
      <footer className="mt-auto border-t border-zinc-900 bg-zinc-950 px-4 py-2.5 text-[11px] text-zinc-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              100% LOCAL RUNTIME
            </span>
            <span>•</span>
            <span>SQLITE WAL MODE PERSISTENCE</span>
            <span>•</span>
            <span>ZERO CLOUD DEPENDENCY</span>
          </div>
          <div>
            <span>SYSTEM HEARTBEAT: {new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <UnitTestsModal
        isOpen={isUnitTestsOpen}
        onClose={() => setIsUnitTestsOpen(false)}
      />

      <BrokerSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentVenue={venue}
        currentCapacity={capacity}
        currentSymbol={feedStatus.symbol}
        riskLimits={riskLimits}
        onUpdateVenue={handleUpdateVenue}
        onUpdateCapacity={handleUpdateCapacity}
        onUpdateSymbol={handleUpdateSymbol}
        onUpdateRiskLimits={handleUpdateRiskLimits}
        onInjectShock={handleInjectShock}
      />
    </div>
  );
}
