import React, { useState } from 'react';
import {
  Trophy,
  Dna,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Info,
  Layers,
  ChevronRight,
  Shield,
  Eye,
} from 'lucide-react';
import { AgentState, StrategyGenome } from '../types';

interface ActiveSwarmLeaderboardProps {
  agents: AgentState[];
  onSelectAgent?: (agent: AgentState) => void;
}

export const ActiveSwarmLeaderboard: React.FC<ActiveSwarmLeaderboardProps> = ({
  agents,
  onSelectAgent,
}) => {
  const [selectedGenome, setSelectedGenome] = useState<{ id: string; genome: StrategyGenome } | null>(null);

  // Rank active agents by Sortino Ratio (descending)
  const sortedAgents = [...agents].sort((a, b) => {
    return b.metrics.sortinoRatio - a.metrics.sortinoRatio;
  });

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-xs font-mono flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-zinc-200 text-sm tracking-wide">
            SWARM TOURNAMENT LEADERBOARD
          </span>
          <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px]">
            {agents.length} AGENTS ACTIVE
          </span>
        </div>
        <span className="text-[11px] text-zinc-400">
          Ranked by Sortino Ratio &bull; Cull threshold: DD &gt; 4.5% | Sortino &lt; 1.5 | 4 Losses
        </span>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto border border-zinc-800/80 rounded-md">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-zinc-900/90 text-zinc-400 border-b border-zinc-800 text-[11px]">
              <th className="py-2.5 px-3 font-semibold">RANK</th>
              <th className="py-2.5 px-3 font-semibold">AGENT ID</th>
              <th className="py-2.5 px-3 font-semibold">GEN</th>
              <th className="py-2.5 px-3 font-semibold">SORTINO</th>
              <th className="py-2.5 px-3 font-semibold">CALMAR</th>
              <th className="py-2.5 px-3 font-semibold">BRIER</th>
              <th className="py-2.5 px-3 font-semibold">WIN RATE</th>
              <th className="py-2.5 px-3 font-semibold">CURRENT DD</th>
              <th className="py-2.5 px-3 font-semibold">REALIZED PNL</th>
              <th className="py-2.5 px-3 font-semibold">ACTIVE POS</th>
              <th className="py-2.5 px-3 font-semibold">GENOME</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {sortedAgents.map((agent, index) => {
              const rank = index + 1;
              const isChampion = rank <= 3;
              const inDanger =
                agent.metrics.currentDrawdownPct > 3.2 ||
                agent.metrics.consecutiveLosses >= 3 ||
                (agent.metrics.totalTrades >= 5 && agent.metrics.sortinoRatio < 1.7);

              const winRatePct = (agent.metrics.winRate * 100).toFixed(1);
              const pnl = agent.metrics.realizedPnL;

              return (
                <tr
                  key={agent.genome.id}
                  className={`hover:bg-zinc-900/60 transition ${
                    isChampion ? 'bg-amber-950/10' : inDanger ? 'bg-rose-950/20' : ''
                  }`}
                >
                  {/* Rank */}
                  <td className="py-2 px-3">
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                        rank === 1
                          ? 'bg-amber-400 text-zinc-950'
                          : rank === 2
                          ? 'bg-zinc-300 text-zinc-950'
                          : rank === 3
                          ? 'bg-amber-700 text-amber-100'
                          : 'text-zinc-500'
                      }`}
                    >
                      {rank}
                    </span>
                  </td>

                  {/* Agent ID */}
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-zinc-200">
                        {agent.genome.id}
                      </span>
                      {inDanger && (
                        <span
                          className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-950 text-rose-400 border border-rose-800"
                          title="High mortality risk: nearing deterministic cull conditions"
                        >
                          AT RISK
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Generation */}
                  <td className="py-2 px-3 text-zinc-400">
                    Gen {agent.genome.generation}
                  </td>

                  {/* Sortino */}
                  <td className="py-2 px-3">
                    <span
                      className={`font-semibold ${
                        agent.metrics.sortinoRatio >= 2.0
                          ? 'text-emerald-400'
                          : agent.metrics.sortinoRatio < 1.6
                          ? 'text-rose-400'
                          : 'text-zinc-200'
                      }`}
                    >
                      {agent.metrics.sortinoRatio.toFixed(2)}
                    </span>
                  </td>

                  {/* Calmar */}
                  <td className="py-2 px-3 text-zinc-300">
                    {agent.metrics.calmarRatio.toFixed(2)}
                  </td>

                  {/* Brier */}
                  <td className="py-2 px-3 text-zinc-400" title="Brier Score (lower is better calibrated)">
                    {agent.metrics.brierScore.toFixed(3)}
                  </td>

                  {/* Win Rate */}
                  <td className="py-2 px-3 text-zinc-300">
                    {winRatePct}% ({agent.metrics.winningTrades}/{agent.metrics.totalTrades})
                  </td>

                  {/* Current DD */}
                  <td className="py-2 px-3">
                    <span
                      className={`${
                        agent.metrics.currentDrawdownPct > 3.0
                          ? 'text-rose-400 font-bold'
                          : 'text-zinc-400'
                      }`}
                    >
                      {agent.metrics.currentDrawdownPct.toFixed(2)}%
                    </span>
                  </td>

                  {/* Realized PnL */}
                  <td className="py-2 px-3">
                    <span
                      className={`font-semibold ${
                        pnl > 0
                          ? 'text-emerald-400'
                          : pnl < 0
                          ? 'text-rose-400'
                          : 'text-zinc-400'
                      }`}
                    >
                      {pnl > 0 ? '+' : ''}${pnl.toFixed(2)}
                    </span>
                  </td>

                  {/* Active Position */}
                  <td className="py-2 px-3">
                    {agent.activePosition ? (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                          agent.activePosition.side === 'BUY'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}
                      >
                        {agent.activePosition.side} @ ${agent.activePosition.entryPrice.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-zinc-600">IDLE</span>
                    )}
                  </td>

                  {/* Genome Inspector Action */}
                  <td className="py-2 px-3">
                    <button
                      onClick={() =>
                        setSelectedGenome({ id: agent.genome.id, genome: agent.genome })
                      }
                      className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-[10px] transition"
                    >
                      <Dna className="w-3 h-3 text-cyan-400" />
                      <span>DNA</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Genome Inspection Modal */}
      {selectedGenome && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5 max-w-lg w-full font-mono text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Dna className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-zinc-100 text-sm">
                  GENOME ARCHITECTURE: {selectedGenome.id}
                </h3>
              </div>
              <button
                onClick={() => setSelectedGenome(null)}
                className="text-zinc-400 hover:text-zinc-100 text-sm px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-zinc-300">
              <div className="grid grid-cols-2 gap-2 bg-zinc-900/60 p-3 rounded border border-zinc-800">
                <div>
                  <span className="text-zinc-500">Generation:</span>
                  <p className="font-semibold text-zinc-200">
                    Gen {selectedGenome.genome.generation}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-500">Parent Champions:</span>
                  <p className="font-semibold text-zinc-200">
                    {selectedGenome.genome.parentIds.length > 0
                      ? selectedGenome.genome.parentIds.join(', ')
                      : 'Founder Seed Gen 0'}
                  </p>
                </div>
              </div>

              <div className="bg-zinc-900/60 p-3 rounded border border-zinc-800 space-y-2">
                <span className="text-zinc-500 font-bold block mb-1">
                  QUANTITATIVE SIGNAL WEIGHTS (SUM = 1.0)
                </span>
                <div className="space-y-1.5">
                  <div>
                    <div className="flex justify-between text-[11px]">
                      <span>Level-2 Imbalance Weight:</span>
                      <span className="text-cyan-400 font-bold">
                        {selectedGenome.genome.weightImbalance.toFixed(3)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px]">
                      <span>VWAP Z-Score Weight:</span>
                      <span className="text-cyan-400 font-bold">
                        {selectedGenome.genome.weightVwapZ.toFixed(3)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px]">
                      <span>Momentum Z-Score Weight:</span>
                      <span className="text-cyan-400 font-bold">
                        {selectedGenome.genome.weightMomentum.toFixed(3)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px]">
                      <span>Hurst Trend Exponent Weight:</span>
                      <span className="text-cyan-400 font-bold">
                        {selectedGenome.genome.weightHurst.toFixed(3)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-zinc-900/60 p-3 rounded border border-zinc-800">
                <div>
                  <span className="text-zinc-500">Half-Kelly Fraction:</span>
                  <p className="font-semibold text-zinc-200">
                    {(selectedGenome.genome.kellyFraction * 100).toFixed(2)}%
                  </p>
                </div>
                <div>
                  <span className="text-zinc-500">Parkinson Cutoff:</span>
                  <p className="font-semibold text-zinc-200">
                    {(selectedGenome.genome.parkinsonVolatilityCutoff * 100).toFixed(2)}%
                  </p>
                </div>
                <div>
                  <span className="text-zinc-500">Stop Loss:</span>
                  <p className="font-semibold text-rose-400">
                    {selectedGenome.genome.stopLossBps} bps
                  </p>
                </div>
                <div>
                  <span className="text-zinc-500">Take Profit:</span>
                  <p className="font-semibold text-emerald-400">
                    {selectedGenome.genome.takeProfitBps} bps
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-zinc-800 flex justify-end">
              <button
                onClick={() => setSelectedGenome(null)}
                className="px-4 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-mono transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
