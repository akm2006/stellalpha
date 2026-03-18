export class PerformanceTimer {
  private startTime: number;
  private checkpoints: Map<string, number> = new Map();
  private lastCheckpoint: number;

  constructor(label: string) {
    this.startTime = Date.now();
    this.lastCheckpoint = this.startTime;
    console.log(`[PERF] ${label} - Started`);
  }

  checkpoint(label: string) {
    const now = Date.now();
    const stepTime = now - this.lastCheckpoint;
    const totalTime = now - this.startTime;
    this.checkpoints.set(label, stepTime);
    console.log(`[PERF] ${label}: +${stepTime}ms (total: ${totalTime}ms)`);
    this.lastCheckpoint = now;
    return stepTime;
  }

  finish(label: string = 'Complete') {
    const totalTime = Date.now() - this.startTime;
    console.log(`[PERF] ${label}: TOTAL ${totalTime}ms`);
    return totalTime;
  }
}
