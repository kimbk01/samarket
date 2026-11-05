"use client";

import { useLayoutEffect, type RefObject } from "react";
import type { SeededSilentHoldSignal } from "@/lib/community-messenger/room/seeded-silent-refresh-hold";

const MAX_VISIBILITY_FRAMES = 48;

/**
 * 실제 마운트된 composer 가 준비되면 시드 진입 silent refresh 보류를 해제하도록 신호를 보낸다.
 * 준비 = placeholder 아닌 스냅샷 + (입력 불가 방의 안내 줄 표시 | textarea 가 실제로 보임).
 * 신호에는 effect 시작 시점의 hold 세대를 싣는다 — 방 전환 뒤 늦은 신호는 hold 가 무시한다.
 */
export function useSeededSilentHoldComposerRelease(args: {
  enabled: boolean;
  roomId: string;
  snapshotPlaceholder: boolean;
  chatUnavailable: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  isTextareaVisible: (ta: HTMLTextAreaElement) => boolean;
  readGeneration: () => number;
  notify: (signal: SeededSilentHoldSignal) => void;
  /** textarea 가시성이 바뀔 수 있는 상태(전송 중·입력 불가 등) — 바뀌면 다시 확인 */
  recheckKey?: unknown;
}): void {
  const {
    enabled,
    roomId,
    snapshotPlaceholder,
    chatUnavailable,
    textareaRef,
    isTextareaVisible,
    readGeneration,
    notify,
    recheckKey,
  } = args;

  useLayoutEffect(() => {
    const rid = roomId.trim();
    if (!enabled || !rid || snapshotPlaceholder) return;
    const signal: SeededSilentHoldSignal = { roomId: rid, generation: readGeneration() };
    if (chatUnavailable) {
      notify(signal);
      return;
    }
    let cancelled = false;
    let frames = 0;
    const tryRelease = (): boolean => {
      const ta = textareaRef.current;
      if (!ta || !isTextareaVisible(ta)) return false;
      notify(signal);
      return true;
    };
    if (tryRelease()) return;
    const loop = () => {
      if (cancelled || tryRelease() || frames >= MAX_VISIBILITY_FRAMES) return;
      frames += 1;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => {
      cancelled = true;
    };
  }, [enabled, roomId, snapshotPlaceholder, chatUnavailable, textareaRef, isTextareaVisible, readGeneration, notify, recheckKey]);
}
