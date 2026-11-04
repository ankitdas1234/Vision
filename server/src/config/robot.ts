

/**
 * Hardware truth: 1x ESP32-CAM, 1x PCA9685, 3 servos (head + left leg +
 * right leg), mic, speaker, HC-SR04 on the head. See servos/ServoConfiguration.ts
 * for the layout and why there are no leg-joint servos any more.
 */
export const ROBOT_HARDWARE = {
  robotCode: "vision-001",
  name: "Vision",
  controller: "ESP32-CAM",
  pwmDriver: "PCA9685",
  servoCount: 3,
  channels: {
    0: { purpose: "HEAD", type: "POSITIONAL" as const },
    1: { purpose: "LEFT_LEG", type: "CONTINUOUS" as const },
    2: { purpose: "RIGHT_LEG", type: "CONTINUOUS" as const },
  },
  sensors: {
    microphone: true,
    speaker: true,
    // Rides on the head servo with the camera, so it looks wherever the head looks.
    ultrasonic: { model: "HC-SR04", purpose: ["distance", "obstacle_detection", "movement_safety"], mounting: "ON_HEAD" as const },
  },
};
