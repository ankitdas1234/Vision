/** Tracks which way each robot's head is currently sweeping mid-scan. Kept
 * separate from AttentionController/ServoManager since it's neither
 * attention state nor servo hardware state — just the scan's own memory of
 * "which way was I going". */
const scanDirectionByRobot = new Map<string, 1 | -1>();

export function getScanDirectionFor(robotId: string): 1 | -1 {
  return scanDirectionByRobot.get(robotId) ?? 1;
}

export function setScanDirectionFor(robotId: string, direction: 1 | -1) {
  scanDirectionByRobot.set(robotId, direction);
}

export function resetScanDirectionFor(robotId: string) {
  scanDirectionByRobot.delete(robotId);
}
