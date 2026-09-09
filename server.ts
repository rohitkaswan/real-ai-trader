import dotenv from 'dotenv';
dotenv.config({ override: true });

import express from 'express';
import http from 'http';
import path from 'path';
import os from 'os';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { LocalStorageEngine } from './server/db/storage';
import { AutoHealingDiagnosticEngine } from './server/diagnostics/auto_healer';
import { SwarmManager } from './server/swarm/swarm_manager';
import { LiveMarketFeedManager } from './server/market/market_feed';
import { runQuantitativeUnitTests } from './tests/quant.test';
import { HistoricalEvolutionTrainer } from './server/training/historical_trainer';
import { HistoricalDatasetRepository } from './server/training/historical_dataset';

async function startServer() {
  const app = express();
  const PORT = 3000;
  const server = http.createServer(app);

  app.use(express.json({ limit: '10mb' }));

  // 1. Initialize Local Storage & Diagnostics
  const storage = new LocalStorageEngine(process.env.SQLITE_DB_PATH || './data/swarm_trading.db');
  await storage.initialize();

  const autoHealer = new AutoHealingDiagnosticEngine(storage);
  const swarmCapacity = parseInt(process.env.AGENT_SWARM_CAPACITY || '30', 10);
  const swarmManager = new SwarmManager(swarmCapacity, storage, autoHealer);
  const historicalTrainer = new HistoricalEvolutionTrainer();
  if (process.env.EXECUTION_VENUE === 'BINANCE') {
    swarmManager.executionRouter.setVenue('BINANCE');
  }
  const marketFeed = new LiveMarketFeedManager('btcusdt');

  // Configure Auto-Healer concrete remediation handler
  autoHealer.setRemediationHandler(async (action: string, component: string) => {
    console.log(`[AutoHealer] Applying remediation: ${action} on ${component}`);
    if (action.includes('RECONNECT_DATA_WEBSOCKET')) {
      marketFeed.stop();
      setTimeout(() => marketFeed.start(), 500);
    }
  });

  // 2. Setup WebSocket Server for Sub-Millisecond Dashboard Streaming
  const wss = new WebSocketServer({ server, path: '/ws/swarm' });

  const broadcastState = () => {
    if (wss.clients.size === 0) return;
    const activeAgents = swarmManager.getActiveAgentsState();
    const limits = swarmManager.riskSentinel.getLimits();
    const feedStatus = marketFeed.getStatus();
    const recentExecutions = swarmManager.executionRouter.getRecentExecutions(30);
    const recentTicks = storage.getRecentTicksFromRing(25);
    const equityHistory = storage.getEquityHistory(50);
    const incidents = autoHealer.getRecentIncidents(10);

    const payload = JSON.stringify({
      type: 'SWARM_STATE_UPDATE',
      timestamp: Date.now(),
      totalEquity: swarmManager.getTotalEquity(),
      totalDeaths: swarmManager.getTotalDeaths(),
      capacity: swarmManager.getCapacity(),
      venue: swarmManager.executionRouter.getVenue(),
      feedStatus,
      riskLimits: limits,
      activeAgents,
      recentExecutions,
      recentTicks,
      equityHistory,
      incidents,
    });

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  };

  // Broadcast throttled to ~4 times per second to prevent browser render thrashing
  let lastBroadcast = 0;
  swarmManager.setOnStateUpdate(() => {
    const now = Date.now();
    if (now - lastBroadcast > 250) {
      lastBroadcast = now;
      broadcastState();
    }
  });

  // 3. Connect Live Market Feed into Swarm Pipeline
  marketFeed.setCallbacks(
    async (tick) => {
      await swarmManager.processTick(tick);
    },
    (book) => {
      swarmManager.updateOrderBook(book);
    }
  );

  marketFeed.start();

  // 4. API Endpoints
  // Local System Health Check
  app.get('/api/health', (req, res) => {
    const memUsage = process.memoryUsage();
    const cpus = os.cpus();
    const feedStatus = marketFeed.getStatus();

    res.json({
      status: 'HEALTHY',
      localPlatform: `${os.platform()} ${os.arch()}`,
      uptimeSeconds: Math.floor(process.uptime()),
      cpuCount: cpus.length,
      memory: {
        rssMb: (memUsage.rss / (1024 * 1024)).toFixed(1),
        heapUsedMb: (memUsage.heapUsed / (1024 * 1024)).toFixed(1),
      },
      feedStatus,
      swarm: {
        capacity: swarmManager.getCapacity(),
        activeAgents: swarmManager.getActiveAgentsList().length,
        totalDeaths: swarmManager.getTotalDeaths(),
        totalEquity: swarmManager.getTotalEquity(),
      },
      risk: swarmManager.riskSentinel.getLimits(),
    });
  });

  // Swarm State Snapshot
  app.get('/api/swarm/state', (req, res) => {
    res.json({
      timestamp: Date.now(),
      totalEquity: swarmManager.getTotalEquity(),
      totalDeaths: swarmManager.getTotalDeaths(),
      capacity: swarmManager.getCapacity(),
      venue: swarmManager.executionRouter.getVenue(),
      feedStatus: marketFeed.getStatus(),
      riskLimits: swarmManager.riskSentinel.getLimits(),
      activeAgents: swarmManager.getActiveAgentsState(),
      recentExecutions: swarmManager.executionRouter.getRecentExecutions(50),
      graveyard: storage.getGraveyardRecords(30),
      equityHistory: storage.getEquityHistory(100),
      incidents: autoHealer.getRecentIncidents(20),
    });
  });

  // Update Swarm Pool Capacity (25-50)
  app.post('/api/swarm/capacity', (req, res) => {
    const { capacity } = req.body;
    if (typeof capacity === 'number' && capacity >= 10 && capacity <= 100) {
      swarmManager.setCapacity(capacity);
      broadcastState();
      res.json({ success: true, capacity: swarmManager.getCapacity() });
    } else {
      res.status(400).json({ error: 'Invalid capacity (allowed: 10 - 100)' });
    }
  });

  // Emergency Kill-Switch Toggle
  app.post('/api/swarm/kill-switch', (req, res) => {
    const { active } = req.body;
    if (active) {
      swarmManager.triggerEmergencyKillSwitch();
      autoHealer.handleIncident(
        'RISK_SENTINEL',
        'WARNING',
        'Emergency Manual Kill-Switch activated by administrator. All positions liquidated and execution halted.'
      );
    } else {
      swarmManager.resetEmergencyKillSwitch();
      autoHealer.handleIncident(
        'RISK_SENTINEL',
        'INFO',
        'Emergency Kill-Switch deactivated. Normal trading execution resumed.'
      );
    }
    broadcastState();
    res.json({ success: true, killSwitchActive: swarmManager.riskSentinel.getLimits().killSwitchActive });
  });

  // Reset Circuit Breaker
  app.post('/api/swarm/reset-breaker', (req, res) => {
    swarmManager.resetEmergencyKillSwitch();
    broadcastState();
    res.json({ success: true, limits: swarmManager.riskSentinel.getLimits() });
  });

  // Set Execution Venue
  app.post('/api/swarm/venue', (req, res) => {
    const { venue } = req.body;
    if (venue === 'BINANCE' || venue === 'MT5' || venue === 'LOCAL_EXCHANGE') {
      swarmManager.executionRouter.setVenue(venue);
      broadcastState();
      res.json({ success: true, venue });
    } else {
      res.status(400).json({ error: 'Invalid venue. Allowed: BINANCE, MT5, LOCAL_EXCHANGE' });
    }
  });

  // Set Trading Pair / Symbol
  app.post('/api/swarm/symbol', (req, res) => {
    const { symbol } = req.body;
    if (typeof symbol === 'string' && symbol.trim().length >= 3) {
      const clean = symbol.trim().toUpperCase();
      marketFeed.setSymbol(clean);
      swarmManager.setSymbol(clean);
      broadcastState();
      res.json({ success: true, symbol: clean });
    } else {
      res.status(400).json({ error: 'Invalid symbol. Example: BTCUSDT, ETHUSDT, SOLUSDT' });
    }
  });

  // Update Chief Risk Sentinel Limits
  app.post('/api/swarm/risk-limits', (req, res) => {
    const { maxRiskPerTradeEquityPct, maxDailyDrawdownEquityPct, maxSpreadBps, maxTickLatencyMs } = req.body;
    const updated = swarmManager.riskSentinel.updateLimits({
      maxRiskPerTradeEquityPct,
      maxDailyDrawdownEquityPct,
      maxSpreadBps,
      maxTickLatencyMs,
    });
    broadcastState();
    res.json({ success: true, limits: updated });
  });

  // Get Broker & Environment Configuration Status
  app.get('/api/config/info', async (req, res) => {
    const binanceApiKey = process.env.BINANCE_API_KEY || '';
    const hasBinanceKey = binanceApiKey.length > 5;
    const maskedKey = hasBinanceKey
      ? `${binanceApiKey.slice(0, 4)}...${binanceApiKey.slice(-4)}`
      : 'NOT_CONFIGURED';

    let accountStatus: any = null;
    if (hasBinanceKey) {
      try {
        accountStatus = await swarmManager.executionRouter.getBinanceClient().getAccountInfo();
      } catch (err: any) {
        accountStatus = { success: false, error: err.message };
      }
    }

    res.json({
      binance: {
        configured: hasBinanceKey,
        maskedApiKey: maskedKey,
        accountName: process.env.BINANCE_ACCOUNT_NAME || 'test',
        testnet: process.env.BINANCE_TESTNET === 'true',
        apiBase: process.env.BINANCE_TESTNET === 'true'
          ? 'https://testnet.binance.vision'
          : 'https://api.binance.com',
        connectionVerified: accountStatus?.success ?? false,
        accountError: accountStatus?.error,
      },
      mt5: {
        bridgeUrl: process.env.MT5_BRIDGE_URL || 'http://127.0.0.1:8000',
      },
      swarm: {
        activeSymbol: marketFeed.getStatus().symbol,
        venue: swarmManager.executionRouter.getVenue(),
        capacity: swarmManager.getCapacity(),
      },
      risk: swarmManager.riskSentinel.getLimits(),
    });
  });

  // Update Binance Credentials in Runtime
  app.post('/api/config/binance', async (req, res) => {
    const { apiKey, apiSecret, testnet, name } = req.body;
    if (apiKey && apiSecret) {
      process.env.BINANCE_API_KEY = apiKey.trim();
      process.env.BINANCE_API_SECRET = apiSecret.trim();
      if (typeof testnet === 'boolean') {
        process.env.BINANCE_TESTNET = String(testnet);
      }
      if (name) {
        process.env.BINANCE_ACCOUNT_NAME = name;
      }

      swarmManager.executionRouter.updateBinanceCredentials({
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        testnet: testnet ?? true,
      });

      // Automatically enable Binance as execution venue
      swarmManager.executionRouter.setVenue('BINANCE');

      const testResult = await swarmManager.executionRouter.getBinanceClient().getAccountInfo();
      broadcastState();

      res.json({
        success: true,
        testnet: process.env.BINANCE_TESTNET !== 'false',
        venue: 'BINANCE',
        accountCheck: testResult,
      });
    } else {
      res.status(400).json({ error: 'Both apiKey and apiSecret are required' });
    }
  });

  // Microstructure Shock Test Injection
  app.post('/api/swarm/shock-test', async (req, res) => {
    const { type } = req.body; // 'VOLATILITY_SPIKE' | 'SPREAD_BLOWOUT' | 'ADVERSE_PLUNGE'
    const recentTicks = storage.getRecentTicksFromRing(1);
    const lastPrice = recentTicks.length ? recentTicks[0].lastPrice : 68000;

    let shockTick = {
      symbol: 'BTCUSDT',
      timestamp: Date.now(),
      bidPrice: lastPrice * 0.96, // 4% plunge
      askPrice: lastPrice * 1.05, // 9% spread blowout
      bidQty: 0.1,
      askQty: 0.1,
      lastPrice: lastPrice * 0.95,
      lastQty: 5.0,
      source: 'HISTORICAL_RING' as const,
      latencyMs: 195, // Latency spike > 150ms
    };

    if (type === 'SPREAD_BLOWOUT') {
      shockTick.bidPrice = lastPrice - 150;
      shockTick.askPrice = lastPrice + 150;
      shockTick.lastPrice = lastPrice;
    }

    await swarmManager.processTick(shockTick);
    broadcastState();

    res.json({
      success: true,
      shockInjected: type,
      tick: shockTick,
    });
  });

  // Graveyard Records
  app.get('/api/graveyard', (req, res) => {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    res.json(storage.getGraveyardRecords(limit));
  });

  // Incident Alerts & Auto-Remediations
  app.get('/api/incidents', (req, res) => {
    res.json(autoHealer.getRecentIncidents(50));
  });

  // Trigger Gemini AI Diagnostic
  app.post('/api/healer/diagnose', async (req, res) => {
    const alert = await autoHealer.handleIncident(
      'RISK_SENTINEL',
      'INFO',
      'Manual health diagnostic requested by administrator.',
      {
        totalEquity: swarmManager.getTotalEquity(),
        totalDeaths: swarmManager.getTotalDeaths(),
        capacity: swarmManager.getCapacity(),
        feedStatus: marketFeed.getStatus(),
      }
    );
    broadcastState();
    res.json({ success: true, alert });
  });

  // Run Quantitative Unit Tests
  app.get('/api/tests/run', (req, res) => {
    const testResults = runQuantitativeUnitTests();
    const passedCount = testResults.filter(t => t.passed).length;
    res.json({
      timestamp: Date.now(),
      total: testResults.length,
      passed: passedCount,
      failed: testResults.length - passedCount,
      allPassed: passedCount === testResults.length,
      results: testResults,
    });
  });

  // Historical Training Catalog & Datasets
  app.get('/api/training/datasets', (req, res) => {
    res.json({
      success: true,
      datasets: HistoricalDatasetRepository.getCatalog(),
    });
  });

  // Historical Training Status
  app.get('/api/training/status', (req, res) => {
    res.json(historicalTrainer.getStatus());
  });

  // Start Historical Training Session
  app.post('/api/training/start', async (req, res) => {
    const { datasetId, generations, populationSize, customTicks } = req.body;
    try {
      const status = await historicalTrainer.startTraining({
        datasetId: datasetId || 'MULTI_DECADE_MACRO_20YR',
        generations: typeof generations === 'number' ? Math.max(1, Math.min(50, generations)) : 10,
        populationSize: typeof populationSize === 'number' ? Math.max(10, Math.min(60, populationSize)) : 30,
        customTicks,
      });
      res.json({ success: true, status });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Cancel Running Training Session
  app.post('/api/training/cancel', (req, res) => {
    historicalTrainer.cancelTraining();
    res.json({ success: true, message: 'Training cancellation requested' });
  });

  // Promote Evolved Champions to Live Swarm
  app.post('/api/training/apply-champions', (req, res) => {
    try {
      const result = historicalTrainer.applyChampionsToLiveSwarm(swarmManager);
      broadcastState();
      autoHealer.handleIncident(
        'REAPER_ENGINE',
        'INFO',
        `Successfully promoted ${result.promotedCount} battle-hardened champion genomes from historical training into the live swarm.`,
        { champions: result.championIds }
      );
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Custom CSV Upload & Parse
  app.post('/api/training/upload', (req, res) => {
    const { csvContent, symbol } = req.body;
    if (typeof csvContent !== 'string' || !csvContent.trim()) {
      return res.status(400).json({ error: 'Valid csvContent string required' });
    }

    try {
      const parsedTicks = HistoricalDatasetRepository.parseCsvTicks(csvContent, symbol || 'BTCUSDT');
      if (!parsedTicks.length) {
        return res.status(400).json({ error: 'Could not parse any valid price rows from provided CSV' });
      }

      res.json({
        success: true,
        tickCount: parsedTicks.length,
        firstTick: parsedTicks[0],
        lastTick: parsedTicks[parsedTicks.length - 1],
        ticks: parsedTicks,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to process CSV: ' + err.message });
    }
  });


  // 5. Mount Vite Middleware for SPA Development & Production Serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Darwinian Swarm Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Darwinian Swarm Server] Fatal launch error:', err);
  process.exit(1);
});
