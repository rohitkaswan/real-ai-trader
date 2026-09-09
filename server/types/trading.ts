export type OrderSide = 'BUY' | 'SELL';
export type SignalDirection = 'BUY' | 'SELL' | 'HOLD';

export type OrderStatus =
  | 'CREATED'
  | 'VALIDATING'
  | 'RISK_CHECK'
  | 'SUBMITTED'
  | 'ACKNOWLEDGED'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'REJECTED'
  | 'CANCELLED';

export type AgentStatus = 'ALIVE' | 'PROBATION' | 'TERMINATED';

export type CullReason =
  | 'DRAWDOWN_EXCEEDED'      // Peak-to-trough drawdown > 4.5%
  | 'SORTINO_DEGRADATION'    // Sortino < 1.5 over rolling 50 trades
  | 'ADVERSE_EXCURSIONS'     // 4 consecutive adverse excursions
  | 'RISK_VIOLATION'         // Attempted boundary violation
  | 'MANUAL_DISMISSAL';

export interface MarketTick {
  symbol: string;
  timestamp: number;
  bidPrice: number;
  askPrice: number;
  bidQty: number;
  askQty: number;
  lastPrice: number;
  lastQty: number;
  volume24h?: number;
  source: 'BINANCE_WS' | 'BINANCE_REST' | 'MT5_IPC' | 'HISTORICAL_RING';
  latencyMs: number;
}

export interface Level2OrderBook {
  symbol: string;
  timestamp: number;
  bids: [number, number][]; // [price, size]
  asks: [number, number][];
}

export interface MicrostructureFeatures {
  symbol: string;
  timestamp: number;
  midPrice: number;
  spreadBps: number;
  effectiveSpreadBps: number;
  orderBookImbalance: number;   // -1.0 to +1.0
  parkinsonVolatility: number;  // Rolling Parkinson volatility
  hurstExponent: number;        // <0.5 mean reverting, >0.5 trending
  vwap: number;
  vwapDeviationZ: number;       // Rolling z-score of price vs VWAP
  momentumZ: number;            // Rolling price momentum z-score
}

export interface StrategyGenome {
  id: string;
  generation: number;
  parentIds: string[];
  
  // Feature thresholds
  imbalanceThreshold: number;   // e.g. 0.15 - 0.45
  parkinsonVolatilityCutoff: number; // Max volatility to engage
  hurstTrendThreshold: number;  // Threshold for trend vs mean-reversion
  vwapZEntryThreshold: number;  // Z-score threshold to trigger entry
  momentumLookbackTicks: number; // Rolling window length
  
  // Risk & Horizons
  kellyFraction: number;        // Half-Kelly fraction (0.05 to 0.4)
  stopLossBps: number;          // Stop loss in basis points (15 to 80 bps)
  takeProfitBps: number;        // Take profit in basis points (25 to 150 bps)
  maxHoldingTicks: number;      // Maximum duration in ticks
  
  // Probabilistic calibration weights
  weightImbalance: number;
  weightVwapZ: number;
  weightMomentum: number;
  weightHurst: number;
}

export interface TradeRecord {
  id: string;
  agentId: string;
  symbol: string;
  side: OrderSide;
  entryPrice: number;
  exitPrice: number;
  size: number;
  entryTime: number;
  exitTime: number;
  grossPnL: number;
  fees: number;
  slippage: number;
  netPnL: number;
  returnPct: number;
  wasAdverseExcursion: boolean;
  predictedConfidence: number; // For Brier score calculation
  isProfitable: boolean;
  exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TIME_HORIZON' | 'SENTINEL_LIQUIDATION' | 'REAPER_CULL';
}

export interface AgentPerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  consecutiveLosses: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  realizedPnL: number;
  peakPnL: number;
  currentDrawdownPct: number;
  maxDrawdownPct: number;
  sortinoRatio: number;
  calmarRatio: number;
  brierScore: number; // Lower is better: mean squared error of probabilistic predictions
  capitalAllocation: number;
}

