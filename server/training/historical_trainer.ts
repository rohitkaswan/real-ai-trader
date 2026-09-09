import { AlphaStrategyAgent } from '../swarm/agent';
import { DarwinianReaperEngine } from '../swarm/reaper';
import { DarwinianSpawner } from '../swarm/spawner';
import { MicrostructureEngine } from '../quant/microstructure';
import { SwarmManager } from '../swarm/swarm_manager';
import {
  ChampionGenomeRecord,
  GenerationalEpochResult,
  MarketTick,
  StrategyGenome,
  TrainingSessionStatus,
} from '../types/trading';
import { HistoricalDatasetRepository } from './historical_dataset';

export class HistoricalEvolutionTrainer {
  private status: TrainingSessionStatus = {
    status: 'IDLE',
    datasetId: '',
    datasetName: '',
    currentGeneration: 0,
    totalGenerations: 0,
    progressPct: 0,
    elapsedMs: 0,
    ticksProcessed: 0,
    ticksPerSecond: 0,
    champions: [],
    history: [],
  };

  private isRunning = false;
  private shouldCancel = false;

  public getStatus(): TrainingSessionStatus {
    return { ...this.status };
  }

  public cancelTraining(): void {
    if (this.isRunning) {
      this.shouldCancel = true;
    }
  }

