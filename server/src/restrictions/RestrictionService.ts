import { adminRestrictionsRepository } from "../repositories/adminRestrictions.repository";
import type { CommandType } from "../packages/types";

export class RestrictionError extends Error {
  code = "ADMIN_RESTRICTED";
}

interface CachedRestriction {
  id: string;
  commandType: string;
  scopedPersonId: string | null;
  reason: string | null;
}

/**
 * "Vision, don't do that" — a standing veto an ADMIN places on a command
 * type, either for everyone or for one specific person. Checked by
 * CommandRegistry on every dispatch (AI, dashboard, Vision Script — all of
 * them), so once vetoed, nothing re-triggers that command until an admin
 * explicitly lifts it. This is deliberately separate from ADMIN_ONLY_COMMANDS
 * (a static allow-list) — restrictions are a dynamic, runtime block an admin
 * can set and lift live, including by voice.
 */
class RestrictionService {
  private cache: CachedRestriction[] | null = null;

  private async loadCache(): Promise<CachedRestriction[]> {
    if (this.cache) return this.cache;
    try {
      const rows = await adminRestrictionsRepository.listActive();
      this.cache = rows.map((r) => ({ id: r.id, commandType: r.commandType, scopedPersonId: r.scopedPersonId, reason: r.reason }));
      return this.cache;
    } catch {
      // DB hiccup — fail OPEN here (don't block commands on a transient DB
      // error) but don't cache the failure, so the next call retries.
      return [];
    }
  }

  private invalidate() {
    this.cache = null;
  }

  /** Returns the matching restriction (if any) blocking this command for this person right now. */
  async check(commandType: CommandType, personId?: string | null): Promise<CachedRestriction | null> {
    const active = await this.loadCache();
    return (
      active.find((r) => r.commandType === commandType && (r.scopedPersonId === null || r.scopedPersonId === personId)) ?? null
    );
  }

  async ban(commandType: CommandType, opts: { scopedPersonId?: string | null; reason?: string; createdByUserId: string }) {
    const row = await adminRestrictionsRepository.create({
      commandType,
      scopedPersonId: opts.scopedPersonId ?? null,
      reason: opts.reason ?? null,
      createdByUserId: opts.createdByUserId,
      active: true,
    });
    this.invalidate();
    return row;
  }

  async lift(commandType: CommandType, scopedPersonId?: string | null) {
    await adminRestrictionsRepository.liftByCommandType(commandType, scopedPersonId ?? null);
    this.invalidate();
  }

  async list() {
    return adminRestrictionsRepository.listActive();
  }
}

export const restrictionService = new RestrictionService();
