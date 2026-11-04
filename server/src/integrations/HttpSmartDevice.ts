import { logger } from "../logging/Logger";

/**
 * SMART DEVICE CONTROL
 * --------------------
 * Implements the previously-documented extension point: "when explicitly
 * authorized, interact with and control small/medium/moderate-scale
 * connected systems." Deliberately generic rather than a specific vendor
 * SDK — a huge fraction of home smart devices are controllable by hitting
 * one URL:
 *
 *   - Shelly Gen1 relays:   GET http://<device-ip>/relay/0?turn=on
 *   - Tasmota:              GET http://<device-ip>/cm?cmnd=Power%20On
 *   - Home Assistant:       POST to a configured webhook/automation trigger
 *   - IFTTT Maker webhooks: POST https://maker.ifttt.com/trigger/<event>/...
 *
 * This module sends exactly the request an admin configured for a device
 * (see database/schema.ts smartDevices, routes/smartDevices.routes.ts) —
 * it has no protocol-specific knowledge of any vendor, which is what
 * makes one implementation work for all of the examples above.
 *
 * SECURITY NOTE: registering a device means giving this server permission
 * to send an HTTP request to an arbitrary URL on command — that's exactly
 * as powerful as it sounds, which is why registration
 * (routes/smartDevices.routes.ts) is ADMIN-only. Only `http://`/`https://`
 * URLs are accepted (checked both at registration and again here, defense
 * in depth); this does not attempt to block requests to internal/private
 * network addresses (a full SSRF defense would need to resolve and check
 * the target IP, a reasonable follow-up for a deployment reachable by
 * untrusted admins — for a single-household robot where the only admin
 * is the household itself, the realistic risk is low, but don't register
 * a device pointing at infrastructure you wouldn't want any authenticated
 * user of this robot to be able to poke).
 */

export interface SmartDeviceConfig {
  name: string;
  triggerUrl: string;
  method: string; // "GET" | "POST" — stored as a plain string in the DB row
  headers?: unknown;
  body?: string | null;
}

export interface SmartDeviceTriggerResult {
  [key: string]: unknown;
  success: boolean;
  statusCode?: number;
  error?: string;
}

const REQUEST_TIMEOUT_MS = 8_000;

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function coerceHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== "object") return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

export async function triggerSmartDevice(device: SmartDeviceConfig): Promise<SmartDeviceTriggerResult> {
  if (!isValidHttpUrl(device.triggerUrl)) {
    return { success: false, error: `Refusing to trigger "${device.name}": trigger URL is not a valid http(s) URL` };
  }

  const method = device.method?.toUpperCase() === "POST" ? "POST" : "GET";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(device.triggerUrl, {
      method,
      headers: coerceHeaders(device.headers),
      body: method === "POST" && device.body ? device.body : undefined,
      signal: controller.signal,
    });
    return { success: res.ok, statusCode: res.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Smart device trigger failed", { device: device.name, error: message });
    return { success: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}
