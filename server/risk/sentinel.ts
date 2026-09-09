import { MarketTick, OrderRequest, RiskSentinelLimits } from '../types/trading';

export class ChiefRiskSentinel {
  private limits: RiskSentinelLimits;
  private totalDailyEquityPeak: number;

  constructor(initialEquity = 100000) {
    this.limits = {
      maxRiskPerTradeEquityPct: 1.5, // 1.5% max risk per trade
      maxDailyDrawdownEquityPct: 3.0, // 3.0% daily circuit breaker
      maxSpreadBps: 8.0,              // 8 bps max allowable spread
      maxTickLatencyMs: 150,          // 150 ms latency threshold
      circuitBreakerTripped: false,
      killSwitchActive: false,
      totalAccountEquity: initialEquity,
      dailyStartingEquity: initialEquity,
      currentDailyDrawdownPct: 0,
    };
    this.totalDailyEquityPeak = initialEquity;
  }

  public getLimits(): RiskSentinelLimits {
    return { ...this.limits };
  }

  public updateLimits(partial: Partial<RiskSentinelLimits>): RiskSentinelLimits {
    if (typeof partial.maxRiskPerTradeEquityPct === 'number') {
      this.limits.maxRiskPerTradeEquityPct = Math.max(0.2, Math.min(5.0, partial.maxRiskPerTradeEquityPct));
    }
    if (typeof partial.maxDailyDrawdownEquityPct === 'number') {
      this.limits.maxDailyDrawdownEquityPct = Math.max(1.0, Math.min(10.0, partial.maxDailyDrawdownEquityPct));
    }
    if (typeof partial.maxSpreadBps === 'number') {
      this.limits.maxSpreadBps = Math.max(2.0, Math.min(50.0, partial.maxSpreadBps));
    }
    if (typeof partial.maxTickLatencyMs === 'number') {
      this.limits.maxTickLatencyMs = Math.max(20, Math.min(1000, partial.maxTickLatencyMs));
    }
    return { ...this.limits };
  }

  public setKillSwitch(active: boolean): void {
    this.limits.killSwitchActive = active;
  }

  public resetCircuitBreaker(): void {
    this.limits.circuitBreakerTripped = false;
    this.limits.circuitBreakerTrippedTime = undefined;
    this.limits.dailyStartingEquity = this.limits.totalAccountEquity;
    this.totalDailyEquityPeak = this.limits.totalAccountEquity;
    this.limits.currentDailyDrawdownPct = 0;
  }

  /**
   * Updates total portfolio equity and evaluates circuit breaker
   */
  public updatePortfolioEquity(currentEquity: number): { circuitBreakerTriggered: boolean; drawdownPct: number } {
    this.limits.totalAccountEquity = currentEquity;
    if (currentEquity > this.totalDailyEquityPeak) {
      this.totalDailyEquityPeak = currentEquity;
    }

    const drawdownPct = this.totalDailyEquityPeak > 0
      ? ((this.totalDailyEquityPeak - currentEquity) / this.totalDailyEquityPeak) * 100
      : 0;

    this.limits.currentDailyDrawdownPct = drawdownPct;

    // Circuit Breaker: Immediate liquidation & trading halt if daily drawdown > 3.0%
    if (drawdownPct >= this.limits.maxDailyDrawdownEquityPct && !this.limits.circuitBreakerTripped) {
      this.limits.circuitBreakerTripped = true;
      this.limits.circuitBreakerTrippedTime = Date.now();
      return { circuitBreakerTriggered: true, drawdownPct };
    }

    return { circuitBreakerTriggered: false, drawdownPct };
  }

  /**
   * Deterministic Risk Firewall Evaluation for incoming order request
   */
  public evaluateOrder(
    order: OrderRequest,
    currentTick: MarketTick
  ): {
    approved: boolean;
    adjustedSize: number;
    reason?: string;
  } {
    // 1. Manual Kill-Switch Check
    if (this.limits.killSwitchActive) {
      return { approved: false, adjustedSize: 0, reason: 'FIREWALL_REJECT_KILL_SWITCH_ACTIVE' };
    }

    // 2. Daily Drawdown Circuit Breaker Check
    if (this.limits.circuitBreakerTripped) {
      return { approved: false, adjustedSize: 0, reason: 'FIREWALL_REJECT_CIRCUIT_BREAKER_TRIPPED_DAILY_DD_EXCEEDED' };
    }

    // 3. Tick Feed Latency Gating (> 150ms)
    if (currentTick.latencyMs > this.limits.maxTickLatencyMs) {
      return {
        approved: false,
        adjustedSize: 0,
        reason: `FIREWALL_REJECT_FEED_LATENCY_STALE_${currentTick.latencyMs}ms_THRESHOLD_${this.limits.maxTickLatencyMs}ms`,
      };
    }

    // 4. Spread & Data Quality Gating (> 8 bps)
    const midPrice = (currentTick.bidPrice + currentTick.askPrice) / 2;
    const spreadBps = midPrice > 0 ? ((currentTick.askPrice - currentTick.bidPrice) / midPrice) * 10000 : 999;
    if (spreadBps > this.limits.maxSpreadBps) {
      return {
        approved: false,
        adjustedSize: 0,
        reason: `FIREWALL_REJECT_SPREAD_TOO_WIDE_${spreadBps.toFixed(2)}bps_THRESHOLD_${this.limits.maxSpreadBps}bps`,
      };
    }

    // 5. Half-Kelly Max Risk Per Trade Firewall (1.0% - 1.5% max risk)
    const maxRiskDollars = this.limits.totalAccountEquity * (this.limits.maxRiskPerTradeEquityPct / 100);
    const stopLossDistance = order.stopLossPrice
      ? Math.abs(currentTick.lastPrice - order.stopLossPrice)
      : currentTick.lastPrice * 0.005; // default 50 bps

    const notionalRisk = order.size * stopLossDistance;

    let adjustedSize = order.size;
    if (notionalRisk > maxRiskDollars && stopLossDistance > 0) {
      // Scale down size strictly to satisfy 1.5% Half-Kelly risk ceiling
      adjustedSize = maxRiskDollars / stopLossDistance;
    }

    // Ensure adjusted size is positive
    if (adjustedSize <= 0) {
      return { approved: false, adjustedSize: 0, reason: 'FIREWALL_REJECT_ZERO_ADJUSTED_SIZE' };
    }

    return {
      approved: true,
      adjustedSize,
    };
  }
}
