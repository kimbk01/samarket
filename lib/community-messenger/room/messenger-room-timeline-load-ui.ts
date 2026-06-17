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
  if (input.loading) return "loading";
  if (input.timelineLoadFailed) return "retry";
  if (input.timelineInitialLoadComplete) return "ok";
  if (input.snapshotMessagesLength > 0) return "loading";
  /** lastMessage 힌트만 남고 fetch 종료 — 무한 스피너 대신 재시도 */
  return "retry";
}
