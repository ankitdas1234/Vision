import { ROBOT_HARDWARE } from "../config/robot";

/** Must accurately reflect CURRENT physical hardware — never report nonexistent hardware. */
export function getCapabilities() {
  return {
    controller: ROBOT_HARDWARE.controller,
    pwmDriver: ROBOT_HARDWARE.pwmDriver,
    servoCount: ROBOT_HARDWARE.servoCount,
    channels: ROBOT_HARDWARE.channels,
    sensors: ROBOT_HARDWARE.sensors,
    features: {
      camera: true,
      audio: true,
      ultrasonic: true,
      personTracking: true,
      gaitControl: true,
      cloudBrain: true,
      mentalIntelligence: true,
      curiosityEngine: true,
      dashboard: true,
      piScript: true,
      esp32DevKit: false,
      ttGear: false,
    },
  };
}