export interface AgentState {
  genome: StrategyGenome;
  status: AgentStatus;
  birthTimestamp: number;
  deathTimestamp?: number;
  metrics: AgentPerformanceMetrics;
  recentTrades: TradeRecord[];
  activePosition: {
    symbol: string;
    side: OrderSide;
    entryPrice: number;
    size: number;
    entryTime: number;
    predictedConfidence: number;
    stopLossPrice: number;
    takeProfitPrice: number;
    holdingTicks: number;
  } | null;
  lastSignal?: {
    direction: SignalDirection;
    confidence: number;
    timestamp: number;
    reason: string;
  };
}

export interface GraveyardRecord {
  agentId: string;
  generation: number;
  parentIds: string[];
  cullReason: CullReason;
  cullDetail: string;
  lifespanSeconds: number;
  totalTrades: number;
  finalRealizedPnL: number;
  finalSortino: number;
  finalMaxDrawdownPct: number;
  finalBrierScore: number;
  genomeSnapshot: StrategyGenome;
  timeOfDeath: number;
}

export interface OrderRequest {
  id: string;
  agentId: string;
  symbol: string;
  side: OrderSide;
  size: number;
  orderType: 'MARKET' | 'LIMIT' | 'TWAP_SLICE';
  price?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  timestamp: number;
  maxSlippageBps: number;
}

export interface OrderExecutionResult {
  orderId: string;
  agentId: string;
  symbol: string;
  side: OrderSide;
  status: OrderStatus;
  requestedSize: number;
  filledSize: number;
  averagePrice: number;
  slippageBps: number;
  fees: number;
  brokerTicket?: string;
  errorMessage?: string;
  lifecycle: { status: OrderStatus; timestamp: number; note?: string }[];
}

export interface RiskSentinelLimits {
  maxRiskPerTradeEquityPct: number; // 1.0% to 1.5%
  maxDailyDrawdownEquityPct: number; // 3.0%
  maxSpreadBps: number;             // 8 bps
  maxTickLatencyMs: number;         // 150 ms
  circuitBreakerTripped: boolean;
  circuitBreakerTrippedTime?: number;
  killSwitchActive: boolean;
  totalAccountEquity: number;
  dailyStartingEquity: number;
  currentDailyDrawdownPct: number;
}

export interface SystemDiagnosticAlert {
  id: string;
  timestamp: number;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  component: 'BROKER_GATEWAY' | 'REAPER_ENGINE' | 'RISK_SENTINEL' | 'DATA_FEED' | 'STORAGE';
  message: string;
  aiDiagnosis?: string;
  autoRemediationApplied?: string;
  resolved: boolean;
}

export interface HistoricalDatasetInfo {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  period: string;
  tickCount: number;
  marketRegime: string;
  description: string;
  startPrice: number;
  endPrice: number;
  tags: string[];
}

export interface GenerationalEpochResult {
  generation: number;
  totalTrades: number;
  avgFitness: number;
  bestFitness: number;
  winRate: number;
  avgSortino: number;
  bestSortino: number;
  cullCount: number;
  birthCount: number;
  avgDrawdown: number;
  bestGenomeId: string;
  geneAverages: {
    imbalanceThreshold: number;
    parkinsonVolatilityCutoff: number;
    hurstTrendThreshold: number;
    vwapZEntryThreshold: number;
    kellyFraction: number;
    stopLossBps: number;
    takeProfitBps: number;
  };
}

export interface ChampionGenomeRecord {
  genome: StrategyGenome;
  generation: number;
  fitness: number;
  sortino: number;
  winRate: number;
  profitFactor: number;
  maxDrawdownPct: number;
  totalTrades: number;
  realizedPnL: number;
}

export interface TrainingSessionStatus {
  status: 'IDLE' | 'TRAINING' | 'COMPLETED' | 'CANCELLED' | 'ERROR';
  datasetId: string;
  datasetName: string;
  currentGeneration: number;
  totalGenerations: number;
  progressPct: number;
  elapsedMs: number;
  ticksProcessed: number;
  ticksPerSecond: number;
  champions: ChampionGenomeRecord[];
  history: GenerationalEpochResult[];
  error?: string;
}

