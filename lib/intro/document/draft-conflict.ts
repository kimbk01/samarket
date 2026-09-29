/**
 * Intro Draft 409 conflict recovery helpers (client-safe).
 *
 * Contract:
 * - Never retry blindly with stale expectedDraftVersion.
 * - Never overwrite newer server Draft from a failed Save.
 * - Never silently discard local edits without operator reload.
 * - Recovery = reload authoritative server Draft + adopt its draftVersion.
 */

export type DraftConflictInfo = {
  localExpectedDraftVersion: number;
  serverDraftVersion: number;
};

export function isDraftVersionConflictStatus(status: number): boolean {
  return status === 409;
}

/**
 * Build conflict info from a 409 response + local expected version.
 * If server version is missing, still mark conflict but serverDraftVersion
 * must be resolved via GET before recovery.
 */
export function buildDraftConflictInfo(args: {
  localExpectedDraftVersion: number;
  serverDraftVersionFrom409?: number;
}): DraftConflictInfo | null {
  const local = args.localExpectedDraftVersion;
  if (!Number.isInteger(local) || local < 1) return null;
  const server = args.serverDraftVersionFrom409;
  if (typeof server === "number" && Number.isInteger(server) && server >= 1) {
    return {
      localExpectedDraftVersion: local,
      serverDraftVersion: server,
    };
  }
  return {
    localExpectedDraftVersion: local,
    // Placeholder until GET authority completes — must not be used for Save.
    serverDraftVersion: local,
  };
}

/** After operator reloads server Draft, client must adopt this version for next Save. */
export function draftVersionAfterAuthorityReload(
  serverDraftVersion: number,
): number {
  if (!Number.isInteger(serverDraftVersion) || serverDraftVersion < 1) {
    throw new Error("INVALID_SERVER_DRAFT_VERSION");
  }
  return serverDraftVersion;
}

/**
 * While conflict is open: Save must not fire with the stale expected version.
 * Publish / Service Apply must remain blocked until clean state.
 */
export function isDraftConflictBlockingWrites(
  saveUi: string,
  conflict: DraftConflictInfo | null,
): boolean {
  return saveUi === "conflict" || conflict !== null;
}
