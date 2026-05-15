/**
 * Community 메신저 방 렌더·상호작용 분석 — **관측 전용** (unread/read/realtime 의미 불변).
 * `NEXT_PUBLIC_MESSENGER_PERF_TRACE_CM_RENDER=1` 일 때만 활성.
 */

import { cmProdParityModeEnabled } from "@/lib/community-messenger/dev/cm-event-loop-dev";

let layoutShiftObserver: PerformanceObserver | null = null;
let layoutShiftSessionCount = 0;

export function cmRenderAnalysisEnabled(): boolean {
  if (cmProdParityModeEnabled()) return false;
  try {
    return (
      typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE_CM_RENDER === "1"
    );
  } catch {
    return false;
  }
}

type Session = {
  roomId: string;
  avatarRenderCount: number;
  bubbleRenderCount: number;
  lastReason: string;
  lastVisibleMessageCount: number;
  /** 단일 이미지 onLoad 디코드 구간 합(대표 샘플) */
  imageDecodeSampleMs: number;
  imageDecodeSamples: number;
};

let session: Session | null = null;

export function resetCmRenderAnalysisSession(roomId: string): void {
  if (!cmRenderAnalysisEnabled()) return;
  const id = String(roomId ?? "").trim();
  session = {
    roomId: id,
    avatarRenderCount: 0,
    bubbleRenderCount: 0,
    lastReason: "init",
    lastVisibleMessageCount: 0,
    imageDecodeSampleMs: 0,
    imageDecodeSamples: 0,
  };
  layoutShiftSessionCount = 0;
}

export function cmRenderAnalysisEnsureSession(roomId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  if (!session || session.roomId !== id) {
    resetCmRenderAnalysisSession(id);
  }
}

export function beginCmRenderTimelineFrame(): void {
  if (!session || !cmRenderAnalysisEnabled()) return;
  session.avatarRenderCount = 0;
  session.bubbleRenderCount = 0;
}

export function bumpMessengerTimelineBubbleRender(): void {
  if (!cmRenderAnalysisEnabled() || !session) return;
  session.bubbleRenderCount += 1;
}

export function bumpMessengerTimelineAvatarRender(): void {
  if (!cmRenderAnalysisEnabled() || !session) return;
  session.avatarRenderCount += 1;
}

export function recordCmRenderAnalysisReason(reason: string): void {
  if (!cmRenderAnalysisEnabled() || !session) return;
  session.lastReason = reason;
}

export function recordCmRenderVisibleMessageCount(n: number): void {
  if (!cmRenderAnalysisEnabled() || !session) return;
  session.lastVisibleMessageCount = n;
}

/** 이미지 natural 로드 1회 소요 — 버블 `onLoad` 에서 호출 */
export function recordCmRenderImageDecodeSample(ms: number): void {
  if (!cmRenderAnalysisEnabled() || !session) return;
  if (!Number.isFinite(ms) || ms < 0) return;
  session.imageDecodeSamples += 1;
  session.imageDecodeSampleMs += ms;
}

function avgImageDecodeMs(): number | null {
  if (!session || session.imageDecodeSamples <= 0) return null;
  return Math.round(session.imageDecodeSampleMs / session.imageDecodeSamples);
}

export function ensureCmRenderAnalysisLayoutShiftObserver(): void {
  if (!cmRenderAnalysisEnabled() || typeof PerformanceObserver === "undefined") return;
  if (layoutShiftObserver) return;
  try {
    layoutShiftObserver = new PerformanceObserver((list) => {
      for (const _ of list.getEntries()) {
        layoutShiftSessionCount += 1;
      }
    });
    layoutShiftObserver.observe({ type: "layout-shift", buffered: true } as PerformanceObserverInit);
  } catch {
    layoutShiftObserver = null;
  }
}

export function disposeCmRenderAnalysisLayoutShiftObserver(): void {
  try {
    layoutShiftObserver?.disconnect();
  } catch {
    /* ignore */
  }
  layoutShiftObserver = null;
}

export function deriveCmRoomRenderReason(prev: {
  msgLen: number;
  unread: number;
  readId: string;
} | null, next: { msgLen: number; unread: number; readId: string }): string {
  if (!prev) return "initial";
  if (next.msgLen !== prev.msgLen) return next.msgLen > prev.msgLen ? "messages_append" : "messages_shrink";
  if (next.readId !== prev.readId) return "read_receipt_cursor";
  if (next.unread !== prev.unread) return "room_unread_header";
  return "other";
}

export type CmRenderAnalysisPayload = {
  room_render_ms?: number | null;
  message_list_render_ms?: number | null;
  append_message_render_ms?: number | null;
  composer_render_ms?: number | null;
  avatar_render_count?: number;
  message_bubble_render_count?: number;
  rerender_reason?: string;
  visible_message_count?: number;
  image_decode_ms?: number | null;
  layout_shift_count?: number;
  room_id_suffix?: string;
};

export function logCmRenderAnalysis(payload: CmRenderAnalysisPayload): void {
  if (!cmRenderAnalysisEnabled()) return;
  if (typeof console === "undefined" || typeof console.info !== "function") return;
  const rid = session?.roomId ?? "";
  const suffix = rid.length <= 8 ? rid : rid.slice(-8);
  const merged: Record<string, unknown> = {
    ...payload,
    room_id_suffix: suffix || payload.room_id_suffix,
    layout_shift_count: layoutShiftSessionCount,
    image_decode_ms: payload.image_decode_ms ?? avgImageDecodeMs(),
    avatar_render_count: payload.avatar_render_count ?? session?.avatarRenderCount,
    message_bubble_render_count: payload.message_bubble_render_count ?? session?.bubbleRenderCount,
    rerender_reason: payload.rerender_reason ?? session?.lastReason,
    visible_message_count: payload.visible_message_count ?? session?.lastVisibleMessageCount,
  };
  console.info("[cm-render-analysis]", JSON.stringify(merged));
}
