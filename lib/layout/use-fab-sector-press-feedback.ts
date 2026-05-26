"use client";

import { useCallback, useState, type PointerEvent } from "react";
import { triggerLightTapFeedback } from "@/lib/ui/light-tap-feedback";

/** FAB 메뉴·‹·X — pointer 눌림 + 모바일 햅틱/클릭음 */
export function useFabSectorPressFeedback() {
  const [pressedId, setPressedId] = useState<string | null>(null);

  const isPressed = useCallback((id: string) => pressedId === id, [pressedId]);

  const bindPress = useCallback(
    (id: string) => ({
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.button !== 0) return;
        setPressedId(id);
        triggerLightTapFeedback(e);
      },
      onPointerUp: () => setPressedId(null),
      onPointerCancel: () => setPressedId(null),
      onPointerLeave: () => setPressedId(null),
    }),
    []
  );

  const clearPress = useCallback(() => setPressedId(null), []);

  return { isPressed, bindPress, clearPress };
}

export const FAB_SECTOR_TOUCH_CLASS =
  "touch-manipulation select-none [-webkit-tap-highlight-color:transparent]";
