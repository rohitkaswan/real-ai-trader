import { Level2OrderBook, MarketTick, MicrostructureFeatures } from '../types/trading';

export class MicrostructureEngine {
  private tickHistory: MarketTick[] = [];
  private readonly maxTickHistory = 2000;
  
  // Rolling bar buffer for Parkinson volatility (1-second micro-bars)
  private bars: { high: number; low: number; open: number; close: number; volume: number; timestamp: number }[] = [];
  private currentBar: { high: number; low: number; open: number; close: number; volume: number; timestamp: number } | null = null;
  private readonly barDurationMs = 1000;

  // Level-2 orderbook cache
  private latestBook: Level2OrderBook | null = null;

  public updateOrderBook(book: Level2OrderBook): void {
    this.latestBook = book;
  }

  public pushTick(tick: MarketTick): MicrostructureFeatures {
    // Maintain chronological isolation
    this.tickHistory.push(tick);
    if (this.tickHistory.length > this.maxTickHistory) {
      this.tickHistory.shift();
    }

    // Update 1-second micro-bars for Parkinson Volatility
    const barTime = Math.floor(tick.timestamp / this.barDurationMs) * this.barDurationMs;
    if (!this.currentBar || this.currentBar.timestamp !== barTime) {
      if (this.currentBar) {
        this.bars.push(this.currentBar);
        if (this.bars.length > 300) {
          this.bars.shift();
        }
      }
      this.currentBar = {
        timestamp: barTime,
        open: tick.lastPrice,
        high: tick.lastPrice,
        low: tick.lastPrice,
        close: tick.lastPrice,
        volume: tick.lastQty,
      };
    } else {
      this.currentBar.high = Math.max(this.currentBar.high, tick.lastPrice);
      this.currentBar.low = Math.min(this.currentBar.low, tick.lastPrice);
      this.currentBar.close = tick.lastPrice;
      this.currentBar.volume += tick.lastQty;
    }

    return this.calculateFeatures(tick);
  }

  public calculateFeatures(tick: MarketTick): MicrostructureFeatures {
    const midPrice = (tick.bidPrice + tick.askPrice) / 2;
    const spreadBps = midPrice > 0 ? ((tick.askPrice - tick.bidPrice) / midPrice) * 10000 : 0;
    
    // Effective Spread: 2 * |P_trade - Mid| / Mid
    const effectiveSpreadBps = midPrice > 0 ? (2 * Math.abs(tick.lastPrice - midPrice) / midPrice) * 10000 : spreadBps;

    // 1. Level-2 Order Book Imbalance (Top 10 levels)
    const imbalance = this.calculateOrderBookImbalance(this.latestBook, tick);

    // 2. Parkinson Rolling Volatility
    const parkinsonVol = this.calculateParkinsonVolatility(30);

    // 3. Hurst Exponent (Rolling 100 ticks)
    const hurst = this.calculateHurstExponent(128);

    // 4. VWAP & Rolling VWAP Z-Score
    const { vwap, vwapDeviationZ } = this.calculateVwapAndZ(150, tick.lastPrice);

    // 5. Momentum Z-Score (Rolling 50 ticks)
    const momentumZ = this.calculateMomentumZ(50, tick.lastPrice);

    return {
      symbol: tick.symbol,
      timestamp: tick.timestamp,
      midPrice,
      spreadBps,
      effectiveSpreadBps,
      orderBookImbalance: imbalance,
      parkinsonVolatility: parkinsonVol,
      hurstExponent: hurst,
      vwap,
      vwapDeviationZ,
      momentumZ,
    };
  }

  /**
   * Order Book Imbalance: (V_bid - V_ask) / (V_bid + V_ask)
   */
  public calculateOrderBookImbalance(book: Level2OrderBook | null, fallbackTick: MarketTick): number {
    if (!book || (!book.bids.length && !book.asks.length)) {
      const bidVol = fallbackTick.bidQty || 1;
      const askVol = fallbackTick.askQty || 1;
      return (bidVol - askVol) / (bidVol + askVol);
    }

    const depthLevels = Math.min(10, book.bids.length, book.asks.length);
    let totalBidVolume = 0;
    let totalAskVolume = 0;

    for (let i = 0; i < depthLevels; i++) {
      totalBidVolume += book.bids[i][1];
      totalAskVolume += book.asks[i][1];
    }

    const sum = totalBidVolume + totalAskVolume;
    if (sum === 0) return 0;
    return (totalBidVolume - totalAskVolume) / sum;
  }

  /**
   * Parkinson Volatility:
   * sigma_p = sqrt( (1 / (4 * ln(2) * N)) * sum( (ln(High_i / Low_i))^2 ) )
   */
  public calculateParkinsonVolatility(windowBars = 30): number {
    const activeBars = [...this.bars];
    if (this.currentBar) activeBars.push(this.currentBar);

    if (activeBars.length < 5) return 0.001; // Minimum prior

    const sample = activeBars.slice(-windowBars);
    const N = sample.length;
    let sumLnHL2 = 0;

    for (const bar of sample) {
      if (bar.low > 0 && bar.high >= bar.low) {
        const ratio = bar.high / bar.low;
        const lnHL = Math.log(Math.max(1.000001, ratio));
        sumLnHL2 += lnHL * lnHL;
      }
    }

    const factor = 1 / (4 * Math.LN2 * N);
    const variance = factor * sumLnHL2;
    return Math.sqrt(Math.max(0, variance));
  }

