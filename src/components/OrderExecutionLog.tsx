import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { OrderExecutionResult, OrderStatus } from '../types';

interface OrderExecutionLogProps {
  executions: OrderExecutionResult[];
}

export const OrderExecutionLog: React.FC<OrderExecutionLogProps> = ({ executions }) => {
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'FILLED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
            <CheckCircle2 className="w-3 h-3" /> FILLED
          </span>
        );
      case 'REJECTED':
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-400 border border-rose-800">
            <XCircle className="w-3 h-3" /> {status}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-900 text-zinc-300 border border-zinc-700">
            <Clock className="w-3 h-3 animate-spin" /> {status}
          </span>
        );
    }
  };

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-xs font-mono flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-zinc-200 text-sm tracking-wide">
            EXECUTION AUDIT &amp; STATE MACHINE LOG
          </span>
          <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px]">
            {executions.length} RECENT DEALS
          </span>
        </div>
        <span className="text-[11px] text-zinc-400">
          Slippage defense &bull; Deterministic state transitions
        </span>
      </div>

      {/* Table */}
      {executions.length > 0 ? (
        <div className="overflow-x-auto border border-zinc-800/80 rounded-md">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-900/90 text-zinc-400 border-b border-zinc-800 text-[11px]">
                <th className="py-2.5 px-3 font-semibold">ORDER ID</th>
                <th className="py-2.5 px-3 font-semibold">AGENT</th>
                <th className="py-2.5 px-3 font-semibold">SIDE</th>
                <th className="py-2.5 px-3 font-semibold">STATUS</th>
                <th className="py-2.5 px-3 font-semibold">SIZE</th>
                <th className="py-2.5 px-3 font-semibold">FILL PRICE</th>
                <th className="py-2.5 px-3 font-semibold">SLIPPAGE</th>
                <th className="py-2.5 px-3 font-semibold">FEES</th>
                <th className="py-2.5 px-3 font-semibold">BROKER TICKET</th>
                <th className="py-2.5 px-3 font-semibold">LIFECYCLE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {executions.map(exec => {
                const isExpanded = expandedOrderId === exec.orderId;
                const isBuy = exec.side === 'BUY';

                return (
                  <React.Fragment key={exec.orderId}>
                    <tr
                      onClick={() => setExpandedOrderId(isExpanded ? null : exec.orderId)}
                      className="hover:bg-zinc-900/50 transition cursor-pointer"
                    >
                      <td className="py-2 px-3 text-zinc-400 font-medium">
                        {exec.orderId.substring(0, 14)}...
                      </td>
                      <td className="py-2 px-3 text-zinc-200">
                        {exec.agentId}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`font-bold ${
                            isBuy ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {exec.side}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        {getStatusBadge(exec.status)}
                      </td>
                      <td className="py-2 px-3 text-zinc-300">
                        {exec.filledSize > 0 ? exec.filledSize.toFixed(3) : exec.requestedSize.toFixed(3)}
                      </td>
                      <td className="py-2 px-3 text-zinc-200">
                        {exec.averagePrice > 0 ? `$${exec.averagePrice.toFixed(2)}` : '—'}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`${
                            exec.slippageBps > 10 ? 'text-amber-400 font-bold' : 'text-zinc-400'
                          }`}
                        >
                          {exec.slippageBps.toFixed(2)} bps
                        </span>
                      </td>
                      <td className="py-2 px-3 text-zinc-400">
                        ${exec.fees.toFixed(3)}
                      </td>
                      <td className="py-2 px-3 text-zinc-400">
                        {exec.brokerTicket || '—'}
                      </td>
                      <td className="py-2 px-3 text-zinc-500">
                        <span className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200">
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          {exec.lifecycle.length} steps
                        </span>
                      </td>
                    </tr>

                    {/* Expanded Lifecycle State Transition Drawer */}
                    {isExpanded && (
                      <tr className="bg-zinc-900/40">
                        <td colSpan={10} className="p-3 border-b border-zinc-800/80">
                          <div className="bg-zinc-950 p-3 rounded border border-zinc-800">
                            <span className="text-zinc-500 font-bold block mb-2 text-[10px] uppercase tracking-wider">
                              Deterministic State Machine Transitions
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                              {exec.lifecycle.map((step, idx) => (
                                <React.Fragment key={idx}>
                                  <div className="flex flex-col bg-zinc-900 px-2.5 py-1.5 rounded border border-zinc-800">
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                      <span className="font-bold text-zinc-200 text-[10px]">
                                        {step.status}
                                      </span>
                                    </div>
                                    <span className="text-[9px] text-zinc-500 mt-0.5">
                                      {step.note || new Date(step.timestamp).toLocaleTimeString()}
                                    </span>
                                  </div>
                                  {idx < exec.lifecycle.length - 1 && (
                                    <ArrowRight className="w-3.5 h-3.5 text-zinc-600" />
                                  )}
                                </React.Fragment>
                              ))}
                            </div>
                            {exec.errorMessage && (
                              <div className="mt-2 text-rose-400 text-[11px] bg-rose-950/40 p-2 rounded border border-rose-900">
                                Error Detail: {exec.errorMessage}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-12 text-center text-zinc-600 border border-dashed border-zinc-800 rounded-md">
          Awaiting order requests from the active swarm...
        </div>
      )}
    </div>
  );
};
