export class MockESP32 {
  connected = false;
  heartbeats: unknown[] = [];
  connect() { this.connected = true; }
  sendHeartbeat(payload: unknown) { this.heartbeats.push(payload); }
}
