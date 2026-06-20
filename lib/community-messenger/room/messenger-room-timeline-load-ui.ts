import { hasMessengerRoomTimelineLoadHint } from "@/lib/community-messenger/room/messenger-room-timeline-hydration";

/** UI 3-state — loading | retry | ok (내부 로그만 세분화) */
export type MessengerRoomTimelineLoadUi = "loading" | "retry" | "ok";

export function resolveMessengerRoomTimelineLoadUi(input: {
  loading: boolean;
  displayMessageCount: number;
  timelineLoadFailed: boolean;
  timelineInitialLoadComplete: boolean;
  roomMessagesLength: number;
  snapshotMessagesLength: number;
  lastMessage?: string | null;
}): MessengerRoomTimelineLoadUi {
  if (input.displayMessageCount > 0 || input.roomMessagesLength > 0) return "ok";

  const hasHint = hasMessengerRoomTimelineLoadHint({
    roomMessagesLength: input.roomMessagesLength,
    snapshotMessagesLength: input.snapshotMessagesLength,
    lastMessage: input.lastMessage,
  });

  if (!hasHint) return "ok";
  if (input.timelineLoadFailed) return "retry";
  /** bootstrap 미완 — skeleton 유지 (lastMessage-only 포함, retry로 빈 chrome 방지) */
  if (!input.timelineInitialLoadComplete) return "loading";
  if (input.loading) return "loading";
  if (input.snapshotMessagesLength > 0) return "loading";
  return "ok";
}
