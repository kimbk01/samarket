"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent } from "react";

export type MessengerLongPressBind = {
  onPointerDown: (e: PointerEvent<Element>) => void;
  onPointerMove: (e: PointerEvent<Element>) => void;
  onPointerUp: (e: PointerEvent<Element>) => void;
  onPointerCancel: (e: PointerEvent<Element>) => void;
};

export type UseMessengerLongPressResult = {
  /** 행 루트에 합치는 포인터 핸들러 */
  bind: MessengerLongPressBind;
  /** `onClick` 맨 앞에서 호출 — true면 탭(프로필 열기) 무시 */
  consumeClickSuppression: () => boolean;
  /** 롱프레스 대기 취소 (스와이프 행 등에서 호출) */
  cancelPending: () => void;
};

const DEFAULT_MS = 480;
const MOVE_CANCEL_PX = 14;

/**
 * 모바일 친구 행 등: 짧은 탭 vs 롱프레스 구분.
 * 세로 스크롤·큰 이동 시 롱프레스 취소.
 */
export function useMessengerLongPress(onLongPress: () => void, options?: { thresholdMs?: number }): UseMessengerLongPressResult {
  const thresholdMs = options?.thresholdMs ?? DEFAULT_MS;
  const onLongPressRef = useRef(onLongPress);
  useEffect(() => {
    onLongPressRef.current = onLongPress;
  }, [onLongPress]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const suppressNextClickRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const consumeClickSuppression = useCallback(() => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return true;
    }
    return false;
  }, []);

  /** 스와이프 등 다른 제스처가 시작되면 롱프레스 타이머를 끊음 (포인터 캡처로 내부 bind에 move가 안 올 때 필수) */
  const cancelPending = useCallback(() => {
    clearTimer();
    startRef.current = null;
    pointerIdRef.current = null;
  }, [clearTimer]);

  const bind: MessengerLongPressBind = {
    onPointerDown: (e) => {
      if (!e.isPrimary) return;
      clearTimer();
      startRef.current = { x: e.clientX, y: e.clientY };
      pointerIdRef.current = e.pointerId;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        startRef.current = null;
        pointerIdRef.current = null;
        suppressNextClickRef.current = true;
        onLongPressRef.current();
      }, thresholdMs);
    },
    onPointerMove: (e) => {
      if (pointerIdRef.current != null && e.pointerId !== pointerIdRef.current) return;
      if (!startRef.current) return;
      const dx = Math.abs(e.clientX - startRef.current.x);
      const dy = Math.abs(e.clientY - startRef.current.y);
      if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
        clearTimer();
        startRef.current = null;
        pointerIdRef.current = null;
      }
    },
    onPointerUp: (e) => {
      if (pointerIdRef.current != null && e.pointerId !== pointerIdRef.current) return;
      clearTimer();
      startRef.current = null;
      pointerIdRef.current = null;
    },
    onPointerCancel: (e) => {
      if (pointerIdRef.current != null && e.pointerId !== pointerIdRef.current) return;
      clearTimer();
      startRef.current = null;
      pointerIdRef.current = null;
    },
  };

  return { bind, consumeClickSuppression, cancelPending };
}
