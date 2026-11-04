import { robotConnection } from "./RobotConnection";
import { getCapabilities } from "./capabilities";
import { ROBOT_HARDWARE } from "../config/robot";

export class RobotManager {
  getStatus() {
    return {
      robotCode: ROBOT_HARDWARE.robotCode,
      name: ROBOT_HARDWARE.name,
      connection: robotConnection.getStatus(),
      capabilities: getCapabilities(),
    };
  }
}

export const robotManager = new RobotManager();
