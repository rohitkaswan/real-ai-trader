import { MicrostructureEngine } from '../quant/microstructure';
import { ChiefRiskSentinel } from '../risk/sentinel';
import { ExecutionMicrostructureRouter } from '../execution/order_router';
import { LocalStorageEngine } from '../db/storage';
import { DarwinianReaperEngine } from './reaper';
import { DarwinianSpawner } from './spawner';
import { AlphaStrategyAgent } from './agent';
import { AutoHealingDiagnosticEngine } from '../diagnostics/auto_healer';
import {
  AgentState,
  GraveyardRecord,
  Level2OrderBook,
  MarketTick,
  OrderExecutionResult,
  OrderRequest,
  TradeRecord,
} from '../types/trading';

export class SwarmManager {
  private activeAgents: Map<string, AlphaStrategyAgent> = new Map();
  private capacity: number;
  private symbol: string = 'BTCUSDT';
  
  public microstructure: MicrostructureEngine;
  public riskSentinel: ChiefRiskSentinel;
  public executionRouter: ExecutionMicrostructureRouter;
  public storage: LocalStorageEngine;
  public autoHealer: AutoHealingDiagnosticEngine;

  private totalEquity: number = 100000;
  private isProcessingTick = false;
  private totalDeaths = 0;
  private onStateUpdate?: () => void;

  constructor(
    capacity = 30,
    storage: LocalStorageEngine,
    autoHealer: AutoHealingDiagnosticEngine
  ) {
    this.capacity = capacity;
    this.storage = storage;
    this.autoHealer = autoHealer;
    this.microstructure = new MicrostructureEngine();
    this.riskSentinel = new ChiefRiskSentinel(this.totalEquity);
    this.executionRouter = new ExecutionMicrostructureRouter(this.riskSentinel, 'LOCAL_EXCHANGE');

    this.initializeSwarm();
  }

  public setOnStateUpdate(cb: () => void): void {
    this.onStateUpdate = cb;
  }

  /**
   * Initializes the initial N active agent slots with diverse baseline genomes
   */
  private initializeSwarm(): void {
    for (let i = 0; i < this.capacity; i++) {
      const genome = DarwinianSpawner.createBaselineGenome(0);
      const agent = new AlphaStrategyAgent(genome, 1000);
      this.activeAgents.set(agent.id, agent);
    }
  }

  public getCapacity(): number {
    return this.capacity;
  }

  public setCapacity(newCapacity: number): void {
    if (newCapacity < 10 || newCapacity > 100) return;
    this.capacity = newCapacity;
    this.ensureCapacityConstraint();
  }

  public setSymbol(newSymbol: string): void {
    this.symbol = newSymbol.toUpperCase().trim();
  }

  public getSymbol(): string {
    return this.symbol;
  }

  public getActiveAgentsList(): AlphaStrategyAgent[] {
    return Array.from(this.activeAgents.values());
  }

  public getActiveAgentsState(): AgentState[] {
    return Array.from(this.activeAgents.values()).map(a => a.getState());
  }

  public getTotalDeaths(): number {
    return this.totalDeaths;
  }

  public getTotalEquity(): number {
    return this.totalEquity;
  }

  public updateOrderBook(book: Level2OrderBook): void {
    this.microstructure.updateOrderBook(book);
  }

