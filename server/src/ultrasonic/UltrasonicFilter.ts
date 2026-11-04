/**
 * Combines a moving average with a median filter to reject single-sample
 * spikes/noise typical of HC-SR04 echo timing jitter.
 */
export class UltrasonicFilter {
  private window: number[] = [];
  constructor(private windowSize = 5) {}

  push(rawMm: number): number {
    this.window.push(rawMm);
    if (this.window.length > this.windowSize) this.window.shift();
    return this.filtered();
  }

  private filtered(): number {
    if (this.window.length === 0) return 0;
    const sorted = [...this.window].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const mean = this.window.reduce((s, v) => s + v, 0) / this.window.length;
    // Blend median (robust to spikes) with mean (smoother) for the final value.
    return median * 0.6 + mean * 0.4;
  }

  confidence(): number {
    if (this.window.length < 2) return this.window.length === 0 ? 0 : 0.5;
    const mean = this.window.reduce((s, v) => s + v, 0) / this.window.length;
    const variance = this.window.reduce((s, v) => s + (v - mean) ** 2, 0) / this.window.length;
    const stdDev = Math.sqrt(variance);
    // Lower spread relative to the mean -> higher confidence.
    const relativeSpread = mean === 0 ? 1 : stdDev / mean;
    return Math.max(0, Math.min(1, 1 - relativeSpread));
  }

  reset() { this.window = []; }
}
