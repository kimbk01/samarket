import type { RefObject } from "react";

/** Send·Enter 후 textarea blur 방지 — 카톡/텔레그램: 키보드 유지 */
export function scheduleMessengerComposerFocusRetain(
  textareaRef: RefObject<HTMLTextAreaElement | null>
): void {
  if (typeof window === "undefined") return;
  const focus = () => {
    const el = textareaRef.current;
    if (!el || el.disabled) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => requestAnimationFrame(focus));
  } else {
    focus();
  }
}
