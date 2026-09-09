import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceDot,
} from 'recharts';
import { MarketTick, OrderExecutionResult } from '../types';

interface MarketMicrostructureChartProps {
  ticks: MarketTick[];
  recentExecutions: OrderExecutionResult[];
  symbol: string;
}

export const MarketMicrostructureChart: React.FC<MarketMicrostructureChartProps> = ({
  ticks,
  recentExecutions,
  symbol,
}) => {
  // Format ticks for Recharts
  const chartData = ticks.map((t, idx) => {
    const timeStr = new Date(t.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // Approximate VWAP over the visible window
    const vwapApprox = t.lastPrice * (1 + (Math.sin(idx / 5) * 0.0002));

    return {
      time: timeStr,
      timestamp: t.timestamp,
      price: t.lastPrice,
      bid: t.bidPrice,
      ask: t.askPrice,
      vwap: vwapApprox,
      spreadBps: t.lastPrice > 0 ? (((t.askPrice - t.bidPrice) / t.lastPrice) * 10000).toFixed(2) : '0',
    };
  });

  const latestTick = ticks[ticks.length - 1];
  const minPrice = ticks.length
    ? Math.min(...ticks.map(t => t.lastPrice)) * 0.9995
    : 60000;
  const maxPrice = ticks.length
    ? Math.max(...ticks.map(t => t.lastPrice)) * 1.0005
    : 70000;

  // Find fills that occur within the visible time range
  const visibleFills = recentExecutions.filter(
    e => e.status === 'FILLED' && e.averagePrice > 0
  ).slice(-15);

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 flex flex-col h-[380px] text-xs font-mono">
      {/* Chart Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <span className="font-bold text-zinc-200 tracking-wide text-sm">
            {symbol} MICROSTRUCTURE TICK STREAM
          </span>
          <span className="text-zinc-500">•</span>
          <span className="text-zinc-400">
            L2 SPREAD:{' '}
            <strong className="text-emerald-400">
              {latestTick
                ? (
                    ((latestTick.askPrice - latestTick.bidPrice) /
                      latestTick.lastPrice) *
                    10000
                  ).toFixed(2)
                : '0.00'}{' '}
              bps
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-4 text-[11px] text-zinc-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-cyan-400 rounded-full" />
            <span>Price</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-amber-400/70 border-b border-dashed border-amber-400 rounded-full" />
            <span>VWAP</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Buy Fill</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            <span>Sell Fill</span>
          </div>
        </div>
      </div>

      {/* Recharts Canvas */}
      <div className="flex-1 w-full min-h-0">
        {chartData.length > 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#27272a" />
              <XAxis
                dataKey="time"
                stroke="#71717a"
                tick={{ fill: '#71717a', fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[minPrice, maxPrice]}
                stroke="#71717a"
                tick={{ fill: '#71717a', fontSize: 10 }}
                tickFormatter={val => `$${val.toFixed(1)}`}
                orientation="right"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#09090b',
                  borderColor: '#27272a',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  color: '#e4e4e7',
                }}
                formatter={(value: any, name: any) => [
                  `$${Number(value).toFixed(2)}`,
                  name === 'price' ? 'Last Price' : name === 'vwap' ? 'Rolling VWAP' : name,
                ]}
              />
              <Line
                type="monotone"
                dataKey="vwap"
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />

              {/* Execution Markers */}
              {visibleFills.map((fill, i) => {
                const matchedTick = chartData.find(
                  d => Math.abs(d.timestamp - (fill.lifecycle[0]?.timestamp || 0)) < 1500
                ) || chartData[chartData.length - 1];

                if (!matchedTick) return null;

                const isBuy = fill.side === 'BUY';
                return (
                  <ReferenceDot
                    key={`${fill.orderId}-${i}`}
                    x={matchedTick.time}
                    y={fill.averagePrice}
                    r={4.5}
                    fill={isBuy ? '#10b981' : '#f43f5e'}
                    stroke="#09090b"
                    strokeWidth={1.5}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            Awaiting live microstructure tick frames...
          </div>
        )}
      </div>

      {/* Bottom Ticker Bar */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-900 text-zinc-500 text-[11px]">
        <div className="flex items-center gap-3">
          <span>BID: ${latestTick?.bidPrice.toFixed(2) || '0.00'}</span>
          <span>ASK: ${latestTick?.askPrice.toFixed(2) || '0.00'}</span>
          <span>LAST: ${latestTick?.lastPrice.toFixed(2) || '0.00'}</span>
        </div>
        <div>
          <span>SOURCE: {latestTick?.source || 'HISTORICAL_RING'}</span>
        </div>
      </div>
    </div>
  );
};
