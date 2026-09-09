import { MicrostructureEngine } from '../server/quant/microstructure';
import { QuantitativeMetricsCalculator } from '../server/quant/metrics';
import { DarwinianReaperEngine } from '../server/swarm/reaper';
import { DarwinianSpawner } from '../server/swarm/spawner';
import { AlphaStrategyAgent } from '../server/swarm/agent';
import { ChiefRiskSentinel } from '../server/risk/sentinel';
import { MarketTick, OrderRequest } from '../server/types/trading';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

export function runQuantitativeUnitTests(): TestResult[] {
  const results: TestResult[] = [];

  // Test 1: Parkinson Volatility Calculation
  (() => {
    const t0 = Date.now();
    try {
      const engine = new MicrostructureEngine();
      // Inject synthetic ticks across 10 bars with known high/low ratio
      for (let i = 0; i < 20; i++) {
        const time = 1000000 + i * 1000;
        engine.pushTick({
          symbol: 'BTCUSDT',
          timestamp: time,
          bidPrice: 50000,
          askPrice: 50001,
          bidQty: 1,
          askQty: 1,
          lastPrice: 50000 + (i % 2 === 0 ? 200 : -100),
          lastQty: 1,
          source: 'HISTORICAL_RING',
          latencyMs: 10,
        });
      }
      const vol = engine.calculateParkinsonVolatility(10);
      const passed = vol > 0 && vol < 0.1 && Number.isFinite(vol);
      results.push({
        name: 'Parkinson Volatility Numerically Sound & Positive',
        passed,
        message: `Calculated volatility: ${(vol * 100).toFixed(4)}%`,
        durationMs: Date.now() - t0,
      });
    } catch (e: any) {
      results.push({ name: 'Parkinson Volatility', passed: false, message: e.message, durationMs: Date.now() - t0 });
    }
  })();

  // Test 2: Hurst Exponent Calculation (Clamp to [0.05, 0.95])
  (() => {
    const t0 = Date.now();
    try {
      const engine = new MicrostructureEngine();
      // Feed 100 ticks
      for (let i = 0; i < 100; i++) {
        engine.pushTick({
          symbol: 'BTCUSDT',
          timestamp: 1000000 + i * 200,
          bidPrice: 50000 + i * 2,
          askPrice: 50001 + i * 2,
          bidQty: 1,
          askQty: 1,
          lastPrice: 50000 + i * 2 + (Math.sin(i) * 5),
          lastQty: 0.5,
          source: 'HISTORICAL_RING',
          latencyMs: 5,
        });
      }
      const hurst = engine.calculateHurstExponent(64);
      const passed = hurst >= 0.05 && hurst <= 0.95;
      results.push({
        name: 'Hurst Exponent Range & Rescaled Range (R/S) Integrity',
        passed,
        message: `Hurst exponent: ${hurst.toFixed(4)} (Expected [0.05, 0.95])`,
        durationMs: Date.now() - t0,
      });
    } catch (e: any) {
      results.push({ name: 'Hurst Exponent', passed: false, message: e.message, durationMs: Date.now() - t0 });
    }
  })();

  // Test 3: Brier Calibration Score Calculation
  (() => {
    const t0 = Date.now();
    try {
      // 2 trades: 1 predicted 0.8 conf & won (diff: 0.2^2 = 0.04)
      //           1 predicted 0.7 conf & lost (diff: 0.7^2 = 0.49)
      // Expected mean = (0.04 + 0.49)/2 = 0.265
      const trades: any[] = [
        { netPnL: 50, returnPct: 1.0, predictedConfidence: 0.8, isProfitable: true },
        { netPnL: -30, returnPct: -0.6, predictedConfidence: 0.7, isProfitable: false },
      ];
      const metrics = QuantitativeMetricsCalculator.calculate(trades, 1020, 1000);
      const expectedBrier = 0.265;
      const passed = Math.abs(metrics.brierScore - expectedBrier) < 0.001;
      results.push({
        name: 'Brier Probability Calibration Score Accuracy',
        passed,
        message: `Computed Brier: ${metrics.brierScore.toFixed(4)}, Expected: ${expectedBrier}`,
        durationMs: Date.now() - t0,
      });
    } catch (e: any) {
      results.push({ name: 'Brier Calibration', passed: false, message: e.message, durationMs: Date.now() - t0 });
    }
  })();

  // Test 4: Darwinian Reaper Cull on Peak-to-Trough Drawdown > 4.5%
  (() => {
    const t0 = Date.now();
    try {
      const genome = DarwinianSpawner.createBaselineGenome(0);
      const agent = new AlphaStrategyAgent(genome, 1000);
      // Simulate heavy drawdown
      agent.metrics.currentDrawdownPct = 4.8;
      agent.metrics.maxDrawdownPct = 4.8;
      const cullEval = DarwinianReaperEngine.evaluateAgent(agent);
      const passed = cullEval.shouldCull === true && cullEval.reason === 'DRAWDOWN_EXCEEDED';
      results.push({
        name: 'Darwinian Reaper Engine: Immediate Cull on Drawdown > 4.5%',
        passed,
        message: `Cull verdict: ${cullEval.shouldCull}, Reason: ${cullEval.reason}`,
        durationMs: Date.now() - t0,
      });
    } catch (e: any) {
      results.push({ name: 'Reaper Drawdown Cull', passed: false, message: e.message, durationMs: Date.now() - t0 });
    }
  })();

  // Test 5: Darwinian Reaper Cull on 4 Consecutive Adverse Excursions
  (() => {
    const t0 = Date.now();
    try {
      const genome = DarwinianSpawner.createBaselineGenome(0);
      const agent = new AlphaStrategyAgent(genome, 1000);
      // Simulate 4 consecutive stopped out trades with micro-size to keep DD < 4.5%
      for (let i = 0; i < 4; i++) {
        agent.openPosition('BTCUSDT', 'BUY', 50000, 0.001, 49800, 50500, 0.6);
        agent.closePosition(49750, Date.now(), 'STOP_LOSS');
      }
      const cullEval = DarwinianReaperEngine.evaluateAgent(agent);
      const passed = cullEval.shouldCull === true && cullEval.reason === 'ADVERSE_EXCURSIONS';
      results.push({
        name: 'Darwinian Reaper Engine: Immediate Cull on 4 Adverse Excursions',
        passed,
        message: `Consecutive losses: ${agent.getConsecutiveLosses()}, Cull verdict: ${cullEval.shouldCull}`,
        durationMs: Date.now() - t0,
      });
    } catch (e: any) {
      results.push({ name: 'Reaper Adverse Excursion Cull', passed: false, message: e.message, durationMs: Date.now() - t0 });
    }
  })();

  // Test 6: Chief Risk Sentinel Firewall & Circuit Breaker
  (() => {
    const t0 = Date.now();
    try {
      const sentinel = new ChiefRiskSentinel(100000);
      const tick: MarketTick = {
        symbol: 'BTCUSDT',
        timestamp: Date.now(),
        bidPrice: 50000,
        askPrice: 50001,
        bidQty: 1,
        askQty: 1,
        lastPrice: 50000,
        lastQty: 1,
        source: 'BINANCE_WS',
        latencyMs: 12,
      };

      // Order with huge size attempting to breach 1.5% Half-Kelly risk ($1,500 max risk)
      const oversizedOrder: OrderRequest = {
        id: 'TEST-1',
        agentId: 'AGENT-TEST',
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 50, // 50 BTC * $500 stopLossDistance = $25,000 risk!
        orderType: 'MARKET',
        stopLossPrice: 49500,
        timestamp: Date.now(),
        maxSlippageBps: 15,
      };

      const verdict = sentinel.evaluateOrder(oversizedOrder, tick);
      // Firewall must scale down size to 1.5% max risk ($1500 / $500 = 3 BTC)
      const passed = verdict.approved && verdict.adjustedSize <= 3.01 && verdict.adjustedSize < oversizedOrder.size;

      results.push({
        name: 'Chief Risk Sentinel: Half-Kelly Risk Firewall Sizing Clamping',
        passed,
        message: `Requested: ${oversizedOrder.size} BTC -> Scaled Down to: ${verdict.adjustedSize.toFixed(2)} BTC`,
        durationMs: Date.now() - t0,
      });
    } catch (e: any) {
      results.push({ name: 'Sentinel Firewall Sizing', passed: false, message: e.message, durationMs: Date.now() - t0 });
    }
  })();

  // Test 7: Darwinian Spawner Crossover and Genetic Inheritance
  (() => {
    const t0 = Date.now();
    try {
      const g1 = DarwinianSpawner.createBaselineGenome(0);
      const g2 = DarwinianSpawner.createBaselineGenome(0);
      const p1 = new AlphaStrategyAgent(g1, 2000);
      const p2 = new AlphaStrategyAgent(g2, 2000);
      p1.metrics.sortinoRatio = 3.5;
      p2.metrics.sortinoRatio = 3.2;

      const challenger = DarwinianSpawner.spawnChallenger([p1, p2]);
      const passed =
        challenger.genome.generation >= 1 &&
        challenger.genome.parentIds.length === 2 &&
        challenger.currentCapital === 1000 && // Seed capital
        challenger.genome.kellyFraction > 0;

      results.push({
        name: 'Darwinian Spawner: Crossover, Seed Capital & Generation Succession',
        passed,
        message: `Challenger: ${challenger.id}, Gen: ${challenger.genome.generation}, Parents: ${challenger.genome.parentIds.join(', ')}`,
        durationMs: Date.now() - t0,
      });
    } catch (e: any) {
      results.push({ name: 'Spawner Crossover', passed: false, message: e.message, durationMs: Date.now() - t0 });
    }
  })();

  return results;
}