  /**
   * Starts a high-speed asynchronous evolutionary training session
   */
  public async startTraining(options: {
    datasetId: string;
    generations?: number;
    populationSize?: number;
    customTicks?: MarketTick[];
  }): Promise<TrainingSessionStatus> {
    if (this.isRunning) {
      throw new Error('A training session is already in progress.');
    }

    const {
      datasetId,
      generations = 10,
      populationSize = 30,
      customTicks,
    } = options;

    const datasetInfo = HistoricalDatasetRepository.getDatasetInfo(datasetId);
    const ticks: MarketTick[] = customTicks || HistoricalDatasetRepository.loadTicksForDataset(datasetId);

    if (!ticks.length) {
      throw new Error('No historical tick data available for dataset: ' + datasetId);
    }

    this.isRunning = true;
    this.shouldCancel = false;

    this.status = {
      status: 'TRAINING',
      datasetId,
      datasetName: datasetInfo?.name || 'Custom Dataset',
      currentGeneration: 0,
      totalGenerations: generations,
      progressPct: 0,
      elapsedMs: 0,
      ticksProcessed: 0,
      ticksPerSecond: 0,
      champions: [],
      history: [],
    };

    const startTime = Date.now();

    // Initialize Generation 0 population with diverse baseline genomes
    let population: AlphaStrategyAgent[] = [];
    for (let i = 0; i < populationSize; i++) {
      const genome = DarwinianSpawner.createBaselineGenome(0);
      population.push(new AlphaStrategyAgent(genome, 1000));
    }

    // Run generations asynchronously in non-blocking event loop chunks
    (async () => {
      try {
        let totalTicksCounter = 0;

        for (let gen = 1; gen <= generations; gen++) {
          if (this.shouldCancel) {
            this.status.status = 'CANCELLED';
            break;
          }

          this.status.currentGeneration = gen;
          const genStartTime = Date.now();

          // Isolated microstructure engine for this generational epoch
          const microstructure = new MicrostructureEngine();
          let cullCount = 0;
          let birthCount = 0;

          // Replay historical ticks through agents
          for (let t = 0; t < ticks.length; t++) {
            const tick = ticks[t];
            totalTicksCounter++;
            const features = microstructure.pushTick(tick);

            // Periodically yield to Node event loop so REST API & WebSockets stay responsive
            if (t % 400 === 0) {
              await new Promise(r => setTimeout(r, 0));
              if (this.shouldCancel) break;
            }

            // Evaluate all active agents
            for (let a = 0; a < population.length; a++) {
              const agent = population[a];

              // 1. Cull check
              const cullVerdict = DarwinianReaperEngine.evaluateAgent(agent);
              if (cullVerdict.shouldCull) {
                agent.status = 'TERMINATED';
                agent.deathTimestamp = tick.timestamp;
                cullCount++;

                // If agent held a position, force liquidate
                if (agent.activePosition) {
                  agent.closePosition(tick.lastPrice, tick.timestamp, 'REAPER_CULL');
                }

                // Immediate challenger replacement from surviving champions
                const challenger = DarwinianSpawner.spawnChallenger(population);
                challenger.birthTimestamp = tick.timestamp;
                population[a] = challenger;
                birthCount++;
                continue;
              }

              // 2. Evaluate signals
              const decision = agent.evaluate(features, tick);

              // Position close check
              if (agent.activePosition && (decision.reason.startsWith('CLOSE_') || decision.direction !== 'HOLD')) {
                agent.closePosition(
                  tick.lastPrice,
                  tick.timestamp,
                  (decision.reason.replace('CLOSE_', '') as any) || 'TAKE_PROFIT'
                );
                continue;
              }

              // Position entry check
              if (!agent.activePosition && (decision.direction === 'BUY' || decision.direction === 'SELL') && decision.size > 0) {
                // Realistic fill: half-spread + 1.5 bps slippage
                const fillPrice = decision.direction === 'BUY'
                  ? tick.askPrice * 1.00015
                  : tick.bidPrice * 0.99985;

                agent.openPosition(
                  tick.symbol,
                  decision.direction,
                  fillPrice,
                  decision.size,
                  decision.stopLossPrice,
                  decision.takeProfitPrice,
                  decision.confidence
                );
              }
            }
          }

          if (this.shouldCancel) break;

          // Close any residual open positions at end of generation for accurate epoch accounting
          const lastTick = ticks[ticks.length - 1];
          for (const agent of population) {
            if (agent.activePosition) {
              agent.closePosition(lastTick.lastPrice, lastTick.timestamp, 'TIME_HORIZON');
            }
          }

          // Calculate Generational Epoch Statistics
          const totalTrades = population.reduce((acc, a) => acc + a.metrics.totalTrades, 0);
          const totalWins = population.reduce((acc, a) => acc + a.metrics.winningTrades, 0);
          const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;

          const sortinos = population.map(a => a.metrics.sortinoRatio).filter(s => isFinite(s));
          const avgSortino = sortinos.length ? sortinos.reduce((a, b) => a + b, 0) / sortinos.length : 0;
          const bestSortino = sortinos.length ? Math.max(...sortinos) : 0;

          const drawdowns = population.map(a => a.metrics.maxDrawdownPct);
          const avgDrawdown = drawdowns.length ? drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length : 0;

          // Composite Fitness = Sortino * (1 - Brier) * ProfitFactor
          const fitnessList = population.map(a => {
            const f = Math.max(0, a.metrics.sortinoRatio) * (1 - Math.min(1, a.metrics.brierScore)) * Math.max(0.1, Math.min(5, a.metrics.profitFactor));
            return { agent: a, fitness: f };
          });

          fitnessList.sort((a, b) => b.fitness - a.fitness);
          const avgFitness = fitnessList.reduce((acc, item) => acc + item.fitness, 0) / fitnessList.length;
          const bestItem = fitnessList[0];

          // Gene parameter averages for convergence tracking
          const geneAverages = {
            imbalanceThreshold: population.reduce((acc, a) => acc + a.genome.imbalanceThreshold, 0) / population.length,
            parkinsonVolatilityCutoff: population.reduce((acc, a) => acc + a.genome.parkinsonVolatilityCutoff, 0) / population.length,
            hurstTrendThreshold: population.reduce((acc, a) => acc + a.genome.hurstTrendThreshold, 0) / population.length,
            vwapZEntryThreshold: population.reduce((acc, a) => acc + a.genome.vwapZEntryThreshold, 0) / population.length,
            kellyFraction: population.reduce((acc, a) => acc + a.genome.kellyFraction, 0) / population.length,
            stopLossBps: Math.round(population.reduce((acc, a) => acc + a.genome.stopLossBps, 0) / population.length),
            takeProfitBps: Math.round(population.reduce((acc, a) => acc + a.genome.takeProfitBps, 0) / population.length),
          };

          const epochResult: GenerationalEpochResult = {
            generation: gen,
            totalTrades,
            avgFitness: Number(avgFitness.toFixed(3)),
            bestFitness: Number(bestItem.fitness.toFixed(3)),
            winRate: Number(winRate.toFixed(1)),
            avgSortino: Number(avgSortino.toFixed(2)),
            bestSortino: Number(bestSortino.toFixed(2)),
            cullCount,
            birthCount,
            avgDrawdown: Number(avgDrawdown.toFixed(2)),
            bestGenomeId: bestItem.agent.genome.id,
            geneAverages,
          };

          this.status.history.push(epochResult);
          this.status.progressPct = Math.round((gen / generations) * 100);
          this.status.elapsedMs = Date.now() - startTime;
          this.status.ticksProcessed = totalTicksCounter;
          this.status.ticksPerSecond = Math.round((totalTicksCounter / Math.max(1, this.status.elapsedMs)) * 1000);

          // Evolve population for next generation:
          // Keep top 30% survivors, breed remaining 70% challengers via tournament crossover & mutation
          if (gen < generations) {
            const eliteCount = Math.max(2, Math.floor(population.length * 0.30));
            const eliteSurvivors = fitnessList.slice(0, eliteCount).map(item => item.agent);

            const nextGenerationPopulation: AlphaStrategyAgent[] = [];

            // Retain elite champions (resetting runtime trade metrics for next generation test)
            for (const elite of eliteSurvivors) {
              const freshElite = new AlphaStrategyAgent(elite.genome, 1000);
              nextGenerationPopulation.push(freshElite);
            }

            // Fill remainder with freshly bred challengers
            while (nextGenerationPopulation.length < populationSize) {
              const challenger = DarwinianSpawner.spawnChallenger(eliteSurvivors);
              nextGenerationPopulation.push(challenger);
            }

            population = nextGenerationPopulation;
          }
        }

        // Rank Top Champions from final generation
        const finalRanked = [...population].sort((a, b) => {
          const fitA = Math.max(0, a.metrics.sortinoRatio) * (1 - Math.min(1, a.metrics.brierScore)) * Math.max(0.1, a.metrics.profitFactor);
          const fitB = Math.max(0, b.metrics.sortinoRatio) * (1 - b.metrics.brierScore) * Math.max(0.1, b.metrics.profitFactor);
          return fitB - fitA;
        });

        const champions: ChampionGenomeRecord[] = finalRanked.slice(0, 5).map(agent => ({
          genome: agent.genome,
          generation: agent.genome.generation,
          fitness: Number((Math.max(0, agent.metrics.sortinoRatio) * (1 - Math.min(1, agent.metrics.brierScore)) * Math.max(0.1, agent.metrics.profitFactor)).toFixed(3)),
          sortino: Number(agent.metrics.sortinoRatio.toFixed(2)),
          winRate: Number(agent.metrics.winRate.toFixed(1)),
          profitFactor: Number(agent.metrics.profitFactor.toFixed(2)),
          maxDrawdownPct: Number(agent.metrics.maxDrawdownPct.toFixed(2)),
          totalTrades: agent.metrics.totalTrades,
          realizedPnL: Number(agent.metrics.realizedPnL.toFixed(2)),
        }));

        this.status.champions = champions;
        if (!this.shouldCancel) {
          this.status.status = 'COMPLETED';
          this.status.progressPct = 100;
        }
      } catch (err: any) {
        console.error('[HistoricalTrainer] Training run failure:', err);
        this.status.status = 'ERROR';
        this.status.error = err.message || 'Unknown error occurred during historical training';
      } finally {
        this.isRunning = false;
      }
    })();

    return this.status;
  }

