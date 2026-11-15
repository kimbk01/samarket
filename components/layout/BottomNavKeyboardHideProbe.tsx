"use client";

import { useEffect, useState } from "react";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import { subscribeBottomNavResume } from "@/lib/main-menu/bottom-nav-resume-signal";
import {
  resolveBottomNavKeyboardHideState,
  type BottomNavKeyboardHideState,
} from "@/lib/layout/bottom-nav-keyboard-hide";

/**
 * Mounted by `ConditionalAppShell` ONLY while the main BottomNav is mounted.
 * Isolated leaf (renders null) so `useFormKeyboardViewport` re-measures on
 * visualViewport resize/scroll re-render this probe only — the shell re-renders
 * only when the resolved state flips.
 *
 * Unmount (nav route left / nav suppressed) → reports `visible`, listeners removed.
 */
export function BottomNavKeyboardHideProbe({
  onStateChange,
}: {
  onStateChange: (state: BottomNavKeyboardHideState) => void;
}) {
  const { keyboardOpen, runtimeContext } = useFormKeyboardViewport();
  const [focused, setFocused] = useState<Element | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    setFocused(document.activeElement);
    const onFocusIn = (e: FocusEvent) => {
      setFocused(e.target instanceof Element ? e.target : document.activeElement);
    };
    const onFocusOut = (e: FocusEvent) => {
      /** relatedTarget = next focus owner (null → body / window blur) — avoids an off→on flicker between fields */
      setFocused(e.relatedTarget instanceof Element ? e.relatedTarget : null);
    };
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    /**
     * 앱 복귀 즉시 지금 포커스를 다시 읽는다 — 숨겨진 동안 키보드가 닫히고 focusout 을 놓치면 입력칸이 없어도
     * 하단 탭이 숨김(+inert)으로 남던 경로를 막는다 (계약 v2 · B4). 입력칸에 포커스가 실제로 있으면 그대로 숨김.
     */
    const offResume = subscribeBottomNavResume(() => {
      const active = document.activeElement;
      setFocused(active && active !== document.body ? active : null);
    });
    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      offResume();
    };
  }, []);

  const state = resolveBottomNavKeyboardHideState({
    keyboardOpen,
    activeElement: focused,
    keyboardModel: runtimeContext?.keyboardModel ?? null,
  });

  useEffect(() => {
    onStateChange(state);
  }, [state, onStateChange]);

  useEffect(() => () => onStateChange("visible"), [onStateChange]);

  return null;
}
