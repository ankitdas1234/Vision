export type ConnectionStatus = "ONLINE" | "OFFLINE" | "MOCK";

export class RobotConnection {
  private status: ConnectionStatus = "OFFLINE";
  private lastHeartbeatAt: number | null = null;

  markHeartbeat(mock: boolean) {
    this.lastHeartbeatAt = Date.now();
    this.status = mock ? "MOCK" : "ONLINE";
  }

  /** Milliseconds since the last heartbeat from ANY transport (null = never). */
  lastHeartbeatAgoMs(): number | null {
    return this.lastHeartbeatAt === null ? null : Date.now() - this.lastHeartbeatAt;
  }

  getStatus(): ConnectionStatus {
    if (this.lastHeartbeatAt && Date.now() - this.lastHeartbeatAt > 15_000 && this.status !== "MOCK") {
      this.status = "OFFLINE";
    }
    return this.status;
  }
}

export const robotConnection = new RobotConnection();
