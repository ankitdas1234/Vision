import { Router } from "express";
import { z } from "zod";
import sharp from "sharp";
import { usersRepository } from "../repositories/users.repository";
import { mediaFilesRepository } from "../repositories/mediaFiles.repository";
import { googleDriveService } from "../google-drive/GoogleDriveService";
import { matchOrCreatePersonForFace } from "../auth/FaceLinking";
import { resolvePersonPhotos } from "../people/PersonPhotos";
import { peopleRepository } from "../repositories/people.repository";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/authorization";
import { validateBody } from "../middleware/validation";
import { audit } from "../auth/AuditService";
import type { AuthedRequest } from "../middleware/auth";

export const usersRouter = Router();

/** Attaches an `avatarUrl` alongside the raw `avatarMediaId` so callers
 * never have to separately resolve the media row themselves. `null` when
 * unset (or stored without a Drive credential in dev — see
 * GoogleDriveService) — the dashboard falls back to initials either way.
 * Deliberately does NOT resolve `linkedPerson` here — see
 * `withLinkedPerson` below for why that's kept separate. */
async function withAvatarUrl<T extends { avatarMediaId?: string | null }>(user: T | null) {
  if (!user) return user;
  const avatarUrl = user.avatarMediaId ? (await mediaFilesRepository.findById(user.avatarMediaId))?.googleDriveUrl ?? null : null;
  return { ...user, avatarUrl };
}

/** Same as `withAvatarUrl`, plus the linked `people` identity resolved
 * into a `linkedPerson` summary (name + most recent photo) — see
 * auth/FaceLinking.ts and docs/people.md "One identity, however you
 * first met". Deliberately kept separate from `withAvatarUrl` rather
 * than folded into it: resolving a person costs 2-4 extra queries
 * (person lookup + `resolvePersonPhotos`'s own face/observation/media
 * lookups), which is fine for a single-account detail page but would
 * be a real N+1 multiplied across every row of `GET /users` — a page
 * that doesn't even show `linkedPerson` today. Use this only where the
 * caller actually renders it. */
async function withLinkedPerson<T extends { avatarMediaId?: string | null; personId?: string | null }>(user: T | null) {
  if (!user) return user;
  const withAvatar = await withAvatarUrl(user);
  if (!user.personId) return { ...withAvatar, linkedPerson: null };
  const [person, photos] = await Promise.all([peopleRepository.findById(user.personId), resolvePersonPhotos(user.personId)]);
  return { ...withAvatar, linkedPerson: person ? { id: person.id, name: person.name, photoUrl: photos.mostRecentPhotoUrl } : null };
}

// Own-account avatar/face-link endpoints: any logged-in user may set/
// clear their own profile picture or link their account to the person
// Vision knows them as, so these sit BEFORE the router-wide requireAdmin
// below and only require requireAuth. Everything else under /users
// (listing accounts, changing someone else's role/status) stays
// ADMIN-only, per docs/auth.md.
usersRouter.post("/users/me/avatar", requireAuth, async (req: AuthedRequest, res) => {
  const imageBase64 = req.body?.imageBase64;
  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    return res.status(400).json({ code: "INVALID_REQUEST", message: "imageBase64 is required" });
  }
  const raw = Buffer.from(imageBase64, "base64");
  // Normalize to a small square JPEG so a phone photo straight out of the
  // camera roll doesn't ship a multi-MB original into every topbar/list
  // row that renders this avatar.
  const resized = await sharp(raw, { failOn: "none" }).rotate().resize(256, 256, { fit: "cover" }).jpeg({ quality: 85 }).toBuffer();
  const upload = await googleDriveService.uploadImage(resized, `avatar-${req.user!.id}-${Date.now()}.jpg`);
  const media = await mediaFilesRepository.create({
    mediaType: "IMAGE",
    mimeType: "image/jpeg",
    filename: `avatar-${req.user!.id}.jpg`,
    googleDriveFileId: upload.googleDriveFileId,
    googleDriveUrl: upload.googleDriveUrl,
    fileSize: resized.length,
    checksum: upload.checksum,
    metadata: { kind: "USER_AVATAR", userId: req.user!.id },
  });
  const updated = await usersRepository.setAvatar(req.user!.id, media.id);
  res.json(await withAvatarUrl(updated));
});

