import { QuantitativeMetricsCalculator } from '../quant/metrics';
import {
  AgentPerformanceMetrics,
  AgentState,
  AgentStatus,
  MarketTick,
  MicrostructureFeatures,
  OrderSide,
  SignalDirection,
  StrategyGenome,
  TradeRecord,
} from '../types/trading';

export class AlphaStrategyAgent {
  public id: string;
  public genome: StrategyGenome;
  public status: AgentStatus = 'ALIVE';
  public birthTimestamp: number;
  public deathTimestamp?: number;
  public metrics: AgentPerformanceMetrics;
  public recentTrades: TradeRecord[] = [];
  public initialCapital: number;
  public currentCapital: number;
  
  public activePosition: {
    symbol: string;
    side: OrderSide;
    entryPrice: number;
    size: number;
    entryTime: number;
    predictedConfidence: number;
    stopLossPrice: number;
    takeProfitPrice: number;
    holdingTicks: number;
  } | null = null;

  public lastSignal?: {
    direction: SignalDirection;
    confidence: number;
    timestamp: number;
    reason: string;
  };

  private consecutiveLossesCount = 0;

  constructor(genome: StrategyGenome, initialCapital = 1000) {
    this.id = genome.id;
    this.genome = genome;
    this.birthTimestamp = Date.now();
    this.initialCapital = initialCapital;
    this.currentCapital = initialCapital;
    this.metrics = QuantitativeMetricsCalculator.calculate([], this.currentCapital, this.initialCapital);
  }

