import { CM_CLUSTER_GAP_MS } from "@/lib/community-messenger/room/messenger-room-ui-constants";

type TimelineRowLike = {
  messageType?: string;
  isMine?: boolean;
  createdAt: string;
  senderId?: string | null;
};

function gapMsBetween(prev: TimelineRowLike, item: TimelineRowLike): number {
  if (prev.messageType === "system" || item.messageType === "system") return 0;
  if (prev.messageType === "call_stub" || item.messageType === "call_stub") return 0;
  return Math.max(0, new Date(item.createdAt).getTime() - new Date(prev.createdAt).getTime());
}

function isSameSenderCluster(
  prev: TimelineRowLike | null,
  item: TimelineRowLike,
  isGroupRoom: boolean
): boolean {
  if (!prev) return false;
  if (prev.messageType === "system" || prev.messageType === "call_stub") return false;
  if (item.messageType === "system" || item.messageType === "call_stub") return false;
  if (prev.isMine !== item.isMine) return false;
  if (isGroupRoom && (prev.senderId ?? "") !== (item.senderId ?? "")) return false;
  return gapMsBetween(prev, item) <= CM_CLUSTER_GAP_MS;
}

/**
 * Telegram-style timeline row spacing — platform-neutral (flex document flow only).
 * call_stub = service row; text bubble cluster spacing is separate.
 */
export function resolveMessengerTimelineRowPaddingTopClass(input: {
  item: TimelineRowLike;
  prev: TimelineRowLike | null;
  isDayBoundary: boolean;
  showPeerName: boolean;
  isGroupRoom: boolean;
}): string {
  const { item, prev, isDayBoundary, showPeerName, isGroupRoom } = input;
  const isCallStub = item.messageType === "call_stub";

  if (isCallStub) {
    if (isDayBoundary) return "pt-4";
    if (!prev) return "";
    if (prev.messageType === "call_stub") return "pt-1";
    return "pt-1.5";
  }

  if (isDayBoundary) return "pt-4";

  if (prev?.messageType === "call_stub") {
    return "pt-1.5";
  }

  if (showPeerName) return "pt-3.5";

  if (!prev) return "";

  return isSameSenderCluster(prev, item, isGroupRoom) ? "pt-1" : "pt-3";
}
