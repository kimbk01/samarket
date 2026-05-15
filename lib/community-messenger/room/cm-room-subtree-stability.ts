"use client";

/** same-room subtree·hydration·effect 재실행 억제 (Strict Mode dev 포함) */
export const CM_ROOM_SUBTREE_REUSE_TTL_MS = 15_000;

type CmRoomSubtreeRoomState = {
  roomId: string;
  sessionId: string;
  hydrationPass: number;
  entryPassAdvanced: boolean;
  shellAttached: boolean;
  viewportAttached: boolean;
  composerAttached: boolean;
  lastAttachAt: number;
  strictDoubleInvokeBlocked: number;
  effectResetBlocked: number;
};

const roomStateById = new Map<string, CmRoomSubtreeRoomState>();
const strictEffectGuard = new Map<string, number>();
const globalAttachSeq = { n: 0 };

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function isDevStrictModeLikely(): boolean {
  return process.env.NODE_ENV === "development";
}

function guardKey(roomId: string, effectKey: string): string {
  return `${roomId}::${effectKey}`;
}

export function getCmRoomSubtreeHydrationPass(roomId: string): number {
  const id = String(roomId ?? "").trim();
  if (!id) return 1;
  const row = roomStateById.get(id);
  if (!row) return 1;
  if (perfNow() - row.lastAttachAt > CM_ROOM_SUBTREE_REUSE_TTL_MS) return 1;
  return Math.max(1, Math.min(3, row.hydrationPass));
}

export function setCmRoomSubtreeHydrationPass(roomId: string, pass: number): void {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  const row = roomStateById.get(id);
  if (!row) return;
  row.hydrationPass = Math.max(row.hydrationPass, pass);
  row.lastAttachAt = perfNow();
}

export function isCmRoomSubtreeEntryPassAdvanced(roomId: string): boolean {
  const id = String(roomId ?? "").trim();
  if (!id) return false;
  const row = roomStateById.get(id);
  if (!row) return false;
  if (perfNow() - row.lastAttachAt > CM_ROOM_SUBTREE_REUSE_TTL_MS) return false;
  return row.entryPassAdvanced;
}

export function markCmRoomSubtreeEntryPassAdvanced(roomId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  const row = roomStateById.get(id);
  if (row) {
    row.entryPassAdvanced = true;
    row.lastAttachAt = perfNow();
  }
}

export function shouldSkipCmRoomHydrationPassSchedule(roomId: string, targetPass: number): boolean {
  return getCmRoomSubtreeHydrationPass(roomId) >= targetPass;
}

/** subtree persist 값으로 hydration pass를 올린다(스케줄 skip 시에도 viewport pass 복구). */
export function bumpCmRoomHydrationPassFromPersisted(
  roomId: string,
  currentPass: number
): number {
  const id = String(roomId ?? "").trim();
  if (!id) return currentPass;
  const persisted = getCmRoomSubtreeHydrationPass(id);
  if (persisted <= currentPass) return currentPass;
  setCmRoomSubtreeHydrationPass(id, persisted);
  return persisted;
}

/** Strict Mode cleanup→re-run 시 동일 room·effect 1회만 실행 */
export function shouldBlockCmRoomStrictEffectReRun(roomId: string, effectKey: string): boolean {
  const id = String(roomId ?? "").trim();
  if (!id || !isDevStrictModeLikely()) return false;
  const key = guardKey(id, effectKey);
  const last = strictEffectGuard.get(key) ?? 0;
  const now = perfNow();
  if (now - last < 800) {
    const row = roomStateById.get(id);
    if (row) row.strictDoubleInvokeBlocked += 1;
    logCmRoomSubtreeStability({
      roomId: id,
      subtreeReused: true,
      shellRemounted: false,
      viewportRemounted: false,
      composerRemounted: false,
      strictDoubleInvokeBlocked: true,
      effectResetBlocked: true,
    });
    return true;
  }
  strictEffectGuard.set(key, now);
  return false;
}

export function logCmRoomSubtreeStability(payload: {
  roomId: string;
  subtreeReused: boolean;
  shellRemounted: boolean;
  viewportRemounted: boolean;
  composerRemounted: boolean;
  strictDoubleInvokeBlocked: boolean;
  effectResetBlocked: boolean;
}): void {
  // eslint-disable-next-line no-console -- subtree stability diagnostics
  console.log("[cm-room-subtree-stability]", payload);
}

export function noteCmRoomSubtreeAttach(
  roomId: string,
  surface: "shell" | "viewport" | "composer",
  sessionId = ""
): {
  reused: boolean;
  remounted: boolean;
} {
  const id = String(roomId ?? "").trim();
  if (!id) return { reused: false, remounted: false };
  const now = perfNow();
  let row = roomStateById.get(id);
  const expired = row != null && now - row.lastAttachAt > CM_ROOM_SUBTREE_REUSE_TTL_MS;
  if (!row || expired) {
    row = {
      roomId: id,
      sessionId,
      hydrationPass: 1,
      entryPassAdvanced: false,
      shellAttached: false,
      viewportAttached: false,
      composerAttached: false,
      lastAttachAt: now,
      strictDoubleInvokeBlocked: 0,
      effectResetBlocked: 0,
    };
    roomStateById.set(id, row);
  }
  if (sessionId) row.sessionId = sessionId;
  row.lastAttachAt = now;

  const wasAttached =
    surface === "shell"
      ? row.shellAttached
      : surface === "viewport"
        ? row.viewportAttached
        : row.composerAttached;

  if (surface === "shell") row.shellAttached = true;
  if (surface === "viewport") row.viewportAttached = true;
  if (surface === "composer") row.composerAttached = true;

  const remounted = wasAttached;
  const subtreeReused = wasAttached && !expired;

  logCmRoomSubtreeStability({
    roomId: id,
    subtreeReused,
    shellRemounted: surface === "shell" && remounted,
    viewportRemounted: surface === "viewport" && remounted,
    composerRemounted: surface === "composer" && remounted,
    strictDoubleInvokeBlocked: row.strictDoubleInvokeBlocked > 0,
    effectResetBlocked: row.effectResetBlocked > 0,
  });

  return { reused: subtreeReused, remounted };
}

export function noteCmRoomSubtreeClientMount(roomId: string, sessionId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  globalAttachSeq.n += 1;
  noteCmRoomSubtreeAttach(id, "shell", sessionId);
}

export function clearCmRoomSubtreeState(roomId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  roomStateById.delete(id);
  for (const key of strictEffectGuard.keys()) {
    if (key.startsWith(`${id}::`)) strictEffectGuard.delete(key);
  }
}

export function resetCmRoomSubtreeStateForTests(): void {
  roomStateById.clear();
  strictEffectGuard.clear();
  globalAttachSeq.n = 0;
}
