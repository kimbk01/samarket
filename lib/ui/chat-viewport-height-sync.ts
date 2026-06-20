/**
 * Keyboard P0.1 — CM chat room visual viewport height on `:root` + html class.
 * Shell padding vars stay on `[data-cm-room]`; height SSOT propagates to app shell chain.
 */

export const SAM_CHAT_VIEWPORT_HEIGHT_HTML_CLASS = "sam-chat-viewport-height-active";

export const CHAT_VIEWPORT_HEIGHT_CSS_VAR = "--chat-viewport-height";

export function applyChatViewportHeightToRoot(layoutHeightPx: number): void {
  if (typeof document === "undefined") return;
  const docEl = document.documentElement;
  const next = `${layoutHeightPx}px`;
  if (docEl.style.getPropertyValue(CHAT_VIEWPORT_HEIGHT_CSS_VAR) !== next) {
    docEl.style.setProperty(CHAT_VIEWPORT_HEIGHT_CSS_VAR, next);
  }
  if (!docEl.classList.contains(SAM_CHAT_VIEWPORT_HEIGHT_HTML_CLASS)) {
    docEl.classList.add(SAM_CHAT_VIEWPORT_HEIGHT_HTML_CLASS);
  }
}

export function clearChatViewportHeightFromRoot(): void {
  if (typeof document === "undefined") return;
  const docEl = document.documentElement;
  if (
    !docEl.classList.contains(SAM_CHAT_VIEWPORT_HEIGHT_HTML_CLASS) &&
    !docEl.style.getPropertyValue(CHAT_VIEWPORT_HEIGHT_CSS_VAR)
  ) {
    return;
  }
  docEl.style.removeProperty(CHAT_VIEWPORT_HEIGHT_CSS_VAR);
  docEl.classList.remove(SAM_CHAT_VIEWPORT_HEIGHT_HTML_CLASS);
}
