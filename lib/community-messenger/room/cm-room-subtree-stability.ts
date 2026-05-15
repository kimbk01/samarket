"use client";

import { warnCmPerfRegressionSubtreeRemounted } from "@/lib/community-messenger/room/cm-messenger-perf-regression-guard";
import { cmMessengerPerfVerboseLog } from "@/lib/community-messenger/room/cm-messenger-perf-verbose-log";

/** same-room subtree·hydration·effect 재실행 억제 (Strict Mode dev 포함) */
export const CM_ROOM_SUBTREE_REUSE_TTL_MS = 15_000;
const CM_ROOM_STRICT_UNMOUNT_REUSE_MS = 800;

type CmRoomSubtreeSurface = "shell" | "viewport" | "composer";

type CmRoomSubtreeRoomState = {
  roomId: string;
  sessionId: string;
  hydrationPass: number;
  entryPassAdvanced: boolean;
  shellAttached: boolean;
  viewportAttached: boolean;
  composerAttached: boolean;
  shellAttachMountGen: number;
  viewportAttachMountGen: number;
  composerAttachMountGen: number;
  reactMountGen: number;
  lastReactMountAt: number;
  lastReactUnmountAt: number;
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

function getSurfaceAttached(row: CmRoomSubtreeRoomState, surface: CmRoomSubtreeSurface): boolean {
  if (surface === "shell") return row.shellAttached;
  if (surface === "viewport") return row.viewportAttached;
  return row.composerAttached;
}

function setSurfaceAttached(row: CmRoomSubtreeRoomState, surface: CmRoomSubtreeSurface, attached: boolean): void {
  if (surface === "shell") row.shellAttached = attached;
  else if (surface === "viewport") row.viewportAttached = attached;
  else row.composerAttached = attached;
}

function getSurfaceAttachMountGen(row: CmRoomSubtreeRoomState, surface: CmRoomSubtreeSurface): number {
  if (surface === "shell") return row.shellAttachMountGen;
  if (surface === "viewport") return row.viewportAttachMountGen;
  return row.composerAttachMountGen;
}

function setSurfaceAttachMountGen(row: CmRoomSubtreeRoomState, surface: CmRoomSubtreeSurface, gen: number): void {
  if (surface === "shell") row.shellAttachMountGen = gen;
  else if (surface === "viewport") row.viewportAttachMountGen = gen;
  else row.composerAttachMountGen = gen;
}

function createRoomRow(roomId: string, sessionId: string, now: number): CmRoomSubtreeRoomState {
  return {
    roomId,
    sessionId,
    hydrationPass: 1,
    entryPassAdvanced: false,
    shellAttached: false,
    viewportAttached: false,
    composerAttached: false,
    shellAttachMountGen: 0,
    viewportAttachMountGen: 0,
    composerAttachMountGen: 0,
    reactMountGen: 0,
    lastReactMountAt: 0,
    lastReactUnmountAt: 0,
    lastAttachAt: now,
    strictDoubleInvokeBlocked: 0,
    effectResetBlocked: 0,
  };
}

function getOrRefreshRoomRow(roomId: string, sessionId = ""): CmRoomSubtreeRoomState {
  const id = String(roomId ?? "").trim();
  const now = perfNow();
  let row = roomStateById.get(id);
  const expired = row != null && now - row.lastAttachAt > CM_ROOM_SUBTREE_REUSE_TTL_MS;
  if (!row || expired) {
    row = createRoomRow(id, sessionId, now);
    roomStateById.set(id, row);
  }
  if (sessionId) row.sessionId = sessionId;
  row.lastAttachAt = now;
  return row;
}

function isStrictReactRemount(row: CmRoomSubtreeRoomState): boolean {
  if (row.lastReactUnmountAt <= 0) return false;
  return perfNow() - row.lastReactUnmountAt < CM_ROOM_STRICT_UNMOUNT_REUSE_MS;
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
  const row = getOrRefreshRoomRow(id);
  row.entryPassAdvanced = true;
  row.lastAttachAt = perfNow();
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
  if (now - last < CM_ROOM_STRICT_UNMOUNT_REUSE_MS) {
    const row = roomStateById.get(id);
    if (row) {
      row.strictDoubleInvokeBlocked += 1;
      row.effectResetBlocked += 1;
    }
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

export function isCmRoomSubtreeStrictDoubleInvoke(roomId: string): boolean {
  const id = String(roomId ?? "").trim();
  if (!id) return false;
  const row = roomStateById.get(id);
  if (!row) return false;
  return isStrictReactRemount(row) || row.strictDoubleInvokeBlocked > 0;
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
  const subtreeRemounted =
    payload.shellRemounted || payload.viewportRemounted || payload.composerRemounted;
  if (subtreeRemounted) {
    const surface = payload.composerRemounted
      ? "composer"
      : payload.viewportRemounted
        ? "viewport"
        : "shell";
    warnCmPerfRegressionSubtreeRemounted(payload.roomId, {
      surface,
      subtreeRemounted: true,
      strictDoubleInvokeBlocked: payload.strictDoubleInvokeBlocked,
    });
  }
  cmMessengerPerfVerboseLog("[cm-room-subtree-stability]", {
    ...payload,
    subtreeRemounted,
  });
}

/** React room client mount — Strict Mode 재마운트 시 attach 플래그 유지 */
export function noteCmRoomSubtreeReactMount(roomId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  const now = perfNow();
  const row = getOrRefreshRoomRow(id);
  const strictReuse = isStrictReactRemount(row);
  if (strictReuse) {
    row.strictDoubleInvokeBlocked += 1;
    row.effectResetBlocked += 1;
  } else if (row.reactMountGen > 0) {
    setSurfaceAttached(row, "shell", false);
    setSurfaceAttached(row, "viewport", false);
    setSurfaceAttached(row, "composer", false);
    setSurfaceAttachMountGen(row, "shell", 0);
    setSurfaceAttachMountGen(row, "viewport", 0);
    setSurfaceAttachMountGen(row, "composer", 0);
  }
  row.reactMountGen += 1;
  row.lastReactMountAt = now;
}

export function noteCmRoomSubtreeReactUnmount(roomId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  const row = roomStateById.get(id);
  if (!row) return;
  row.lastReactUnmountAt = perfNow();
}

/** 동일 React mount generation 에서 surface attach 로그·side-effect 1회만 */
export function shouldSkipCmRoomSubtreeSurfaceAttach(roomId: string, surface: CmRoomSubtreeSurface): boolean {
  const id = String(roomId ?? "").trim();
  if (!id) return false;
  const row = roomStateById.get(id);
  if (!row) return false;
  if (perfNow() - row.lastAttachAt > CM_ROOM_SUBTREE_REUSE_TTL_MS) return false;
  if (!getSurfaceAttached(row, surface)) return false;
  return getSurfaceAttachMountGen(row, surface) >= row.reactMountGen;
}

export function noteCmRoomSubtreeAttach(
  roomId: string,
  surface: CmRoomSubtreeSurface,
  sessionId = ""
): {
  reused: boolean;
  remounted: boolean;
  strictDoubleInvoke: boolean;
} {
  const id = String(roomId ?? "").trim();
  if (!id) return { reused: false, remounted: false, strictDoubleInvoke: false };

  if (shouldSkipCmRoomSubtreeSurfaceAttach(id, surface)) {
    const row = roomStateById.get(id)!;
    return {
      reused: true,
      remounted: false,
      strictDoubleInvoke: isStrictReactRemount(row) || row.strictDoubleInvokeBlocked > 0,
    };
  }

  const row = getOrRefreshRoomRow(id, sessionId);
  const strictDoubleInvoke = isStrictReactRemount(row) || row.strictDoubleInvokeBlocked > 0;
  const wasAttached = getSurfaceAttached(row, surface);
  const prevAttachGen = getSurfaceAttachMountGen(row, surface);
  const remounted =
    wasAttached && row.reactMountGen > 0 && (prevAttachGen < row.reactMountGen || strictDoubleInvoke);
  const subtreeReused = remounted && (strictDoubleInvoke || perfNow() - row.lastAttachAt <= CM_ROOM_SUBTREE_REUSE_TTL_MS);

  setSurfaceAttached(row, surface, true);
  setSurfaceAttachMountGen(row, surface, row.reactMountGen);

  logCmRoomSubtreeStability({
    roomId: id,
    subtreeReused,
    shellRemounted: surface === "shell" && remounted,
    viewportRemounted: surface === "viewport" && remounted,
    composerRemounted: surface === "composer" && remounted,
    strictDoubleInvokeBlocked: strictDoubleInvoke,
    effectResetBlocked: strictDoubleInvoke,
  });

  return { reused: subtreeReused, remounted, strictDoubleInvoke };
}

export function noteCmRoomSubtreeClientMount(roomId: string, sessionId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  globalAttachSeq.n += 1;
  noteCmRoomSubtreeAttach(id, "shell", sessionId);
}

/** room client mount/unmount — Strict Mode 에서 attach·session 유지 */
export function registerCmRoomSubtreeReactLifecycle(roomId: string): () => void {
  const id = String(roomId ?? "").trim();
  if (!id) return () => undefined;
  noteCmRoomSubtreeReactMount(id);
  return () => {
    noteCmRoomSubtreeReactUnmount(id);
  };
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