  /**
   * Hurst Exponent via Rescaled Range (R/S) Analysis:
   * H < 0.5: Mean-reverting regime
   * H = 0.5: Geometric Brownian Motion (random walk)
   * H > 0.5: Persistent trending regime
   */
  public calculateHurstExponent(windowTicks = 128): number {
    if (this.tickHistory.length < 32) return 0.5;

    const sample = this.tickHistory.slice(-windowTicks).map(t => t.lastPrice);
    const N = sample.length;
    if (N < 32) return 0.5;

    // Log returns: r_t = ln(P_t / P_{t-1})
    const returns: number[] = [];
    for (let i = 1; i < N; i++) {
      if (sample[i - 1] > 0 && sample[i] > 0) {
        returns.push(Math.log(sample[i] / sample[i - 1]));
      }
    }

    if (returns.length < 30) return 0.5;

    // Divide returns into sub-windows to estimate R/S across scales: 8, 16, 32, 64
    const scales = [8, 16, 32, 64].filter(s => s <= returns.length / 2);
    if (scales.length < 2) return 0.5;

    const logScales: number[] = [];
    const logRS: number[] = [];

    for (const scale of scales) {
      const numSegments = Math.floor(returns.length / scale);
      let totalRS = 0;

      for (let seg = 0; seg < numSegments; seg++) {
        const segReturns = returns.slice(seg * scale, (seg + 1) * scale);
        const mean = segReturns.reduce((acc, v) => acc + v, 0) / scale;

        // Cumulative deviations: Y_t = sum(r_i - mean)
        let cumDev = 0;
        let maxDev = -Infinity;
        let minDev = Infinity;
        let sumSqDiff = 0;

        for (const r of segReturns) {
          const diff = r - mean;
          cumDev += diff;
          if (cumDev > maxDev) maxDev = cumDev;
          if (cumDev < minDev) minDev = cumDev;
          sumSqDiff += diff * diff;
        }

        const range = maxDev - minDev;
        const stdDev = Math.sqrt(sumSqDiff / scale);

        if (stdDev > 1e-9 && range > 0) {
          totalRS += range / stdDev;
        } else {
          totalRS += 1.0;
        }
      }

      const meanRS = totalRS / numSegments;
      if (meanRS > 0) {
        logScales.push(Math.log(scale));
        logRS.push(Math.log(meanRS));
      }
    }

    if (logScales.length < 2) return 0.5;

    // Linear regression: ln(R/S) = H * ln(scale) + C
    const meanX = logScales.reduce((a, b) => a + b, 0) / logScales.length;
    const meanY = logRS.reduce((a, b) => a + b, 0) / logRS.length;

    let covXY = 0;
    let varX = 0;
    for (let i = 0; i < logScales.length; i++) {
      const dx = logScales[i] - meanX;
      covXY += dx * (logRS[i] - meanY);
      varX += dx * dx;
    }

    if (varX === 0) return 0.5;
    const H = covXY / varX;
    
    // Clamp to valid Hurst domain [0.05, 0.95]
    return Math.max(0.05, Math.min(0.95, H));
  }

  /**
   * VWAP and Rolling Z-Score:
   * VWAP = sum(P * V) / sum(V)
   * Z = (Price - VWAP) / std(P)
   */
  public calculateVwapAndZ(window = 100, currentPrice: number): { vwap: number; vwapDeviationZ: number } {
    if (this.tickHistory.length === 0) {
      return { vwap: currentPrice, vwapDeviationZ: 0 };
    }

    const sample = this.tickHistory.slice(-window);
    let sumPV = 0;
    let sumV = 0;

    for (const t of sample) {
      const vol = Math.max(0.0001, t.lastQty || 1);
      sumPV += t.lastPrice * vol;
      sumV += vol;
    }

    const vwap = sumV > 0 ? sumPV / sumV : currentPrice;

    // Rolling standard deviation of price relative to VWAP
    let sumSqDiff = 0;
    for (const t of sample) {
      const diff = t.lastPrice - vwap;
      sumSqDiff += diff * diff;
    }

    const std = Math.sqrt(sumSqDiff / sample.length);
    const vwapDeviationZ = std > 1e-6 ? (currentPrice - vwap) / std : 0;

    return { vwap, vwapDeviationZ };
  }

  /**
   * Rolling Momentum Z-Score: (Price_t - Mean_w) / Std_w
   */
  public calculateMomentumZ(lookback = 50, currentPrice: number): number {
    if (this.tickHistory.length < 5) return 0;

    const sample = this.tickHistory.slice(-lookback).map(t => t.lastPrice);
    const mean = sample.reduce((a, b) => a + b, 0) / sample.length;

    let sumSq = 0;
    for (const p of sample) {
      sumSq += (p - mean) * (p - mean);
    }

    const std = Math.sqrt(sumSq / sample.length);
    if (std < 1e-6) return 0;

    return (currentPrice - mean) / std;
  }
}
