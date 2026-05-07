/**
 * Community 메신저 방 UX polish 계측 — 관측 전용.
 * `NEXT_PUBLIC_MESSENGER_PERF_TRACE_CM_POLISH=1`
 */

let pendingPeerFlushT0: number | null = null;
let pendingPeerMessageId: string | null = null;

let sendClickT0: number | null = null;

/** 방 단위 — 컴포저 마운트 이후 렌더 횟수(폴리시 디버그용) */
let composerPolishRenderSession = 0;

let imageLayoutShiftCount = 0;
let polishLayoutShiftObserver: PerformanceObserver | null = null;

export function cmPolishAnalysisEnabled(): boolean {
  try {
    return typeof process !== "undefined" && process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE_CM_POLISH === "1";
  } catch {
    return false;
  }
}

export function resetCmPolishAnalysisSession(): void {
  pendingPeerFlushT0 = null;
  pendingPeerMessageId = null;
  sendClickT0 = null;
  composerPolishRenderSession = 0;
  imageLayoutShiftCount = 0;
}

export function bumpCmPolishComposerRender(): void {
  if (!cmPolishAnalysisEnabled()) return;
  composerPolishRenderSession += 1;
}

export function getCmPolishComposerRenderSessionCount(): number {
  return composerPolishRenderSession;
}

export function ensureCmPolishImageLayoutShiftObserver(): void {
  if (!cmPolishAnalysisEnabled() || typeof PerformanceObserver === "undefined") return;
  if (polishLayoutShiftObserver) return;
  try {
    polishLayoutShiftObserver = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if ("hadRecentInput" in e && (e as LayoutShift & { hadRecentInput?: boolean }).hadRecentInput) continue;
        const sources = (e as LayoutShift).sources;
        if (!sources?.length) continue;
        for (const s of sources) {
          const node = (s as { node?: Node | null }).node;
          if (!(node instanceof Element)) continue;
          if (!node.closest("[data-cm-line-timeline]")) continue;
          if (node.tagName === "IMG" || node.querySelector?.("img")) {
            imageLayoutShiftCount += 1;
            break;
          }
        }
      }
    });
    polishLayoutShiftObserver.observe({ type: "layout-shift", buffered: true } as PerformanceObserverInit);
  } catch {
    polishLayoutShiftObserver = null;
  }
}

type LayoutShift = PerformanceEntry & {
  hadRecentInput?: boolean;
  sources?: ReadonlyArray<{ node?: Node | null }>;
};

export function disposeCmPolishImageLayoutShiftObserver(): void {
  try {
    polishLayoutShiftObserver?.disconnect();
  } catch {
    /* ignore */
  }
  polishLayoutShiftObserver = null;
}

export function getCmPolishImageLayoutShiftCount(): number {
  return imageLayoutShiftCount;
}

/** Realtime ingest flush 시작 시점 — 상대 INSERT 가 있을 때만 */
export function markCmPolishPeerRealtimeFlush(messageId: string, flushStartedAt: number): void {
  if (!cmPolishAnalysisEnabled() || !messageId) return;
  pendingPeerMessageId = messageId;
  pendingPeerFlushT0 = flushStartedAt;
}

/**
 * 타임라인이 해당 메시지 id 로 레이아웃 커밋될 때 호출 — flush 시작 → 첫 레이아웃(ms).
 */
export function takeCmPolishIncomingBubbleVisibleMs(messageId: string): number | null {
  if (!cmPolishAnalysisEnabled() || !pendingPeerFlushT0 || !pendingPeerMessageId) return null;
  if (pendingPeerMessageId !== messageId) return null;
  const ms = Math.round((performance.now() - pendingPeerFlushT0) * 1000) / 1000;
  pendingPeerFlushT0 = null;
  pendingPeerMessageId = null;
  return ms;
}

export function recordCmPolishSendClick(): void {
  if (!cmPolishAnalysisEnabled()) return;
  sendClickT0 = performance.now();
}

/** scrollMessengerToBottom(rAF) 안에서 점프 px 와 함께 호출 */
export function consumeCmPolishSendClickToBubble(messageAppendJumpPx: number | null): void {
  if (!cmPolishAnalysisEnabled() || sendClickT0 == null) return;
  const ms = Math.round((performance.now() - sendClickT0) * 1000) / 1000;
  sendClickT0 = null;
  logCmPolishAnalysis({
    send_click_to_bubble_visible_ms: ms,
    message_append_jump_px: messageAppendJumpPx,
    composer_rerender_count: composerPolishRenderSession,
  });
}

export function recordCmPolishAttachmentDecodeMs(ms: number): void {
  if (!cmPolishAnalysisEnabled() || !Number.isFinite(ms) || ms < 12) return;
  logCmPolishAnalysis({ attachment_decode_ms: Math.round(ms * 1000) / 1000 });
}

export type CmPolishAnalysisPayload = {
  keyboard_open_adjust_ms?: number | null;
  composer_focus_to_ready_ms?: number | null;
  send_click_to_bubble_visible_ms?: number | null;
  incoming_event_to_bubble_visible_ms?: number | null;
  image_layout_shift_count?: number;
  attachment_decode_ms?: number | null;
  composer_rerender_count?: number;
  message_append_jump_px?: number | null;
  transition_frame_drop_count?: number;
  room_id_suffix?: string;
};

export function logCmPolishAnalysis(payload: CmPolishAnalysisPayload): void {
  if (!cmPolishAnalysisEnabled()) return;
  if (typeof console === "undefined" || typeof console.info !== "function") return;
  console.info("[cm-polish-analysis]", JSON.stringify(payload));
}
