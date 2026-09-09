import React, { useState, useEffect } from 'react';
import {
  BrainCircuit,
  Play,
  Pause,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Trophy,
  ArrowUpRight,
  TrendingUp,
  Sliders,
  Layers,
  Sparkles,
  History,
  FileText,
  Clock,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import {
  ChampionGenomeRecord,
  GenerationalEpochResult,
  HistoricalDatasetInfo,
  TrainingSessionStatus,
} from '../types';

interface HistoricalTrainerPanelProps {
  onChampionsPromoted?: () => void;
}

export const HistoricalTrainerPanel: React.FC<HistoricalTrainerPanelProps> = ({
  onChampionsPromoted,
}) => {
  const [datasets, setDatasets] = useState<HistoricalDatasetInfo[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('MULTI_DECADE_MACRO_20YR');
  const [generations, setGenerations] = useState<number>(10);
  const [populationSize, setPopulationSize] = useState<number>(30);
  const [status, setStatus] = useState<TrainingSessionStatus | null>(null);
  const [isPromoting, setIsPromoting] = useState(false);
  const [promotionMessage, setPromotionMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [customFileLoaded, setCustomFileLoaded] = useState<string | null>(null);
  const [customTicks, setCustomTicks] = useState<any[] | null>(null);

  // Fetch dataset catalog
  useEffect(() => {
    fetch('/api/training/datasets')
      .then(r => r.json())
      .then(d => {
        if (d.datasets) setDatasets(d.datasets);
      })
      .catch(err => console.error('Failed to load datasets:', err));
  }, []);

  // Poll training status
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const pollStatus = () => {
      fetch('/api/training/status')
        .then(r => r.json())
        .then(d => {
          setStatus(d);
        })
        .catch(err => console.error('Error fetching training status:', err));
    };

    pollStatus();
    interval = setInterval(pollStatus, 800);

    return () => clearInterval(interval);
  }, []);

  const handleStartTraining = async () => {
    setPromotionMessage(null);
    try {
      const payload: any = {
        datasetId: selectedDatasetId,
        generations,
        populationSize,
      };

      if (selectedDatasetId === 'CUSTOM_UPLOAD' && customTicks) {
        payload.customTicks = customTicks;
      }

      await fetch('/api/training/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      console.error('Failed to start training:', err);
    }
  };

  const handleCancelTraining = async () => {
    await fetch('/api/training/cancel', { method: 'POST' });
  };

  const handlePromoteChampions = async () => {
    setIsPromoting(true);
    setPromotionMessage(null);
    try {
      const res = await fetch('/api/training/apply-champions', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setPromotionMessage(`Successfully promoted ${data.promotedCount} champion genomes into the live swarm!`);
        if (onChampionsPromoted) onChampionsPromoted();
      } else {
        setPromotionMessage(`Promotion error: ${data.error}`);
      }
    } catch (err: any) {
      setPromotionMessage(`Error: ${err.message}`);
    } finally {
      setIsPromoting(false);
    }
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      try {
        const res = await fetch('/api/training/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csvContent: text, symbol: 'BTCUSDT' }),
        });
        const data = await res.json();
        if (res.ok) {
          setCustomFileLoaded(`${file.name} (${data.tickCount} price ticks parsed)`);
          setCustomTicks(data.ticks);
          setSelectedDatasetId('CUSTOM_UPLOAD');
        } else {
          setUploadError(data.error || 'Failed to parse CSV');
        }
      } catch (err: any) {
        setUploadError(err.message || 'File upload error');
      }
    };
    reader.readAsText(file);
  };

  const isTraining = status?.status === 'TRAINING';
  const hasChampions = (status?.champions?.length ?? 0) > 0;
  const historyData = status?.history || [];

  return (
    <div className="space-y-6 font-mono text-zinc-200">
      {/* 1. Header Banner & High-Speed Metric Counter */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                <BrainCircuit className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold text-zinc-100">
                HISTORICAL EVOLUTION &amp; DEEP SWARM TRAINING
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-semibold">
                20-YEAR HORIZON READY
              </span>
            </div>
            <p className="text-xs text-zinc-400 max-w-2xl">
              Train the multi-agent swarm across decades of historical market regimes, liquidation voids, and volatility shocks.
              Underperforming agents are culled via the Darwinian Reaper while surviving champions cross over chromosomes to evolve superior alpha.
            </p>
          </div>

          {/* Quick Status Pill */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[11px] text-zinc-400">TRAINING ENGINE STATE</div>
              <div className="flex items-center gap-2 justify-end">
                {isTraining ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-950 text-amber-300 border border-amber-800 animate-pulse">
                    <Zap className="w-3.5 h-3.5" />
                    TRAINING (GEN {status?.currentGeneration}/{status?.totalGenerations})
                  </span>
                ) : status?.status === 'COMPLETED' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    COMPLETED ({status?.totalGenerations} GENS)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                    IDLE / READY
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Real-Time Training Progress Telemetry */}
        {isTraining && status && (
          <div className="mt-4 pt-4 border-t border-zinc-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-black/40 border border-zinc-800 rounded-lg p-2.5">
              <span className="text-zinc-500 block text-[10px]">PROGRESS</span>
              <span className="text-amber-400 font-bold text-sm">{status.progressPct}%</span>
              <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-1.5 overflow-hidden">
                <div
                  className="bg-amber-400 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${status.progressPct}%` }}
                />
              </div>
            </div>

            <div className="bg-black/40 border border-zinc-800 rounded-lg p-2.5">
              <span className="text-zinc-500 block text-[10px]">EXECUTION SPEED</span>
              <span className="text-cyan-400 font-bold text-sm">
                {(status.ticksPerSecond || 0).toLocaleString()} <span className="text-[10px] text-zinc-400">ticks/s</span>
              </span>
            </div>

            <div className="bg-black/40 border border-zinc-800 rounded-lg p-2.5">
              <span className="text-zinc-500 block text-[10px]">TICKS EVALUATED</span>
              <span className="text-zinc-200 font-bold text-sm">
                {(status.ticksProcessed || 0).toLocaleString()}
              </span>
            </div>

            <div className="bg-black/40 border border-zinc-800 rounded-lg p-2.5">
              <span className="text-zinc-500 block text-[10px]">ELAPSED TIME</span>
              <span className="text-zinc-200 font-bold text-sm">
                {((status.elapsedMs || 0) / 1000).toFixed(1)}s
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Dataset Selection Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
            <History className="w-4 h-4 text-indigo-400" />
            1. Select Historical Regime / Dataset
          </h3>
          <span className="text-[11px] text-zinc-500">
            Choose from macroeconomic epochs or upload custom 20-year data
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {datasets.map((dataset) => {
            const isSelected = selectedDatasetId === dataset.id;
            return (
              <div
                key={dataset.id}
                onClick={() => setSelectedDatasetId(dataset.id)}
                className={`p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-indigo-950/40 border-indigo-500/80 ring-1 ring-indigo-500/50 shadow-md'
                    : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {dataset.period}
                    </span>
                    <span className="text-[10px] text-cyan-400 font-mono">
                      {dataset.tickCount.toLocaleString()} ticks
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-zinc-100 mb-1 leading-snug">
                    {dataset.name}
                  </h4>
                  <p className="text-[11px] text-zinc-400 line-clamp-3 mb-3 leading-relaxed">
                    {dataset.description}
                  </p>
                </div>

                <div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {dataset.tags.map((t, idx) => (
                      <span
                        key={idx}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/50"
                      >
                        {t}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-2 border-t border-zinc-800">
                    <span>Regime: <strong className="text-zinc-300">{dataset.marketRegime}</strong></span>
                    {isSelected && (
                      <span className="text-indigo-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> SELECTED
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Custom CSV Upload Card */}
          <div
            onClick={() => setSelectedDatasetId('CUSTOM_UPLOAD')}
            className={`p-4 rounded-xl border border-dashed transition cursor-pointer flex flex-col justify-between ${
              selectedDatasetId === 'CUSTOM_UPLOAD'
                ? 'bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500/50'
                : 'bg-zinc-900/40 border-zinc-700 hover:border-zinc-600 hover:bg-zinc-900/70'
            }`}
          >
            <div>
              <div className="flex items-center gap-2 mb-2 text-indigo-400">
                <Upload className="w-4 h-4" />
                <span className="text-xs font-bold uppercase">Custom CSV Upload</span>
              </div>
              <p className="text-[11px] text-zinc-400 mb-3 leading-relaxed">
                Feed your own 20-year external MT5 or broker historical tick/bar data (CSV format: timestamp, open, high, low, close, volume).
              </p>

              {customFileLoaded ? (
                <div className="p-2 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-[11px] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{customFileLoaded}</span>
                </div>
              ) : (
                <label className="block p-3 rounded-lg bg-zinc-800/80 border border-zinc-700 hover:bg-zinc-800 text-center cursor-pointer transition">
                  <span className="text-xs text-zinc-300 font-semibold flex items-center justify-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-zinc-400" />
                    Select Historical CSV File
                  </span>
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleCsvFileUpload}
                    className="hidden"
                  />
                </label>
              )}

              {uploadError && (
                <p className="text-[10px] text-rose-400 mt-2">{uploadError}</p>
              )}
            </div>

            <div className="text-[10px] text-zinc-500 pt-2 border-t border-zinc-800 mt-3 flex items-center justify-between">
              <span>Supports MT5 / Binance 20-Yr exports</span>
              {selectedDatasetId === 'CUSTOM_UPLOAD' && (
                <span className="text-indigo-400 font-bold">SELECTED</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Training Hyperparameter Configuration & Control Panel */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Controls Form */}
          <div className="flex flex-wrap items-center gap-6 text-xs">
            {/* Generations Selector */}
            <div>
              <label className="block text-[10px] text-zinc-400 uppercase tracking-wider mb-1.5 font-bold">
                Evolutionary Generations: <span className="text-indigo-400 font-bold">{generations}</span>
              </label>
              <div className="flex items-center gap-1.5">
                {[5, 10, 20, 30, 50].map((num) => (
                  <button
                    key={num}
                    onClick={() => setGenerations(num)}
                    disabled={isTraining}
                    className={`px-3 py-1 rounded text-xs font-semibold transition ${
                      generations === num
                        ? 'bg-indigo-600 text-white'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700'
                    }`}
                  >
                    {num} G
                  </button>
                ))}
              </div>
            </div>

            {/* Swarm Population Selector */}
            <div>
              <label className="block text-[10px] text-zinc-400 uppercase tracking-wider mb-1.5 font-bold">
                Swarm Size: <span className="text-cyan-400 font-bold">{populationSize} Agents</span>
              </label>
              <div className="flex items-center gap-1.5">
                {[15, 30, 50].map((size) => (
                  <button
                    key={size}
                    onClick={() => setPopulationSize(size)}
                    disabled={isTraining}
                    className={`px-3 py-1 rounded text-xs font-semibold transition ${
                      populationSize === size
                        ? 'bg-cyan-600 text-white'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700'
                    }`}
                  >
                    {size} Agents
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            {isTraining ? (
              <button
                onClick={handleCancelTraining}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow transition"
              >
                <Pause className="w-4 h-4" />
                CANCEL TRAINING
              </button>
            ) : (
              <button
                onClick={handleStartTraining}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold text-xs shadow-md hover:shadow-indigo-500/20 transition transform active:scale-95"
              >
                <Play className="w-4 h-4 fill-current" />
                START HISTORICAL EVOLUTION ({generations} GENS)
              </button>
            )}

            {hasChampions && !isTraining && (
              <button
                onClick={handlePromoteChampions}
                disabled={isPromoting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition disabled:opacity-50 transform active:scale-95"
              >
                <Trophy className="w-4 h-4 text-amber-300" />
                {isPromoting ? 'PROMOTING...' : 'PROMOTE CHAMPIONS TO LIVE SWARM'}
              </button>
            )}
          </div>
        </div>

        {/* Promotion Toast */}
        {promotionMessage && (
          <div className="mt-3 p-3 rounded-lg bg-emerald-950/80 border border-emerald-700 text-emerald-200 text-xs flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              {promotionMessage}
            </span>
            <button
              onClick={() => setPromotionMessage(null)}
              className="text-zinc-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* 4. Evolution Progression Charts (Visual Learning Evidence) */}
      {historyData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Chart A: Generational Fitness & Sortino Improvement */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-zinc-200 flex items-center gap-2 uppercase">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Evolutionary Alpha Progression (Generations 1 → {historyData.length})
              </h4>
              <span className="text-[10px] text-zinc-500">
                Survival of the Fittest
              </span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historyData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="generation"
                    stroke="#71717a"
                    tick={{ fill: '#a1a1aa', fontSize: 10 }}
                    tickFormatter={(v) => `G${v}`}
                  />
                  <YAxis
                    stroke="#71717a"
                    tick={{ fill: '#a1a1aa', fontSize: 10 }}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      borderColor: '#3f3f46',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Line
                    type="monotone"
                    dataKey="bestFitness"
                    name="Peak Champion Fitness"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#10b981' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgFitness"
                    name="Swarm Avg Fitness"
                    stroke="#6366f1"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="bestSortino"
                    name="Best Sortino Ratio"
                    stroke="#38bdf8"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart B: Gene Convergence (Parameter Drift) */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-zinc-200 flex items-center gap-2 uppercase">
                <Sliders className="w-4 h-4 text-indigo-400" />
                Chromosome Gene Convergence Across Historical Regimes
              </h4>
              <span className="text-[10px] text-zinc-500">
                Parameter Adaptation
              </span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historyData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="generation"
                    stroke="#71717a"
                    tick={{ fill: '#a1a1aa', fontSize: 10 }}
                    tickFormatter={(v) => `G${v}`}
                  />
                  <YAxis
                    stroke="#71717a"
                    tick={{ fill: '#a1a1aa', fontSize: 10 }}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      borderColor: '#3f3f46',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Line
                    type="monotone"
                    dataKey="geneAverages.hurstTrendThreshold"
                    name="Hurst Threshold"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="geneAverages.vwapZEntryThreshold"
                    name="VWAP Z Threshold"
                    stroke="#ec4899"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="geneAverages.kellyFraction"
                    name="Kelly Fraction"
                    stroke="#a855f7"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* 5. Hall of Evolved Champions */}
      {hasChampions && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
              <Trophy className="w-4 h-4 text-amber-400" />
              Hall of Battle-Hardened Champions (Top {status?.champions.length})
            </h3>
            <span className="text-[11px] text-zinc-500">
              Survived all historical culls and proven across macro regimes
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {status?.champions.map((champ, idx) => (
              <div
                key={champ.genome.id}
                className="bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 rounded-xl p-3.5 flex flex-col justify-between transition group relative overflow-hidden"
              >
                {idx === 0 && (
                  <span className="absolute top-2 right-2 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold flex items-center gap-1">
                    <Flame className="w-3 h-3 text-amber-400" /> #1 SUPREME
                  </span>
                )}

                <div>
                  <div className="text-[10px] text-zinc-500 font-mono mb-1">
                    GEN {champ.generation}
                  </div>
                  <h5 className="text-xs font-bold text-zinc-200 truncate group-hover:text-amber-300 mb-2">
                    {champ.genome.id}
                  </h5>

                  <div className="space-y-1.5 text-[11px] border-t border-zinc-800/80 pt-2 mb-3">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">FITNESS</span>
                      <span className="font-bold text-emerald-400">{champ.fitness}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">SORTINO</span>
                      <span className="font-bold text-cyan-400">{champ.sortino}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">WIN RATE</span>
                      <span className="font-bold text-emerald-300">{champ.winRate}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">PROFIT FACTOR</span>
                      <span className="font-bold text-zinc-200">{champ.profitFactor}x</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">MAX DRAWDOWN</span>
                      <span className="font-bold text-rose-400">{champ.maxDrawdownPct}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">TRADES</span>
                      <span className="font-mono text-zinc-300">{champ.totalTrades}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-800 text-[10px] text-zinc-500">
                  <div className="truncate">
                    SL: <strong className="text-zinc-300">{champ.genome.stopLossBps} bps</strong> | TP: <strong className="text-zinc-300">{champ.genome.takeProfitBps} bps</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
