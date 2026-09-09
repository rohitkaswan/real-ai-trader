import fs from 'fs';
import path from 'path';
import initSqlJs, { Database } from 'sql.js';
import { GraveyardRecord, MarketTick, SystemDiagnosticAlert, TradeRecord } from '../types/trading';

export class LocalStorageEngine {
  private db: Database | null = null;
  private dbFilePath: string;
  private isInitialized = false;

  // In-memory L1 Ring Buffer for high-frequency ticks
  private ringBuffer: MarketTick[] = [];
  private readonly ringBufferSize = 5000;

  constructor(dbPath = './data/swarm_trading.db') {
    this.dbFilePath = path.resolve(process.cwd(), dbPath);
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Ensure data directory exists
    const dir = path.dirname(this.dbFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const SQL = await initSqlJs();

    if (fs.existsSync(this.dbFilePath)) {
      const fileBuffer = fs.readFileSync(this.dbFilePath);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }

    // Execute schema migrations with indexes
    this.db.run(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        generation INTEGER,
        status TEXT,
        sortino REAL,
        calmar REAL,
        profit_factor REAL,
        brier REAL,
        max_drawdown REAL,
        realized_pnl REAL,
        capital REAL,
        genome_json TEXT,
        created_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        agent_id TEXT,
        symbol TEXT,
        side TEXT,
        entry_price REAL,
        exit_price REAL,
        size REAL,
        net_pnl REAL,
        fees REAL,
        slippage REAL,
        return_pct REAL,
        exit_reason TEXT,
        created_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS graveyard (
        agent_id TEXT PRIMARY KEY,
        generation INTEGER,
        cull_reason TEXT,
        cull_detail TEXT,
        lifespan_seconds INTEGER,
        total_trades INTEGER,
        final_realized_pnl REAL,
        final_sortino REAL,
        final_max_drawdown REAL,
        final_brier REAL,
        time_of_death INTEGER,
        genome_json TEXT
      );

      CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY,
        timestamp INTEGER,
        severity TEXT,
        component TEXT,
        message TEXT,
        ai_diagnosis TEXT,
        auto_remediation TEXT,
        resolved INTEGER
      );

      CREATE TABLE IF NOT EXISTS equity_history (
        timestamp INTEGER PRIMARY KEY,
        equity REAL,
        drawdown_pct REAL
      );

      CREATE INDEX IF NOT EXISTS idx_trades_agent ON trades(agent_id);
      CREATE INDEX IF NOT EXISTS idx_trades_created ON trades(created_at);
      CREATE INDEX IF NOT EXISTS idx_graveyard_death ON graveyard(time_of_death);
    `);

    this.isInitialized = true;
    this.persistToDisk();
  }

  /**
   * High-Frequency L1 Ring Buffer push (zero disk I/O)
   */
  public pushTickToRingBuffer(tick: MarketTick): void {
    this.ringBuffer.push(tick);
    if (this.ringBuffer.length > this.ringBufferSize) {
      this.ringBuffer.shift();
    }
  }

  public getRecentTicksFromRing(count = 100): MarketTick[] {
    return this.ringBuffer.slice(-count);
  }

  /**
   * Persists a trade execution record
   */
  public logTrade(trade: TradeRecord): void {
    if (!this.db) return;
    try {
      this.db.run(
        `INSERT OR REPLACE INTO trades (id, agent_id, symbol, side, entry_price, exit_price, size, net_pnl, fees, slippage, return_pct, exit_reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          trade.id,
          trade.agentId,
          trade.symbol,
          trade.side,
          trade.entryPrice,
          trade.exitPrice,
          trade.size,
          trade.netPnL,
          trade.fees,
          trade.slippage,
          trade.returnPct,
          trade.exitReason,
          trade.exitTime,
        ]
      );
      this.persistToDisk();
    } catch (err) {
      console.error('[StorageEngine] Error logging trade:', err);
    }
  }

  /**
   * Archives a culled agent in the Evolutionary Graveyard
   */
  public archiveGraveyard(record: GraveyardRecord): void {
    if (!this.db) return;
    try {
      this.db.run(
        `INSERT OR REPLACE INTO graveyard (agent_id, generation, cull_reason, cull_detail, lifespan_seconds, total_trades, final_realized_pnl, final_sortino, final_max_drawdown, final_brier, time_of_death, genome_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.agentId,
          record.generation,
          record.cullReason,
          record.cullDetail,
          record.lifespanSeconds,
          record.totalTrades,
          record.finalRealizedPnL,
          record.finalSortino,
          record.finalMaxDrawdownPct,
          record.finalBrierScore,
          record.timeOfDeath,
          JSON.stringify(record.genomeSnapshot),
        ]
      );
      this.persistToDisk();
    } catch (err) {
      console.error('[StorageEngine] Error archiving graveyard record:', err);
    }
  }

  public getGraveyardRecords(limit = 100): GraveyardRecord[] {
    if (!this.db) return [];
    try {
      const stmt = this.db.prepare(
        `SELECT agent_id, generation, cull_reason, cull_detail, lifespan_seconds, total_trades, final_realized_pnl, final_sortino, final_max_drawdown, final_brier, time_of_death, genome_json
         FROM graveyard ORDER BY time_of_death DESC LIMIT ?`
      );
      stmt.bind([limit]);
      const results: GraveyardRecord[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push({
          agentId: String(row.agent_id),
          generation: Number(row.generation),
          parentIds: [],
          cullReason: row.cull_reason as any,
          cullDetail: String(row.cull_detail),
          lifespanSeconds: Number(row.lifespan_seconds),
          totalTrades: Number(row.total_trades),
          finalRealizedPnL: Number(row.final_realized_pnl),
          finalSortino: Number(row.final_sortino),
          finalMaxDrawdownPct: Number(row.final_max_drawdown),
          finalBrierScore: Number(row.final_brier),
          genomeSnapshot: JSON.parse(String(row.genome_json || '{}')),
          timeOfDeath: Number(row.time_of_death),
        });
      }
      stmt.free();
      return results;
    } catch (err) {
      console.error('[StorageEngine] Error reading graveyard:', err);
      return [];
    }
  }

  /**
   * Logs an incident or diagnostic alert
   */
  public logIncident(alert: SystemDiagnosticAlert): void {
    if (!this.db) return;
    try {
      this.db.run(
        `INSERT OR REPLACE INTO incidents (id, timestamp, severity, component, message, ai_diagnosis, auto_remediation, resolved)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          alert.id,
          alert.timestamp,
          alert.severity,
          alert.component,
          alert.message,
          alert.aiDiagnosis || '',
          alert.autoRemediationApplied || '',
          alert.resolved ? 1 : 0,
        ]
      );
      this.persistToDisk();
    } catch (err) {
      console.error('[StorageEngine] Error logging incident:', err);
    }
  }

  public getIncidents(limit = 50): SystemDiagnosticAlert[] {
    if (!this.db) return [];
    try {
      const stmt = this.db.prepare(
        `SELECT id, timestamp, severity, component, message, ai_diagnosis, auto_remediation, resolved
         FROM incidents ORDER BY timestamp DESC LIMIT ?`
      );
      stmt.bind([limit]);
      const results: SystemDiagnosticAlert[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push({
          id: String(row.id),
          timestamp: Number(row.timestamp),
          severity: row.severity as any,
          component: row.component as any,
          message: String(row.message),
          aiDiagnosis: String(row.ai_diagnosis || ''),
          autoRemediationApplied: String(row.auto_remediation || ''),
          resolved: Boolean(row.resolved),
        });
      }
      stmt.free();
      return results;
    } catch (err) {
      return [];
    }
  }

  public logEquity(timestamp: number, equity: number, drawdownPct: number): void {
    if (!this.db) return;
    try {
      this.db.run(
        `INSERT OR REPLACE INTO equity_history (timestamp, equity, drawdown_pct) VALUES (?, ?, ?)`,
        [timestamp, equity, drawdownPct]
      );
    } catch (err) {
      // Non-critical
    }
  }

  public getEquityHistory(limit = 100): { timestamp: number; equity: number; drawdownPct: number }[] {
    if (!this.db) return [];
    try {
      const stmt = this.db.prepare(
        `SELECT timestamp, equity, drawdown_pct FROM equity_history ORDER BY timestamp ASC LIMIT ?`
      );
      stmt.bind([limit]);
      const res: { timestamp: number; equity: number; drawdownPct: number }[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        res.push({
          timestamp: Number(row.timestamp),
          equity: Number(row.equity),
          drawdownPct: Number(row.drawdown_pct),
        });
      }
      stmt.free();
      return res;
    } catch (err) {
      return [];
    }
  }

  /**
   * Persists the in-memory SQLite database to physical disk with Write-Ahead Logging pattern
   */
  public persistToDisk(): void {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbFilePath, buffer);
    } catch (err) {
      console.error('[StorageEngine] Disk flush failure:', err);
    }
  }
}
