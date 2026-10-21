"use client";

import { useEffect, useRef } from "react";
import { useOverlayHardwareBack } from "@/lib/ui/overlay-back-stack";

/** 스와이프 행·행 시트·필터 시트 안의 터치는 「바깥」이 아니다 */
const INSIDE_SELECTORS = [
  "[data-messenger-chat-row='true']",
  "[data-call-log-row='true']",
  "[data-messenger-chat-sheet='true']",
  "[data-messenger-chat-filter-sheet='true']",
];

export function isMessengerSwipeInsideTarget(target: EventTarget | null): boolean {
  const el = target as { closest?: (sel: string) => unknown } | null;
  if (!el || typeof el.closest !== "function") return false;
  return INSIDE_SELECTORS.some((sel) => el.closest!(sel) != null);
}

/**
 * L-4·L-5: 스와이프 메뉴가 열려 있는 동안만 닫힘 트리거를 건다 — 목록 밖(헤더·하단 탭 포함) 탭,
 * 문서 스크롤, 앱 백그라운드 전환, Android 하드웨어 뒤로가기(닫기만 하고 뒤로가기는 소비).
 * 다른 행·무조작 자동 닫힘은 행(`MessengerChatListItem`)이 담당한다.
 */
export function useMessengerSwipeDismissTriggers(open: boolean, onDismiss: () => void): void {
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const onPointerDown = (e: PointerEvent) => {
      if (isMessengerSwipeInsideTarget(e.target)) return;
      dismissRef.current();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") dismissRef.current();
    };
    const onScroll = () => dismissRef.current();
    const scrollRoot = document.scrollingElement ?? document.documentElement;
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("visibilitychange", onVisibility);
    scrollRoot.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("visibilitychange", onVisibility);
      scrollRoot.removeEventListener("scroll", onScroll);
    };
  }, [open]);

  useOverlayHardwareBack(open, () => dismissRef.current());
}