usersRouter.delete("/users/me/avatar", requireAuth, async (req: AuthedRequest, res) => {
  const updated = await usersRepository.setAvatar(req.user!.id, null);
  res.json(await withAvatarUrl(updated));
});

// For someone who registered without granting camera access (or simply
// hadn't met Vision yet at the time) and now wants "Vision already
// knows me" carried onto their dashboard account. Exact same matching
// AuthService.register uses at signup — see auth/FaceLinking.ts — just
// triggered later, from Settings, instead of during account creation.
usersRouter.post("/users/me/link-face", requireAuth, async (req: AuthedRequest, res) => {
  const existing = await usersRepository.findById(req.user!.id);
  if (existing?.personId) {
    return res.status(400).json({ code: "ALREADY_LINKED", message: "This account is already linked to a person" });
  }
  const imageBase64 = req.body?.imageBase64;
  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    return res.status(400).json({ code: "INVALID_REQUEST", message: "imageBase64 is required" });
  }
  const result = await matchOrCreatePersonForFace(imageBase64, existing?.name);
  if (result.status === "NO_FACE") return res.status(422).json({ code: "NO_FACE_DETECTED", message: "No face could be found in the supplied image" });
  if (result.status === "LOW_QUALITY") return res.status(422).json({ code: "LOW_QUALITY_FACE", message: "Face image quality too low to link", reasons: result.reasons });

  const updated = await usersRepository.linkToPerson(req.user!.id, result.personId);
  res.json({ ...(await withLinkedPerson(updated)), matchedExisting: result.matchedExisting });
});

usersRouter.use("/users", requireAuth, requireAdmin);

usersRouter.get("/users", async (_req, res) => res.json(await Promise.all((await usersRepository.list()).map(withAvatarUrl))));

// Full account detail for the admin "view this user's profile" page —
// same fields the list already returns, plus the linked-person summary
// (`withLinkedPerson`, not the list's lighter `withAvatarUrl` — see that
// function's comment for why) — and 404s when it doesn't exist instead
// of silently omitting it from a list.
usersRouter.get("/users/:id", async (req, res) => {
  const user = await usersRepository.findById(req.params.id);
  if (!user) return res.status(404).json({ code: "NOT_FOUND", message: "User not found" });
  res.json(await withLinkedPerson(user));
});

usersRouter.patch("/users/:id/role", validateBody(z.object({ role: z.enum(["ADMIN", "TRUSTED", "USER"]) })), async (req: AuthedRequest, res) => {
  // A normal user can never self-promote — this route itself already requires ADMIN,
  // and admins may not demote their own last-remaining admin account via this simple check.
  if (req.params.id === req.user?.id && req.body.role !== "ADMIN") {
    return res.status(400).json({ code: "SELF_DEMOTION_BLOCKED", message: "Admins cannot demote their own account here" });
  }
  const updated = await usersRepository.updateRole(req.params.id, req.body.role);
  await audit("ROLE_CHANGED", { userId: req.user?.id, metadata: { targetUserId: req.params.id, newRole: req.body.role } });
  res.json(updated);
});

usersRouter.patch("/users/:id/status", validateBody(z.object({ isActive: z.boolean() })), async (req: AuthedRequest, res) => {
  const updated = await usersRepository.updateStatus(req.params.id, req.body.isActive);
  await audit(req.body.isActive ? "ACCOUNT_VERIFIED" : "ACCOUNT_DISABLED", { userId: req.user?.id, metadata: { targetUserId: req.params.id } });
  res.json(updated);
});
