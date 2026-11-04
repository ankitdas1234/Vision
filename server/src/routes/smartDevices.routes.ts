import { Router } from "express";
import { smartDevicesRepository } from "../repositories/smartDevices.repository";
import { isValidHttpUrl } from "../integrations/HttpSmartDevice";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/authorization";

export const smartDevicesRouter = Router();
// Scoped to this router's own prefix — see audio.routes.ts for why an
// unscoped `.use(requireAuth)` would leak into every other router mounted
// on the same flat /api namespace.
//
// ADMIN-only, full stop: registering a device gives the server permission
// to send an HTTP request to whatever URL is configured, on command —
// see integrations/HttpSmartDevice.ts "SECURITY NOTE" for the full
// reasoning. Triggering an already-registered device (via the
// SMART_DEVICE_TRIGGER command, dispatched through the normal command
// pipeline) is available to any authenticated user, the same as any
// other command — it's *adding new devices* that's restricted here.
smartDevicesRouter.use("/smart-devices", requireAuth, requireRole("ADMIN"));

smartDevicesRouter.get("/smart-devices", async (_req, res) => {
  res.json(await smartDevicesRepository.list());
});

smartDevicesRouter.post("/smart-devices", async (req: AuthedRequest, res) => {
  const { name, category, triggerUrl, method, headers, body } = req.body ?? {};
  if (typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ code: "INVALID_REQUEST", message: "name is required" });
  }
  if (typeof triggerUrl !== "string" || !isValidHttpUrl(triggerUrl)) {
    return res.status(400).json({ code: "INVALID_REQUEST", message: "triggerUrl must be a valid http(s) URL" });
  }
  const normalizedMethod = typeof method === "string" && method.toUpperCase() === "POST" ? "POST" : "GET";

  const existing = await smartDevicesRepository.findByName(name);
  if (existing) {
    return res.status(409).json({ code: "ALREADY_EXISTS", message: `A device named "${name}" is already registered` });
  }

  const device = await smartDevicesRepository.create({
    name,
    category: typeof category === "string" ? category : "other",
    triggerUrl,
    method: normalizedMethod,
    headers: headers ?? null,
    body: typeof body === "string" ? body : null,
    createdByUserId: req.user?.id,
  });
  res.status(201).json(device);
});

smartDevicesRouter.delete("/smart-devices/:id", async (req, res) => {
  await smartDevicesRepository.delete(req.params.id);
  res.status(204).send();
});
