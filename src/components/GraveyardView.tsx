import React, { useState } from 'react';
import { Skull, Filter, Calendar, Clock, Award, AlertCircle } from 'lucide-react';
import { CullReason, GraveyardRecord } from '../types';

interface GraveyardViewProps {
  records: GraveyardRecord[];
}

export const GraveyardView: React.FC<GraveyardViewProps> = ({ records }) => {
  const [selectedReason, setSelectedReason] = useState<string>('ALL');

  const filteredRecords = records.filter(r => {
    if (selectedReason === 'ALL') return true;
    return r.cullReason === selectedReason;
  });

  const getReasonBadge = (reason: CullReason) => {
    switch (reason) {
      case 'DRAWDOWN_EXCEEDED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-400 border border-rose-800">
            DRAWDOWN &gt; 4.5%
          </span>
        );
      case 'SORTINO_DEGRADATION':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800">
            SORTINO &lt; 1.5
          </span>
        );
      case 'ADVERSE_EXCURSIONS':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-400 border border-purple-800">
            4 ADVERSE EXCURSIONS
          </span>
        );
      case 'RISK_VIOLATION':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-400 border border-red-800">
            RISK SENTINEL VETO
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-900 text-zinc-400 border border-zinc-700">
            {reason}
          </span>
        );
    }
  };

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-xs font-mono flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Skull className="w-4 h-4 text-rose-400" />
          <span className="font-bold text-zinc-200 text-sm tracking-wide">
            DARWINIAN EVOLUTIONARY GRAVEYARD
          </span>
          <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px]">
            {records.length} CULLED SPECIMENS
          </span>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-zinc-500" />
          <select
            value={selectedReason}
            onChange={e => setSelectedReason(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px] rounded px-2.5 py-1 focus:outline-none focus:border-zinc-700"
          >
            <option value="ALL">All Cull Reasons</option>
            <option value="DRAWDOWN_EXCEEDED">Drawdown Exceeded (&gt;4.5%)</option>
            <option value="SORTINO_DEGRADATION">Sortino Degradation (&lt;1.5)</option>
            <option value="ADVERSE_EXCURSIONS">4 Adverse Excursions</option>
            <option value="RISK_VIOLATION">Risk Sentinel Veto</option>
          </select>
        </div>
      </div>

      {/* Cemetery Table */}
      {filteredRecords.length > 0 ? (
        <div className="overflow-x-auto border border-zinc-800/80 rounded-md">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-900/90 text-zinc-400 border-b border-zinc-800 text-[11px]">
                <th className="py-2 px-3 font-semibold">TIME OF DEATH</th>
                <th className="py-2 px-3 font-semibold">AGENT ID</th>
                <th className="py-2 px-3 font-semibold">GEN</th>
                <th className="py-2 px-3 font-semibold">CAUSE OF DEATH</th>
                <th className="py-2 px-3 font-semibold">LIFESPAN</th>
                <th className="py-2 px-3 font-semibold">TRADES</th>
                <th className="py-2 px-3 font-semibold">FINAL PNL</th>
                <th className="py-2 px-3 font-semibold">FINAL SORTINO</th>
                <th className="py-2 px-3 font-semibold">AUTOPSY POST-MORTEM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {filteredRecords.map((item, idx) => {
                const deathTimeStr = new Date(item.timeOfDeath).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false,
                });

                return (
                  <tr key={`${item.agentId}-${idx}`} className="hover:bg-zinc-900/40 transition">
                    <td className="py-2 px-3 text-zinc-500 whitespace-nowrap">
                      {deathTimeStr}
                    </td>
                    <td className="py-2 px-3 font-semibold text-zinc-300">
                      {item.agentId}
                    </td>
                    <td className="py-2 px-3 text-zinc-400">
                      Gen {item.generation}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {getReasonBadge(item.cullReason)}
                    </td>
                    <td className="py-2 px-3 text-zinc-400 whitespace-nowrap">
                      {item.lifespanSeconds}s
                    </td>
                    <td className="py-2 px-3 text-zinc-400">
                      {item.totalTrades}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`font-semibold ${
                          item.finalRealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        ${item.finalRealizedPnL.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-zinc-300">
                      {item.finalSortino.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-zinc-400 max-w-xs truncate" title={item.cullDetail}>
                      {item.cullDetail}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-12 text-center text-zinc-600 border border-dashed border-zinc-800 rounded-md">
          The graveyard is calm. All active swarm specimens are meeting Darwinian fitness thresholds.
        </div>
      )}
    </div>
  );
};
