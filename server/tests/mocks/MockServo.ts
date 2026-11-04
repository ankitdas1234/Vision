export class MockPositionalServo {
  angle = 90;
  setAngle(a: number) { this.angle = Math.max(0, Math.min(180, a)); return this.angle; }
}
export class MockContinuousServo {
  speed = 0; direction: "FORWARD" | "REVERSE" | "STOP" = "STOP";
  forward(s: number) { this.direction = "FORWARD"; this.speed = s; }
  reverse(s: number) { this.direction = "REVERSE"; this.speed = s; }
  stop() { this.direction = "STOP"; this.speed = 0; }
}
