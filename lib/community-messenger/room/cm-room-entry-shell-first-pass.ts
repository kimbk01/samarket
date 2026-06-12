"use client";

import { noteCmRoomRouteChunkWarmRouteEntryShellPainted } from "@/lib/community-messenger/room/cm-room-route-chunk-warm";
import { recordRouteEntryElapsedMetricOnce } from "@/lib/runtime/samarket-runtime-debug";

let shellFirstPassRoomId: string | null = null;
let stableShellPaintedRoomId: string | null = null;
const listeners = new Set<() => void>();

/** Inner 첫 render — shell paint 전 Phase1 경량 패스 */
export function beginCmRoomEntryShellFirstPass(roomId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  if (stableShellPaintedRoomId !== id) {
    stableShellPaintedRoomId = null;
  }
  shellFirstPassRoomId = id;
}

/** PageClientEntry·loading segment shell 이 이미 paint 됐는지 — Phase2 중복 shell 생략 */
export function hasCmRoomStableShellPainted(roomId: string): boolean {
  const id = String(roomId ?? "").trim();
  return Boolean(id) && stableShellPaintedRoomId === id;
}

export function noteCmRoomStableShellPainted(roomId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  stableShellPaintedRoomId = id;
  noteCmRoomRouteChunkWarmRouteEntryShellPainted();
}

export function isCmRoomEntryShellFirstPass(): boolean {
  return shellFirstPassRoomId != null;
}

export function getCmRoomEntryShellFirstPassRoomId(): string | null {
  return shellFirstPassRoomId;
}

export function subscribeCmRoomEntryShellFirstPass(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Route/Pass0/Pass1 stable shell 첫 paint */
export function noteCmRoomEntryShellFirstPaint(roomId?: string): void {
  const id = String(roomId ?? shellFirstPassRoomId ?? "").trim();
  if (!id || shellFirstPassRoomId !== id) return;
  shellFirstPassRoomId = null;
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "cm_room_stable_shell_first_paint_ms");
  for (const listener of listeners) {
    listener();
  }
}

export function resetCmRoomEntryShellFirstPassForTests(): void {
  shellFirstPassRoomId = null;
  stableShellPaintedRoomId = null;
  listeners.clear();
}
