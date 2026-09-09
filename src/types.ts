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
  | 'DRAWDOWN_EXCEEDED'
  | 'SORTINO_DEGRADATION'
  | 'ADVERSE_EXCURSIONS'
  | 'RISK_VIOLATION'
  | 'MANUAL_DISMISSAL';

export interface StrategyGenome {
  id: string;
  generation: number;
  parentIds: string[];
  imbalanceThreshold: number;
  parkinsonVolatilityCutoff: number;
  hurstTrendThreshold: number;
  vwapZEntryThreshold: number;
  momentumLookbackTicks: number;
  kellyFraction: number;
  stopLossBps: number;
  takeProfitBps: number;
  maxHoldingTicks: number;
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
  predictedConfidence: number;
  isProfitable: boolean;
  exitReason: string;
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
  brierScore: number;
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
  maxRiskPerTradeEquityPct: number;
  maxDailyDrawdownEquityPct: number;
  maxSpreadBps: number;
  maxTickLatencyMs: number;
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

export interface MarketTick {
  symbol: string;
  timestamp: number;
  bidPrice: number;
  askPrice: number;
  bidQty: number;
  askQty: number;
  lastPrice: number;
  lastQty: number;
  source: 'BINANCE_WS' | 'BINANCE_REST' | 'MT5_IPC' | 'HISTORICAL_RING';
  latencyMs: number;
}

export interface SwarmStatePayload {
  type: string;
  timestamp: number;
  totalEquity: number;
  totalDeaths: number;
  capacity: number;
  venue: 'LOCAL_EXCHANGE' | 'BINANCE' | 'MT5';
  feedStatus: {
    symbol: string;
    status: 'CONNECTED' | 'CONNECTING' | 'RECONNECTING' | 'OFFLINE';
    latencyMs: number;
    reconnectAttempts: number;
  };
  riskLimits: RiskSentinelLimits;
  activeAgents: AgentState[];
  recentExecutions: OrderExecutionResult[];
  recentTicks: MarketTick[];
  equityHistory: { timestamp: number; equity: number; drawdownPct: number }[];
  incidents: SystemDiagnosticAlert[];
}

export interface UnitTestResult {
  name: string;
  passed: boolean;
  message: string;
  durationMs: number;
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