  /**
   * Process an incoming live or simulated market tick
   * Strict chronological isolation.
   */
  public async processTick(tick: MarketTick): Promise<{
    features: any;
    executions: OrderExecutionResult[];
    culledRecords: GraveyardRecord[];
  }> {
    if (this.isProcessingTick) {
      return { features: null, executions: [], culledRecords: [] };
    }
    this.isProcessingTick = true;

    const executions: OrderExecutionResult[] = [];
    const culledRecords: GraveyardRecord[] = [];

    try {
      // 1. Storage L1 ring buffer push
      this.storage.pushTickToRingBuffer(tick);

      // 2. Microstructure feature pipeline computation
      const features = this.microstructure.pushTick(tick);

      // 3. Monitor data quality & latency anomalies
      if (tick.latencyMs > 150) {
        this.autoHealer.handleIncident(
          'DATA_FEED',
          'WARNING',
          `Tick latency spike: ${tick.latencyMs}ms exceeds 150ms ceiling`,
          { latencyMs: tick.latencyMs, source: tick.source }
        );
      }

      if (features.spreadBps > 8.0) {
        this.autoHealer.handleIncident(
          'DATA_FEED',
          'WARNING',
          `Spread expanded to ${features.spreadBps.toFixed(2)} bps (> 8 bps gate)`,
          { spreadBps: features.spreadBps }
        );
      }

      // 4. Iterate over active agents and evaluate signals
      const currentAgents = Array.from(this.activeAgents.values());

      for (const agent of currentAgents) {
        // Evaluate agent cull conditions BEFORE new evaluations
        const cullEval = DarwinianReaperEngine.evaluateAgent(agent);
        if (cullEval.shouldCull && cullEval.reason && cullEval.detail) {
          const deathResult = this.cullAndReplaceAgent(
            agent,
            cullEval.reason,
            cullEval.detail,
            tick.lastPrice
          );
          if (deathResult.graveyardRecord) {
            culledRecords.push(deathResult.graveyardRecord);
          }
          if (deathResult.liquidationTrade) {
            this.storage.logTrade(deathResult.liquidationTrade);
          }
          continue;
        }

        // Agent evaluates microstructure features
        const decision = agent.evaluate(features, tick);

        // Check if agent requested a position CLOSE
        if (agent.activePosition && (decision.reason.startsWith('CLOSE_') || decision.direction !== 'HOLD')) {
          const exitTrade = agent.closePosition(
            tick.lastPrice,
            tick.timestamp,
            (decision.reason.replace('CLOSE_', '') as any) || 'TAKE_PROFIT'
          );
          if (exitTrade) {
            this.storage.logTrade(exitTrade);
            this.totalEquity += exitTrade.netPnL;
          }
          continue;
        }

        // Check if agent generates a new ENTRY trade
        if (!agent.activePosition && (decision.direction === 'BUY' || decision.direction === 'SELL') && decision.size > 0) {
          const orderReq: OrderRequest = {
            id: `ORD-${agent.id}-${Date.now().toString(36)}`,
            agentId: agent.id,
            symbol: tick.symbol,
            side: decision.direction,
            size: decision.size,
            orderType: 'MARKET',
            price: tick.lastPrice,
            stopLossPrice: decision.stopLossPrice,
            takeProfitPrice: decision.takeProfitPrice,
            timestamp: tick.timestamp,
            maxSlippageBps: 15,
          };

          const execResult = await this.executionRouter.routeOrder(orderReq, tick);
          executions.push(execResult);

          if (execResult.status === 'FILLED') {
            agent.openPosition(
              tick.symbol,
              decision.direction,
              execResult.averagePrice,
              execResult.filledSize,
              decision.stopLossPrice,
              decision.takeProfitPrice,
              decision.confidence
            );
          }
        }
      }

      // 5. Update Risk Sentinel Portfolio Equity & Check Circuit Breaker
      const breakerCheck = this.riskSentinel.updatePortfolioEquity(this.totalEquity);
      if (breakerCheck.circuitBreakerTriggered) {
        this.autoHealer.handleIncident(
          'RISK_SENTINEL',
          'CRITICAL',
          `Daily portfolio drawdown reached ${breakerCheck.drawdownPct.toFixed(2)}% (3.0% circuit breaker tripped)`,
          { drawdownPct: breakerCheck.drawdownPct, totalEquity: this.totalEquity }
        );
      }

      // 6. Ensure exact slot capacity N
      this.ensureCapacityConstraint();

      // Log equity snapshot
      this.storage.logEquity(tick.timestamp, this.totalEquity, this.riskSentinel.getLimits().currentDailyDrawdownPct);

      if (this.onStateUpdate) {
        this.onStateUpdate();
      }

      return { features, executions, culledRecords };
    } finally {
      this.isProcessingTick = false;
    }
  }

  /**
   * Culls an agent and instantaneously hot-swaps it with an elite challenger offspring
   */
  private cullAndReplaceAgent(
    agent: AlphaStrategyAgent,
    reason: any,
    detail: string,
    currentPrice: number
  ): {
    graveyardRecord: GraveyardRecord | null;
    liquidationTrade: TradeRecord | null;
  } {
    const cullResult = DarwinianReaperEngine.executeCull(
      agent,
      reason,
      detail,
      currentPrice
    );

    this.activeAgents.delete(agent.id);
    this.totalDeaths++;

    // Archive to SQLite Graveyard
    this.storage.archiveGraveyard(cullResult.graveyardRecord);

    // ZERO DOWNTIME HOT-SWAP: Instantly instantiate challenger offspring
    const remainingSurvivors = Array.from(this.activeAgents.values());
    const challenger = DarwinianSpawner.spawnChallenger(remainingSurvivors);
    this.activeAgents.set(challenger.id, challenger);

    // If death rate is anomalous (> 5 deaths in short period), trigger AI auto-healer alert
    if (this.totalDeaths % 5 === 0) {
      this.autoHealer.handleIncident(
        'REAPER_ENGINE',
        'WARNING',
        `Agent cull threshold milestone: ${this.totalDeaths} total agents culled. Elite challenger ${challenger.id} spawned.`,
        { culledId: agent.id, reason, detail, challengerId: challenger.id }
      );
    }

    return cullResult;
  }

  /**
   * Maintains strictly N active agent slots in memory
   */
  private ensureCapacityConstraint(): void {
    const currentSize = this.activeAgents.size;
    if (currentSize < this.capacity) {
      const needed = this.capacity - currentSize;
      const survivors = Array.from(this.activeAgents.values());
      for (let i = 0; i < needed; i++) {
        const newAgent = DarwinianSpawner.spawnChallenger(survivors);
        this.activeAgents.set(newAgent.id, newAgent);
      }
    } else if (currentSize > this.capacity) {
      // Cull poorest performing agents
      const sorted = Array.from(this.activeAgents.values()).sort(
        (a, b) => a.metrics.sortinoRatio - b.metrics.sortinoRatio
      );
      const toRemove = currentSize - this.capacity;
      for (let i = 0; i < toRemove; i++) {
        const victim = sorted[i];
        this.cullAndReplaceAgent(victim, 'MANUAL_DISMISSAL', 'Capacity adjustment downsize', 100);
      }
    }
  }

  /**
   * Emergency Manual Kill-Switch Trigger
   */
  public triggerEmergencyKillSwitch(): void {
    this.riskSentinel.setKillSwitch(true);
    // Liquidate all active positions
    for (const agent of this.activeAgents.values()) {
      if (agent.activePosition) {
        const trade = agent.closePosition(
          agent.activePosition.entryPrice,
          Date.now(),
          'SENTINEL_LIQUIDATION'
        );
        if (trade) this.storage.logTrade(trade);
      }
    }
  }

  public resetEmergencyKillSwitch(): void {
    this.riskSentinel.setKillSwitch(false);
    this.riskSentinel.resetCircuitBreaker();
  }
}