  /**
   * Evaluates incoming microstructure features and current market tick.
   * Generates BUY / SELL / HOLD signal with strictly calibrated confidence.
   */
  public evaluate(
    features: MicrostructureFeatures,
    tick: MarketTick
  ): {
    direction: SignalDirection;
    confidence: number;
    stopLossPrice: number;
    takeProfitPrice: number;
    size: number;
    reason: string;
  } {
    // If agent is dead or probation, do not enter new trades
    if (this.status === 'TERMINATED') {
      return {
        direction: 'HOLD',
        confidence: 0,
        stopLossPrice: 0,
        takeProfitPrice: 0,
        size: 0,
        reason: 'AGENT_TERMINATED',
      };
    }

    // 1. Check existing position for Stop-Loss / Take-Profit / Max Holding
    if (this.activePosition) {
      this.activePosition.holdingTicks++;
      const currentPrice = tick.lastPrice;
      const pos = this.activePosition;

      let exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TIME_HORIZON' | null = null;

      if (pos.side === 'BUY') {
        if (currentPrice <= pos.stopLossPrice) exitReason = 'STOP_LOSS';
        else if (currentPrice >= pos.takeProfitPrice) exitReason = 'TAKE_PROFIT';
        else if (pos.holdingTicks >= this.genome.maxHoldingTicks) exitReason = 'TIME_HORIZON';
      } else {
        if (currentPrice >= pos.stopLossPrice) exitReason = 'STOP_LOSS';
        else if (currentPrice <= pos.takeProfitPrice) exitReason = 'TAKE_PROFIT';
        else if (pos.holdingTicks >= this.genome.maxHoldingTicks) exitReason = 'TIME_HORIZON';
      }

      if (exitReason) {
        return {
          direction: pos.side === 'BUY' ? 'SELL' : 'BUY', // Close action
          confidence: 0.95,
          stopLossPrice: 0,
          takeProfitPrice: 0,
          size: pos.size,
          reason: `CLOSE_${exitReason}`,
        };
      }

      return {
        direction: 'HOLD',
        confidence: pos.predictedConfidence,
        stopLossPrice: pos.stopLossPrice,
        takeProfitPrice: pos.takeProfitPrice,
        size: 0,
        reason: `HOLDING_TICK_${pos.holdingTicks}`,
      };
    }

    // 2. Risk check: If Parkinson volatility exceeds genome cutoff, avoid entry
    if (features.parkinsonVolatility > this.genome.parkinsonVolatilityCutoff) {
      this.lastSignal = {
        direction: 'HOLD',
        confidence: 0.1,
        timestamp: tick.timestamp,
        reason: `HIGH_VOLATILITY_${(features.parkinsonVolatility * 100).toFixed(3)}%`,
      };
      return { direction: 'HOLD', confidence: 0, stopLossPrice: 0, takeProfitPrice: 0, size: 0, reason: this.lastSignal.reason };
    }

    // 3. Multi-Factor Alpha Signal Generation:
    // Factors: Order Book Imbalance, VWAP Deviation Z, Momentum Z, Hurst Exponent
    const {
      imbalanceThreshold,
      vwapZEntryThreshold,
      hurstTrendThreshold,
      weightImbalance,
      weightVwapZ,
      weightMomentum,
      weightHurst,
    } = this.genome;

    // Normalize factor scores
    // Imbalance score: [-1, 1]
    const sImbalance = Math.max(-1, Math.min(1, features.orderBookImbalance / (imbalanceThreshold || 0.25)));

    // VWAP mean reversion or breakout
    // If Hurst < 0.5 (mean reverting), price below VWAP (negative Z) -> BUY, price above VWAP -> SELL
    // If Hurst > 0.5 (trending), price above VWAP -> momentum BUY
    const isTrending = features.hurstExponent > hurstTrendThreshold;
    const sVwap = isTrending
      ? Math.max(-1, Math.min(1, features.vwapDeviationZ / (vwapZEntryThreshold || 1.5)))
      : Math.max(-1, Math.min(1, -features.vwapDeviationZ / (vwapZEntryThreshold || 1.5)));

    // Momentum score: [-1, 1]
    const sMomentum = Math.max(-1, Math.min(1, features.momentumZ / 2.0));

    // Hurst regime affinity
    const sHurst = isTrending ? 0.5 : -0.5;

    // Weighted composite linear factor model
    const totalWeight = Math.max(0.01, weightImbalance + weightVwapZ + weightMomentum + weightHurst);
    const compositeAlpha =
      (sImbalance * weightImbalance +
        sVwap * weightVwapZ +
        sMomentum * weightMomentum +
        sHurst * weightHurst) /
      totalWeight;

    // Calibrated probability via logistic sigmoid: P = 1 / (1 + exp(-k * alpha))
    const calibratedProb = 1 / (1 + Math.exp(-2.2 * compositeAlpha));
    const confidence = Math.abs(calibratedProb - 0.5) * 2; // Range [0.0, 1.0]

    let direction: SignalDirection = 'HOLD';
    let reason = 'ALPHA_NEUTRAL';

    // Entry gating requires confidence >= 0.35 and alignment of composite alpha
    if (compositeAlpha > 0.35 && confidence >= 0.30) {
      direction = 'BUY';
      reason = `LONG_ALPHA_${compositeAlpha.toFixed(2)}_CONF_${(confidence * 100).toFixed(0)}%`;
    } else if (compositeAlpha < -0.35 && confidence >= 0.30) {
      direction = 'SELL';
      reason = `SHORT_ALPHA_${compositeAlpha.toFixed(2)}_CONF_${(confidence * 100).toFixed(0)}%`;
    }

    // Calculate stop-loss & take-profit thresholds based on Genome bps
    const mid = features.midPrice;
    let stopLossPrice = 0;
    let takeProfitPrice = 0;

    if (direction === 'BUY') {
      stopLossPrice = mid * (1 - this.genome.stopLossBps / 10000);
      takeProfitPrice = mid * (1 + this.genome.takeProfitBps / 10000);
    } else if (direction === 'SELL') {
      stopLossPrice = mid * (1 + this.genome.stopLossBps / 10000);
      takeProfitPrice = mid * (1 - this.genome.takeProfitBps / 10000);
    }

    // Half-Kelly Position Sizing: f* = p - (1-p)/b
    // b = takeProfitBps / stopLossBps
    const b = this.genome.takeProfitBps / Math.max(1, this.genome.stopLossBps);
    const p = calibratedProb;
    const kelly = (p * (b + 1) - 1) / Math.max(0.1, b);
    const halfKelly = Math.max(0.01, Math.min(0.20, (kelly / 2) * this.genome.kellyFraction));

    // Size in quote currency (USD) scaled by current available capital
    const positionCapital = this.currentCapital * halfKelly;
    const size = mid > 0 ? positionCapital / mid : 0;

    this.lastSignal = {
      direction,
      confidence,
      timestamp: tick.timestamp,
      reason,
    };

    return {
      direction,
      confidence,
      stopLossPrice,
      takeProfitPrice,
      size,
      reason,
    };
  }

