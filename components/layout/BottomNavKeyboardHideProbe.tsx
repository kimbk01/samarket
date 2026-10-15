"use client";

import { useEffect, useState } from "react";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
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
    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
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
