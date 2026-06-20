import { CHAT_THREAD_STICK_THRESHOLD_PX } from "@/lib/chat-thread-scroll/constants";

export function chatThreadDistanceFromBottom(input: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}): number {
  return input.scrollHeight - input.scrollTop - input.clientHeight;
}

export function isChatThreadNearBottomFromMetrics(
  metrics: { scrollHeight: number; scrollTop: number; clientHeight: number },
  thresholdPx = CHAT_THREAD_STICK_THRESHOLD_PX
): boolean {
  return chatThreadDistanceFromBottom(metrics) <= thresholdPx;
}

export function readChatThreadNearBottom(
  viewport: HTMLElement | null,
  thresholdPx = CHAT_THREAD_STICK_THRESHOLD_PX
): { nearBottom: boolean; bottomDistancePx: number } | null {
  if (!viewport) return null;
  const metrics = {
    scrollHeight: viewport.scrollHeight,
    scrollTop: viewport.scrollTop,
    clientHeight: viewport.clientHeight,
  };
  const bottomDistancePx = Math.max(0, chatThreadDistanceFromBottom(metrics));
  return {
    nearBottom: isChatThreadNearBottomFromMetrics(metrics, thresholdPx),
    bottomDistancePx,
  };
}
