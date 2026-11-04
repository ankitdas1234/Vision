#!/usr/bin/env node
// Sanity-checks that the servo map hasn't drifted between the server and the firmware.
//
// Authoritative layout (3 servos):
//   CH0 head (positional 0-180, camera + HC-SR04 on it), CH1 left leg, CH2 right leg (continuous).
// Sources of truth that must agree:
//   server/src/servos/ServoConfiguration.ts   (HEAD_CHANNEL, LEG_CHANNELS)
//   server/src/config/robot.ts                (ROBOT_HARDWARE.channels, servoCount)
//   firmware/esp32-cam/src/config/servo_config.h  and its Arduino mirror  (CH_HEAD, CH_LEFT_LEG, CH_RIGHT_LEG)
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const EXPECTED = { head: 0, leftLeg: 1, rightLeg: 2 };
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); };

// --- server: ServoConfiguration.ts
const cfg = read("server/src/servos/ServoConfiguration.ts");
check(new RegExp(`HEAD_CHANNEL\\s*=\\s*${EXPECTED.head}\\b`).test(cfg), `ServoConfiguration.ts: HEAD_CHANNEL must be ${EXPECTED.head}`);
check(new RegExp(`left:\\s*${EXPECTED.leftLeg}\\b`).test(cfg) && new RegExp(`right:\\s*${EXPECTED.rightLeg}\\b`).test(cfg), `ServoConfiguration.ts: LEG_CHANNELS must be left:${EXPECTED.leftLeg}, right:${EXPECTED.rightLeg}`);

// --- server: robot.ts
const robot = read("server/src/config/robot.ts");
check(/servoCount:\s*3\b/.test(robot), "config/robot.ts: servoCount must be 3");
check(/0:\s*\{\s*purpose:\s*"HEAD"/.test(robot) && /1:\s*\{\s*purpose:\s*"LEFT_LEG"/.test(robot) && /2:\s*\{\s*purpose:\s*"RIGHT_LEG"/.test(robot), "config/robot.ts: channels must be 0=HEAD, 1=LEFT_LEG, 2=RIGHT_LEG");

// --- firmware (PlatformIO + Arduino mirror)
for (const f of ["firmware/esp32-cam/src/config/servo_config.h", "firmware/esp32-cam-arduino/servo_config.h"]) {
  const h = read(f);
  const def = (name) => { const m = h.match(new RegExp(`#define\\s+${name}\\s+(\\d+)`)); return m ? Number(m[1]) : null; };
  check(def("CH_HEAD") === EXPECTED.head, `${f}: CH_HEAD must be ${EXPECTED.head}`);
  check(def("CH_LEFT_LEG") === EXPECTED.leftLeg, `${f}: CH_LEFT_LEG must be ${EXPECTED.leftLeg}`);
  check(def("CH_RIGHT_LEG") === EXPECTED.rightLeg, `${f}: CH_RIGHT_LEG must be ${EXPECTED.rightLeg}`);
  check(!/CH_\w*JOINT|CH_\w*ROTATION/.test(h), `${f}: still defines an old joint/rotation channel`);
}

// --- the removed commands must be gone everywhere they used to live
for (const f of ["server/src/packages/commands.ts", "firmware/esp32-cam/src/protocol/CommandTypes.h", "firmware/esp32-cam/src/protocol/MessageParser.cpp"]) {
  check(!/LEG_JOINT|LEG_CENTER/.test(read(f)), `${f}: still mentions LEFT/RIGHT_LEG_JOINT or *_LEG_CENTER`);
}

console.log("Expected servo map:", { 0: "HEAD (positional 0-180)", 1: "LEFT_LEG (continuous)", 2: "RIGHT_LEG (continuous)" });
if (problems.length) {
  console.error("\nServo map drift detected:\n - " + problems.join("\n - "));
  process.exit(1);
}
console.log("OK — server and firmware agree on the 3-servo layout.");
