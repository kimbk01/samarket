/**
 * CM room keyboard viewport probe — layout metrics only.
 * Opt-in: window.__DIBAY_CM_ROOM_KB_DEBUG__ = true | localStorage '__DIBAY_CM_ROOM_KB_DEBUG__'='1'
 * Never logs message text / PII. No product layout side effects.
 */

export type CmRoomKbProbeRect = {
  top: number;
  bottom: number;
  height: number;
  width: number;
  left: number;
};

export type CmRoomKbProbePayload = {
  seq: number;
  ts: number;
  event: string;
  platform: "ios" | "android" | "other";
  windowInnerHeight: number;
  documentClientHeight: number;
  windowScrollY: number;
  documentElementScrollTop: number;
  bodyScrollTop: number;
  visualViewport: {
    height: number;
    width: number;
    offsetTop: number;
    offsetLeft: number;
    pageTop: number;
    pageLeft: number;
    scale: number;
  } | null;
  messengerPageRect: CmRoomKbProbeRect | null;
  shellRect: CmRoomKbProbeRect | null;
  headerRect: CmRoomKbProbeRect | null;
  timelineRect: CmRoomKbProbeRect | null;
  composerRect: CmRoomKbProbeRect | null;
  textareaRect: CmRoomKbProbeRect | null;
  messengerPageComputed: Record<string, string> | null;
  shellComputed: Record<string, string> | null;
  timelineComputed: Record<string, string> | null;
  composerComputed: Record<string, string> | null;
  keyboardOpen: boolean | null;
  composerPaddingCssVar: string;
  safeBottom: string;
  visualBottom: number | null;
  composerToVisualBottomGap: number | null;
};

declare global {
  interface Window {
    __DIBAY_CM_ROOM_KB_DEBUG__?: boolean;
    __DIBAY_CM_ROOM_KB_LAST__?: CmRoomKbProbePayload;
    __DIBAY_CM_ROOM_KB_LOG__?: CmRoomKbProbePayload[];
  }
}

let probeSeq = 0;

export function isCmRoomKbProbeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__DIBAY_CM_ROOM_KB_DEBUG__ === true) return true;
  try {
    if (window.localStorage?.getItem("__DIBAY_CM_ROOM_KB_DEBUG__") === "1") return true;
  } catch {
    /* private mode */
  }
  return process.env.NODE_ENV !== "production";
}

function resolvePlatform(): CmRoomKbProbePayload["platform"] {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  return "other";
}

function rectOf(el: Element | null | undefined): CmRoomKbProbeRect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
    height: Math.round(r.height),
    width: Math.round(r.width),
    left: Math.round(r.left),
  };
}

function pickComputed(el: Element | null | undefined, keys: string[]): Record<string, string> | null {
  if (!el) return null;
  const cs = getComputedStyle(el);
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = cs.getPropertyValue(k).trim() || (cs as unknown as Record<string, string>)[k] || "";
  return out;
}

function cssVar(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

export function emitCmRoomKbProbe(
  event: string,
  shell: HTMLElement | null | undefined,
  extra?: { keyboardOpen?: boolean | null }
): CmRoomKbProbePayload | null {
  if (!isCmRoomKbProbeEnabled() || typeof window === "undefined") return null;

  const vv = window.visualViewport;
  const root = shell ?? document.querySelector<HTMLElement>("[data-cm-room].cm-room-shell");
  const messengerPage = root?.closest(".messenger-page") ?? document.querySelector(".messenger-page");
  const headerEl = root?.querySelector(".chat-header") ?? null;
  const timelineEl = root?.querySelector(".cm-room-timeline") ?? null;
  const composerEl = root?.querySelector(".cm-room-composer") ?? null;
  const textareaCandidate = composerEl?.querySelector("textarea");
  const textareaEl =
    textareaCandidate ??
    (document.activeElement instanceof HTMLTextAreaElement ? document.activeElement : null);

  const vvOffsetTop = vv ? Math.round(vv.offsetTop) : null;
  const vvHeight = vv ? Math.round(vv.height) : null;
  const visualBottom =
    vvOffsetTop != null && vvHeight != null ? vvOffsetTop + vvHeight : null;
  const composerRect = rectOf(composerEl);
  const composerToVisualBottomGap =
    visualBottom != null && composerRect != null ? visualBottom - composerRect.bottom : null;

  const keyboardOpen =
    extra?.keyboardOpen ??
    (root?.dataset.cmKeyboardOpen === "true" ? true : root?.dataset.cmKeyboardOpen === "false" ? false : null);

  const payload: CmRoomKbProbePayload = {
    seq: ++probeSeq,
    ts: typeof performance !== "undefined" ? Math.round(performance.now()) : Date.now(),
    event,
    platform: resolvePlatform(),
    windowInnerHeight: window.innerHeight,
    documentClientHeight: document.documentElement.clientHeight,
    windowScrollY: Math.round(window.scrollY),
    documentElementScrollTop: Math.round(document.documentElement.scrollTop),
    bodyScrollTop: Math.round(document.body.scrollTop),
    visualViewport: vv
      ? {
          height: vv.height,
          width: vv.width,
          offsetTop: vv.offsetTop,
          offsetLeft: vv.offsetLeft,
          pageTop: vv.pageTop,
          pageLeft: vv.pageLeft,
          scale: vv.scale,
        }
      : null,
    messengerPageRect: rectOf(messengerPage),
    shellRect: rectOf(root),
    headerRect: rectOf(headerEl),
    timelineRect: rectOf(timelineEl),
    composerRect,
    textareaRect: rectOf(textareaEl),
    messengerPageComputed: pickComputed(messengerPage, [
      "position",
      "height",
      "min-height",
      "max-height",
      "transform",
      "overflow",
    ]),
    shellComputed: pickComputed(root, [
      "display",
      "position",
      "height",
      "min-height",
      "max-height",
      "overflow",
      "transform",
    ]),
    timelineComputed: pickComputed(timelineEl, ["flex", "min-height", "overflow", "height"]),
    composerComputed: pickComputed(composerEl, [
      "position",
      "bottom",
      "transform",
      "padding-bottom",
      "margin-bottom",
      "flex-shrink",
      "order",
    ]),
    keyboardOpen,
    composerPaddingCssVar: root ? cssVar(root, "--cm-room-composer-bottom-padding") : "",
    safeBottom: root ? cssVar(root, "--safe-bottom") : "",
    visualBottom,
    composerToVisualBottomGap,
  };

  window.__DIBAY_CM_ROOM_KB_LAST__ = payload;
  const log = window.__DIBAY_CM_ROOM_KB_LOG__ ?? [];
  log.push(payload);
  if (log.length > 80) log.splice(0, log.length - 80);
  window.__DIBAY_CM_ROOM_KB_LOG__ = log;
  console.info("[cm-room-kb-viewport]", payload);
  return payload;
}