  /**
   * Records execution fill and opens active position
   */
  public openPosition(
    symbol: string,
    side: OrderSide,
    entryPrice: number,
    size: number,
    stopLossPrice: number,
    takeProfitPrice: number,
    confidence: number
  ): void {
    this.activePosition = {
      symbol,
      side,
      entryPrice,
      size,
      entryTime: Date.now(),
      predictedConfidence: confidence,
      stopLossPrice,
      takeProfitPrice,
      holdingTicks: 0,
    };
  }

  /**
   * Closes active position and updates rolling metrics
   */
  public closePosition(
    exitPrice: number,
    exitTime: number,
    exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TIME_HORIZON' | 'SENTINEL_LIQUIDATION' | 'REAPER_CULL',
    feeRate = 0.0004, // 4 bps fee
    slippageBps = 1.5
  ): TradeRecord | null {
    if (!this.activePosition) return null;

    const pos = this.activePosition;
    const notional = pos.size * pos.entryPrice;
    
    // Price movement return
    const priceDiff = pos.side === 'BUY' ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice;
    const grossPnL = pos.size * priceDiff;

    // Fees: Entry + Exit notional * feeRate
    const fees = notional * feeRate * 2;
    // Slippage penalty
    const slippage = notional * (slippageBps / 10000);
    const netPnL = grossPnL - fees - slippage;
    const returnPct = notional > 0 ? (netPnL / notional) * 100 : 0;

    const isProfitable = netPnL > 0;
    const wasAdverseExcursion = exitReason === 'STOP_LOSS' || (!isProfitable && Math.abs(returnPct) > 0.4);

    if (wasAdverseExcursion) {
      this.consecutiveLossesCount++;
    } else if (isProfitable) {
      this.consecutiveLossesCount = 0;
    }

    const trade: TradeRecord = {
      id: `TRD-${this.id.slice(-6)}-${Date.now().toString(36)}`,
      agentId: this.id,
      symbol: pos.symbol,
      side: pos.side,
      entryPrice: pos.entryPrice,
      exitPrice,
      size: pos.size,
      entryTime: pos.entryTime,
      exitTime,
      grossPnL,
      fees,
      slippage,
      netPnL,
      returnPct,
      wasAdverseExcursion,
      predictedConfidence: pos.predictedConfidence,
      isProfitable,
      exitReason,
    };

    this.recentTrades.push(trade);
    if (this.recentTrades.length > 200) {
      this.recentTrades.shift();
    }

    this.currentCapital = Math.max(0, this.currentCapital + netPnL);
    this.metrics = QuantitativeMetricsCalculator.calculate(
      this.recentTrades,
      this.currentCapital,
      this.initialCapital
    );

    this.activePosition = null;
    return trade;
  }

  public getConsecutiveLosses(): number {
    return this.consecutiveLossesCount;
  }

  public getState(): AgentState {
    return {
      genome: this.genome,
      status: this.status,
      birthTimestamp: this.birthTimestamp,
      deathTimestamp: this.deathTimestamp,
      metrics: this.metrics,
      recentTrades: this.recentTrades.slice(-20),
      activePosition: this.activePosition,
      lastSignal: this.lastSignal,
    };
  }
}
