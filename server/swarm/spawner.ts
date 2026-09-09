import { StrategyGenome } from '../types/trading';
import { AlphaStrategyAgent } from './agent';

export class DarwinianSpawner {
  private static idCounter = 1;

  /**
   * Generates standard pseudo-Gaussian random variable via Box-Muller transform
   */
  private static randomGaussian(mean = 0, std = 1): number {
    let u1 = Math.random();
    let u2 = Math.random();
    while (u1 === 0) u1 = Math.random(); // avoid log(0)
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * std + mean;
  }

  /**
   * Generates a randomized initial baseline Genome (Generation 0)
   */
  public static createBaselineGenome(generation = 0): StrategyGenome {
    const id = `GEN${generation}-${String(this.idCounter++).padStart(4, '0')}`;
    return {
      id,
      generation,
      parentIds: [],
      imbalanceThreshold: 0.15 + Math.random() * 0.30,      // 0.15 - 0.45
      parkinsonVolatilityCutoff: 0.003 + Math.random() * 0.006, // 0.3% - 0.9%
      hurstTrendThreshold: 0.48 + Math.random() * 0.10,     // 0.48 - 0.58
      vwapZEntryThreshold: 1.0 + Math.random() * 1.5,       // 1.0 - 2.5
      momentumLookbackTicks: Math.floor(20 + Math.random() * 60), // 20 - 80 ticks
      kellyFraction: 0.10 + Math.random() * 0.20,           // 0.10 - 0.30
      stopLossBps: Math.floor(20 + Math.random() * 40),      // 20 - 60 bps
      takeProfitBps: Math.floor(35 + Math.random() * 75),    // 35 - 110 bps
      maxHoldingTicks: Math.floor(30 + Math.random() * 120), // 30 - 150 ticks
      weightImbalance: 0.5 + Math.random() * 1.5,
      weightVwapZ: 0.5 + Math.random() * 1.5,
      weightMomentum: 0.5 + Math.random() * 1.5,
      weightHurst: 0.3 + Math.random() * 1.0,
    };
  }

  /**
   * Spawns a new Challenger Agent by selecting top 20% surviving champions,
   * performing genetic crossover and applying a 5% Gaussian mutation rate.
   */
  public static spawnChallenger(survivingAgents: AlphaStrategyAgent[]): AlphaStrategyAgent {
    const aliveAgents = survivingAgents.filter(a => a.status === 'ALIVE');

    // If not enough alive agents, fallback to baseline
    if (aliveAgents.length < 2) {
      const baseline = this.createBaselineGenome(1);
      return new AlphaStrategyAgent(baseline, 1000);
    }

    // Sort surviving champions by Composite Fitness:
    // Fitness = max(0, Sortino) * (1 - Brier) * max(0.1, ProfitFactor)
    const sortedChampions = [...aliveAgents].sort((a, b) => {
      const fitnessA = Math.max(0, a.metrics.sortinoRatio) * (1 - a.metrics.brierScore) * Math.max(0.1, Math.min(5, a.metrics.profitFactor));
      const fitnessB = Math.max(0, b.metrics.sortinoRatio) * (1 - b.metrics.brierScore) * Math.max(0.1, Math.min(5, b.metrics.profitFactor));
      return fitnessB - fitnessA;
    });

    // Top 20% pool (minimum 2 champions)
    const top20Count = Math.max(2, Math.ceil(sortedChampions.length * 0.20));
    const elitePool = sortedChampions.slice(0, top20Count);

    // Select Parent 1 and Parent 2 via tournament
    const parent1 = elitePool[Math.floor(Math.random() * elitePool.length)];
    let parent2 = elitePool[Math.floor(Math.random() * elitePool.length)];
    if (parent1.id === parent2.id && elitePool.length > 1) {
      parent2 = elitePool.find(p => p.id !== parent1.id) || parent2;
    }

    const nextGeneration = Math.max(parent1.genome.generation, parent2.genome.generation) + 1;
    const g1 = parent1.genome;
    const g2 = parent2.genome;

    // Uniform Crossover: Blend or randomly inherit from Parent 1 or Parent 2
    const crossover = (v1: number, v2: number): number => {
      const alpha = Math.random();
      return v1 * alpha + v2 * (1 - alpha);
    };

    // 5% Gaussian Mutation Rate: 5% probability per gene to mutate with Gaussian delta
    const mutate = (val: number, minVal: number, maxVal: number, mutationStdRatio = 0.05): number => {
      // 5% chance of mutation
      if (Math.random() < 0.25) {
        const delta = this.randomGaussian(0, (maxVal - minVal) * mutationStdRatio);
        return Math.max(minVal, Math.min(maxVal, val + delta));
      }
      return val;
    };

    const newGenome: StrategyGenome = {
      id: `CHAL-G${nextGeneration}-${String(this.idCounter++).padStart(4, '0')}`,
      generation: nextGeneration,
      parentIds: [parent1.id, parent2.id],
      
      imbalanceThreshold: mutate(crossover(g1.imbalanceThreshold, g2.imbalanceThreshold), 0.10, 0.60),
      parkinsonVolatilityCutoff: mutate(crossover(g1.parkinsonVolatilityCutoff, g2.parkinsonVolatilityCutoff), 0.001, 0.02),
      hurstTrendThreshold: mutate(crossover(g1.hurstTrendThreshold, g2.hurstTrendThreshold), 0.45, 0.65),
      vwapZEntryThreshold: mutate(crossover(g1.vwapZEntryThreshold, g2.vwapZEntryThreshold), 0.5, 3.5),
      momentumLookbackTicks: Math.round(mutate(crossover(g1.momentumLookbackTicks, g2.momentumLookbackTicks), 10, 150)),
      
      kellyFraction: mutate(crossover(g1.kellyFraction, g2.kellyFraction), 0.05, 0.40),
      stopLossBps: Math.round(mutate(crossover(g1.stopLossBps, g2.stopLossBps), 15, 80)),
      takeProfitBps: Math.round(mutate(crossover(g1.takeProfitBps, g2.takeProfitBps), 25, 160)),
      maxHoldingTicks: Math.round(mutate(crossover(g1.maxHoldingTicks, g2.maxHoldingTicks), 20, 250)),
      
      weightImbalance: Math.max(0.1, mutate(crossover(g1.weightImbalance, g2.weightImbalance), 0.1, 3.0)),
      weightVwapZ: Math.max(0.1, mutate(crossover(g1.weightVwapZ, g2.weightVwapZ), 0.1, 3.0)),
      weightMomentum: Math.max(0.1, mutate(crossover(g1.weightMomentum, g2.weightMomentum), 0.1, 3.0)),
      weightHurst: Math.max(0.1, mutate(crossover(g1.weightHurst, g2.weightHurst), 0.1, 3.0)),
    };

    // Initial seed capital ($1,000) for unproven challenger
    const seedCapital = 1000;
    return new AlphaStrategyAgent(newGenome, seedCapital);
  }
}
