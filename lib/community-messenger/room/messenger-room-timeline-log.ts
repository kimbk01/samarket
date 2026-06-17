/**
 * 채팅방 타임라인·스크롤 구조화 로그 — prod 디버깅·회귀 추적용.
 * `NEXT_PUBLIC_MESSENGER_PERF_TRACE=1` 또는 dev 에서만 console 출력.
 */
import { messengerVerboseTraceConsoleEnabled } from "@/lib/community-messenger/messenger-trace-console";

function shouldLog(): boolean {
  return messengerVerboseTraceConsoleEnabled() || process.env.NODE_ENV !== "production";
}

function emit(tag: string, event: string, payload: Record<string, unknown>): void {
  if (!shouldLog()) return;
  // eslint-disable-next-line no-console -- gated diagnostics
  console.info(tag, event, payload);
}

export function logChatRoomTimelineInitialFetch(
  phase: "start" | "done" | "error",
  payload: Record<string, unknown>
): void {
  emit("[chat-room-timeline]", `initial_fetch_${phase}`, payload);
}

export function logChatRoomTimelineRetry(
  phase: "start" | "done" | "error",
  payload: Record<string, unknown>
): void {
  emit("[chat-room-timeline]", `retry_${phase}`, payload);
}

export function logChatRoomTimelineRealtime(
  action: "received" | "merged" | "deduped" | "queued",
  payload: Record<string, unknown>
): void {
  emit("[chat-room-timeline]", `realtime_event_${action}`, payload);
}

export function logChatRoomScroll(
  event:
    | "initial_anchor_bottom"
    | "keyboard_resize_anchor_keep"
    | "prepend_older_preserve_position"
    | "near_bottom_true"
    | "near_bottom_false"
    | "new_messages_chip_show"
    | "new_messages_chip_hide"
    | "auto_stick_skipped_user_scrolled_up"
    | "composer_height_changed",
  payload: Record<string, unknown>
): void {
  emit("[chat-room-scroll]", event, payload);
}
