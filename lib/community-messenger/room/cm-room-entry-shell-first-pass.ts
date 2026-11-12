"use client";

import { useLayoutEffect, useState } from "react";
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

/**
 * 방 클라이언트(Inner) 전용 — 첫 패스(경량 Phase1)는 이 방의 **첫 렌더 1회**만.
 * 예전 Inner 는 렌더 본문에서 매번 begin 해서, 첫 paint 후 끄면(note → phase1 구독 재렌더) 바로 다시 켜져
 * 끝까지 경량 모드였다 — 멤버 보강·초대 후보·실시간 포커스/안 읽음 정리 등이 멈춤
 * (2026-11-13 실기 · docs/design/group-chat-full-fix-design-2026-11-13.md G2).
 * 첫 커밋 직후 레이아웃 효과에서 끝낸다(shell paint 경로가 먼저 끝냈으면 no-op · 지표는 Once).
 */
export function useCmRoomEntryShellFirstPassForRoom(roomId: string): void {
  const id = String(roomId ?? "").trim();
  /** 마운트 첫 렌더에 1회 begin · 같은 마운트에서 방 id 가 바뀌면 그 렌더에 1회 (이전 props 를 state 로 — React 권장 패턴) */
  const [begunRoomId, setBegunRoomId] = useState<string>(() => {
    if (id) beginCmRoomEntryShellFirstPass(id);
    return id;
  });
  if (id && begunRoomId !== id) {
    beginCmRoomEntryShellFirstPass(id);
    setBegunRoomId(id);
  }
  useLayoutEffect(() => {
    if (!id) return;
    noteCmRoomEntryShellFirstPaint(id);
  }, [id]);
}

export function resetCmRoomEntryShellFirstPassForTests(): void {
  shellFirstPassRoomId = null;
  stableShellPaintedRoomId = null;
  listeners.clear();
}
