"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Header back press lock (B-05) — one navigation per press burst.
 * Local to the button (not global navigation state): released when the route changes,
 * or after `releaseMs` if the press did not navigate (e.g. intercepted / no history).
 * It only drops repeated presses; it never issues or corrects a navigation.
 */
export const BACK_PRESS_LOCK_RELEASE_MS = 700;

export function useBackPressLock(releaseMs = BACK_PRESS_LOCK_RELEASE_MS): (run: () => void) => void {
  const pathname = usePathname();
  const lockedRef = useRef(false);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    lockedRef.current = false;
    if (releaseTimerRef.current != null) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
  }, [pathname]);

  useEffect(
    () => () => {
      if (releaseTimerRef.current != null) clearTimeout(releaseTimerRef.current);
    },
    []
  );

  return useCallback(
    (run: () => void) => {
      if (lockedRef.current) return;
      lockedRef.current = true;
      if (releaseTimerRef.current != null) clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = setTimeout(() => {
        lockedRef.current = false;
        releaseTimerRef.current = null;
      }, releaseMs);
      run();
    },
    [releaseMs]
  );
}
