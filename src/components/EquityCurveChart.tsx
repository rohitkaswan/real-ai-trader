import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

interface EquityCurveChartProps {
  equityHistory: { timestamp: number; equity: number; drawdownPct: number }[];
  currentEquity: number;
  startingEquity: number;
  maxDailyDrawdownPct: number;
}

export const EquityCurveChart: React.FC<EquityCurveChartProps> = ({
  equityHistory,
  currentEquity,
  startingEquity,
  maxDailyDrawdownPct,
}) => {
  const chartData = equityHistory.map(item => ({
    time: new Date(item.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }),
    equity: item.equity,
    drawdownPct: item.drawdownPct,
  }));

  const netGain = currentEquity - startingEquity;
  const netGainPct = startingEquity > 0 ? (netGain / startingEquity) * 100 : 0;
  const minEquity = Math.min(...equityHistory.map(e => e.equity), currentEquity * 0.98);
  const maxEquity = Math.max(...equityHistory.map(e => e.equity), currentEquity * 1.02);

  // Circuit breaker price level
  const breakerThreshold = startingEquity * (1 - maxDailyDrawdownPct / 100);

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 flex flex-col h-[380px] text-xs font-mono">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <span className="font-bold text-zinc-200 tracking-wide text-sm">
            PORTFOLIO EQUITY CURVE
          </span>
          <span className="text-zinc-500">•</span>
          <span
            className={`font-semibold ${
              netGain >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {netGain >= 0 ? '+' : ''}
            ${netGain.toFixed(2)} ({netGainPct.toFixed(2)}%)
          </span>
        </div>

        <div className="flex items-center gap-4 text-[11px] text-zinc-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-emerald-400 rounded-full" />
            <span>Equity</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-rose-500/80 border-b border-dashed border-rose-500 rounded-full" />
            <span>3% Breaker</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 w-full min-h-0">
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 2" stroke="#27272a" />
              <XAxis
                dataKey="time"
                stroke="#71717a"
                tick={{ fill: '#71717a', fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[minEquity, maxEquity]}
                stroke="#71717a"
                tick={{ fill: '#71717a', fontSize: 10 }}
                tickFormatter={val => `$${val.toLocaleString()}`}
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
                formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Equity']}
              />
              <ReferenceLine
                y={breakerThreshold}
                stroke="#f43f5e"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: 'CIRCUIT BREAKER (3%)',
                  fill: '#f43f5e',
                  fontSize: 9,
                  position: 'insideBottomRight',
                }}
              />
              <Area
                type="monotone"
                dataKey="equity"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#equityGrad)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            Recording real-time equity curve telemetry...
          </div>
        )}
      </div>

      {/* Footer Metrics */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-900 text-zinc-500 text-[11px]">
        <div className="flex items-center gap-4">
          <span>CURRENT: ${currentEquity.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          <span>STARTING: ${startingEquity.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
        </div>
        <div>
          <span>CIRCUIT BREAKER FLOOR: ${breakerThreshold.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};
