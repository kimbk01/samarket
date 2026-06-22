"use client";

import { useCallback, useRef } from "react";
import {
  CALL_DOCK_DOUBLE_TAP_MS,
} from "@/lib/community-messenger/call-ui/call-dock-theme";
import { isCallDockRestoreInFlight } from "@/lib/community-messenger/call-dock-presentation";

/** Dock tap / double-tap — 300ms debounce · restore race 제거 */
export function useCallDockRestoreGesture(onRestore: () => void) {
  const lastTapAtRef = useRef(0);
  const pendingSingleTapRef = useRef<number | null>(null);

  const clearPendingSingleTap = useCallback(() => {
    if (pendingSingleTapRef.current != null) {
      window.clearTimeout(pendingSingleTapRef.current);
      pendingSingleTapRef.current = null;
    }
  }, []);

  const invokeRestore = useCallback(() => {
    if (isCallDockRestoreInFlight()) return;
    clearPendingSingleTap();
    lastTapAtRef.current = 0;
    onRestore();
  }, [clearPendingSingleTap, onRestore]);

  const onRootTap = useCallback(() => {
    if (isCallDockRestoreInFlight()) return;
    const now = Date.now();
    if (lastTapAtRef.current > 0 && now - lastTapAtRef.current <= CALL_DOCK_DOUBLE_TAP_MS) {
      invokeRestore();
      return;
    }
    lastTapAtRef.current = now;
    clearPendingSingleTap();
    pendingSingleTapRef.current = window.setTimeout(() => {
      pendingSingleTapRef.current = null;
      if (lastTapAtRef.current === now) {
        lastTapAtRef.current = 0;
        invokeRestore();
      }
    }, CALL_DOCK_DOUBLE_TAP_MS);
  }, [clearPendingSingleTap, invokeRestore]);

  const onExpandClick = useCallback(
    (event: React.MouseEvent | React.KeyboardEvent) => {
      event.stopPropagation();
      invokeRestore();
    },
    [invokeRestore]
  );

  return { onRootTap, onExpandClick, invokeRestore };
}
