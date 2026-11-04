export class MockPCA9685 {
  healthy = true;
  calls: { channel: number; counts: number }[] = [];
  setPulseCounts(channel: number, counts: number) { this.calls.push({ channel, counts }); }
}