  /**
   * Promotes the best battle-hardened champion genomes from training
   * into the active live SwarmManager, immediately upgrading its intelligence!
   */
  public applyChampionsToLiveSwarm(swarmManager: SwarmManager): {
    promotedCount: number;
    championIds: string[];
  } {
    if (!this.status.champions.length) {
      throw new Error('No evolved champions available. Run a historical training session first.');
    }

    const activeList = swarmManager.getActiveAgentsList();
    // Sort active agents by lowest fitness / highest drawdown to replace the weakest members
    const sortedActive = [...activeList].sort((a, b) => {
      const fitA = Math.max(0, a.metrics.sortinoRatio) * (1 - Math.min(1, a.metrics.brierScore));
      const fitB = Math.max(0, b.metrics.sortinoRatio) * (1 - Math.min(1, b.metrics.brierScore));
      return fitA - fitB; // Weakest first
    });

    const championsToApply = this.status.champions;
    const promotedIds: string[] = [];

    // Replace the weakest live agents with these battle-hardened champions
    for (let i = 0; i < championsToApply.length && i < sortedActive.length; i++) {
      const champ = championsToApply[i];
      const targetAgent = sortedActive[i];

      // Mutate agent genome with champion chromosome
      targetAgent.genome = {
        ...champ.genome,
        id: `PROMOTED-${champ.genome.id}`,
      };
      targetAgent.id = targetAgent.genome.id;
      promotedIds.push(targetAgent.id);
    }

    return {
      promotedCount: promotedIds.length,
      championIds: promotedIds,
    };
  }
}
