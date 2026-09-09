import { AlphaStrategyAgent } from './agent';
import { CullReason, GraveyardRecord, TradeRecord } from '../types/trading';

export interface CullEvaluation {
  shouldCull: boolean;
  reason?: CullReason;
  detail?: string;
}

export class DarwinianReaperEngine {
  // Strict Cull Thresholds
  public static readonly MAX_DRAWDOWN_PCT_LIMIT = 4.5;
  public static readonly MIN_SORTINO_RATIO = 1.5;
  public static readonly SORTINO_MIN_TRADES_WINDOW = 50;
  public static readonly MAX_CONSECUTIVE_ADVERSE_EXCURSIONS = 4;

  /**
   * Deterministically evaluates whether an agent must be terminated.
   */
  public static evaluateAgent(agent: AlphaStrategyAgent): CullEvaluation {
    if (agent.status === 'TERMINATED') {
      return { shouldCull: false };
    }

    const { metrics } = agent;

    // 1. Peak-to-Trough Drawdown Breach (> 4.5%)
    if (metrics.currentDrawdownPct > this.MAX_DRAWDOWN_PCT_LIMIT || metrics.maxDrawdownPct > this.MAX_DRAWDOWN_PCT_LIMIT) {
      return {
        shouldCull: true,
        reason: 'DRAWDOWN_EXCEEDED',
        detail: `Drawdown breached 4.5% limit: current=${metrics.currentDrawdownPct.toFixed(2)}%, max=${metrics.maxDrawdownPct.toFixed(2)}%`,
      };
    }

    // 2. 4 Consecutive Adverse Excursions
    if (agent.getConsecutiveLosses() >= this.MAX_CONSECUTIVE_ADVERSE_EXCURSIONS) {
      return {
        shouldCull: true,
        reason: 'ADVERSE_EXCURSIONS',
        detail: `Incurred ${agent.getConsecutiveLosses()} consecutive adverse excursions (limit ${this.MAX_CONSECUTIVE_ADVERSE_EXCURSIONS})`,
      };
    }

    // 3. Sortino Ratio Degradation (< 1.5 over rolling 50-trade evaluation window)
    if (metrics.totalTrades >= this.SORTINO_MIN_TRADES_WINDOW && metrics.sortinoRatio < this.MIN_SORTINO_RATIO) {
      return {
        shouldCull: true,
        reason: 'SORTINO_DEGRADATION',
        detail: `Sortino ratio degraded to ${metrics.sortinoRatio.toFixed(2)} after ${metrics.totalTrades} trades (minimum required: ${this.MIN_SORTINO_RATIO})`,
      };
    }

    return { shouldCull: false };
  }

  /**
   * Immediately terminates agent, liquidates position, and archives post-mortem.
   */
  public static executeCull(
    agent: AlphaStrategyAgent,
    reason: CullReason,
    detail: string,
    currentMarketPrice: number
  ): {
    graveyardRecord: GraveyardRecord;
    liquidationTrade: TradeRecord | null;
  } {
    agent.status = 'TERMINATED';
    agent.deathTimestamp = Date.now();

    // Liquidate position if active
    let liquidationTrade: TradeRecord | null = null;
    if (agent.activePosition) {
      liquidationTrade = agent.closePosition(
        currentMarketPrice,
        Date.now(),
        'REAPER_CULL'
      );
    }

    const lifespanSeconds = Math.max(1, Math.floor((agent.deathTimestamp - agent.birthTimestamp) / 1000));

    const graveyardRecord: GraveyardRecord = {
      agentId: agent.id,
      generation: agent.genome.generation,
      parentIds: agent.genome.parentIds,
      cullReason: reason,
      cullDetail: detail,
      lifespanSeconds,
      totalTrades: agent.metrics.totalTrades,
      finalRealizedPnL: agent.metrics.realizedPnL,
      finalSortino: agent.metrics.sortinoRatio,
      finalMaxDrawdownPct: agent.metrics.maxDrawdownPct,
      finalBrierScore: agent.metrics.brierScore,
      genomeSnapshot: { ...agent.genome },
      timeOfDeath: agent.deathTimestamp,
    };

    return {
      graveyardRecord,
      liquidationTrade,
    };
  }
}
