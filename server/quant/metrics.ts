import { AgentPerformanceMetrics, TradeRecord } from '../types/trading';

export class QuantitativeMetricsCalculator {
  /**
   * Calculates comprehensive quantitative performance metrics for an agent.
   * Net of exchange fees and slippage.
   */
  public static calculate(
    trades: TradeRecord[],
    currentCapital: number,
    initialCapital: number
  ): AgentPerformanceMetrics {
    const totalTrades = trades.length;
    if (totalTrades === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        consecutiveLosses: 0,
        winRate: 0,
        grossProfit: 0,
        grossLoss: 0,
        profitFactor: 1.0,
        realizedPnL: 0,
        peakPnL: 0,
        currentDrawdownPct: 0,
        maxDrawdownPct: 0,
        sortinoRatio: 2.0, // Default prior for fresh agents
        calmarRatio: 2.0,
        brierScore: 0.25,  // Uninformed prior (0.5 - y)^2 = 0.25
        capitalAllocation: currentCapital,
      };
    }

    let winningTrades = 0;
    let losingTrades = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let realizedPnL = 0;

    let consecutiveLosses = 0;
    let maxConsecutiveLosses = 0;

    let runningEquity = initialCapital;
    let peakEquity = initialCapital;
    let maxDrawdownPct = 0;

    const returns: number[] = [];
    let brierSum = 0;

    for (const trade of trades) {
      realizedPnL += trade.netPnL;
      runningEquity += trade.netPnL;

      if (runningEquity > peakEquity) {
        peakEquity = runningEquity;
      }

      const currentDd = peakEquity > 0 ? ((peakEquity - runningEquity) / peakEquity) * 100 : 0;
      if (currentDd > maxDrawdownPct) {
        maxDrawdownPct = currentDd;
      }

      if (trade.netPnL > 0) {
        winningTrades++;
        grossProfit += trade.netPnL;
        consecutiveLosses = 0;
      } else {
        losingTrades++;
        grossLoss += Math.abs(trade.netPnL);
        consecutiveLosses++;
        if (consecutiveLosses > maxConsecutiveLosses) {
          maxConsecutiveLosses = consecutiveLosses;
        }
      }

      returns.push(trade.returnPct);

      // Brier score: (predictedProbability - actualOutcome)^2
      const outcome = trade.netPnL > 0 ? 1 : 0;
      const confidence = Math.max(0, Math.min(1, trade.predictedConfidence));
      const brierDiff = confidence - outcome;
      brierSum += brierDiff * brierDiff;
    }

    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 10.0 : 1.0;
    const currentDrawdownPct = peakEquity > 0 ? Math.max(0, ((peakEquity - runningEquity) / peakEquity) * 100) : 0;
    const brierScore = totalTrades > 0 ? brierSum / totalTrades : 0.25;

    // Sortino Ratio: (Mean Return - Rf) / Downside Deviation
    // Risk-free rate assumed 0 for intraday microstructure
    const meanReturn = returns.reduce((a, b) => a + b, 0) / totalTrades;
    let sumDownsideSq = 0;
    let downsideCount = 0;

    for (const r of returns) {
      if (r < 0) {
        sumDownsideSq += r * r;
        downsideCount++;
      }
    }

    const downsideDev = downsideCount > 0 ? Math.sqrt(sumDownsideSq / totalTrades) : 0.0001;
    // Annualized Sortino assuming ~200 trades/day: sqrt(252 * 200) scale or per-trade annualized
    const sortinoRatio = downsideDev > 1e-6 ? (meanReturn / downsideDev) * Math.sqrt(totalTrades >= 30 ? 30 : totalTrades) : (meanReturn > 0 ? 3.0 : 0.5);

    // Calmar Ratio: Cumulative Return % / Max Drawdown %
    const totalReturnPct = initialCapital > 0 ? ((runningEquity - initialCapital) / initialCapital) * 100 : 0;
    const calmarRatio = maxDrawdownPct > 0 ? totalReturnPct / maxDrawdownPct : Math.max(0, totalReturnPct);

    return {
      totalTrades,
      winningTrades,
      losingTrades,
      consecutiveLosses,
      winRate,
      grossProfit,
      grossLoss,
      profitFactor,
      realizedPnL,
      peakPnL: peakEquity - initialCapital,
      currentDrawdownPct,
      maxDrawdownPct,
      sortinoRatio: Number.isFinite(sortinoRatio) ? Math.max(-5, Math.min(10, sortinoRatio)) : 0,
      calmarRatio: Number.isFinite(calmarRatio) ? Math.max(-5, Math.min(10, calmarRatio)) : 0,
      brierScore,
      capitalAllocation: Math.max(0, runningEquity),
    };
  }
}
