import { beforeEach, describe, expect, it } from "vitest";
import {
  parseCommunityMessengerBumpMessageSnapshot,
  serializeCommunityMessengerMessageForBump,
} from "@/lib/community-messenger/realtime/community-messenger-room-bump-message-snapshot";
import { roomMessagesTimelineFingerprint } from "@/lib/community-messenger/room/messenger-room-timeline-paint-model";
import {
  applyIncomingMessageEvent,
  getMessengerRealtimeRoomMessages,
  resetMessengerRealtimeStore,
} from "@/lib/community-messenger/stores/messenger-realtime-store";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

/** 1단계 결함 D-14 (2026-10-26): 받는 쪽 실시간 스냅샷에 답장 인용이 실려야 하고, 늦게 온 인용을 「변경 없음」으로 버리지 않는다. */

const ROOM_ID = "c202326f-8109-4ce4-aa61-394f0a799e7d";
const MESSAGE_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "33333333-3333-4333-8333-333333333333";
const SENDER_ID = "22222222-2222-4222-8222-222222222222";
const VIEWER = "44444444-4444-4444-8444-444444444444";

const reply: CommunityMessengerMessage = {
  id: MESSAGE_ID,
  roomId: ROOM_ID,
  senderId: SENDER_ID,
  senderLabel: "q테스트1",
  messageType: "text",
  content: "D14r",
  createdAt: "2026-10-26T03:10:45.000Z",
  clientMessageId: null,
  isMine: false,
  replyToMessageId: TARGET_ID,
  replyPreviewText: "S1lat0210",
  replyPreviewType: "text",
  replySenderLabelSnapshot: "q테스트1",
};

const parse = (row: Record<string, unknown> | null) =>
  parseCommunityMessengerBumpMessageSnapshot(
    { fromUserId: SENDER_ID, canonicalRoomId: ROOM_ID, messageId: MESSAGE_ID, message: row },
    VIEWER
  );

describe("D-14 bump 스냅샷 답장 인용", () => {
  beforeEach(() => resetMessengerRealtimeStore());

  it("직렬화 → 파싱 후 인용 4필드 유지", () => {
    const parsed = parse(serializeCommunityMessengerMessageForBump(reply));
    expect(parsed?.replyToMessageId).toBe(TARGET_ID);
    expect(parsed?.replyPreviewText).toBe("S1lat0210");
    expect(parsed?.replyPreviewType).toBe("text");
    expect(parsed?.replySenderLabelSnapshot).toBe("q테스트1");
  });

  it("구 서버 스냅샷(인용 없음)은 지금과 같이 인용 없이 파싱", () => {
    const row = serializeCommunityMessengerMessageForBump({ ...reply, replyToMessageId: null });
    expect(row?.replyToMessageId).toBeUndefined();
    expect(parse(row)?.replyToMessageId).toBeUndefined();
  });

  it("uuid 가 아닌 인용 대상·전체삭제 행은 싣지 않음", () => {
    expect(parse({ ...serializeCommunityMessengerMessageForBump(reply)!, replyToMessageId: "x" })?.replyToMessageId).toBeUndefined();
    const deleted = serializeCommunityMessengerMessageForBump({ ...reply, deletedForEveryoneAt: "2026-10-26T03:11:00Z" });
    expect(deleted?.replyToMessageId).toBeUndefined();
  });

  it("변경 감지: 인용만 달라진 같은 id 행은 다른 지문", () => {
    const bare = { ...reply, replyToMessageId: null, replyPreviewText: null };
    expect(roomMessagesTimelineFingerprint([bare])).not.toBe(roomMessagesTimelineFingerprint([reply]));
  });

  it("스토어: 인용 없는 행 뒤 인용 있는 같은 id 가 오면 교체", () => {
    const bare: CommunityMessengerMessage = { ...reply, replyToMessageId: null, replyPreviewText: null };
    applyIncomingMessageEvent({ viewerUserId: VIEWER, roomId: ROOM_ID, message: bare });
    applyIncomingMessageEvent({ viewerUserId: VIEWER, roomId: ROOM_ID, message: reply });
    const row = getMessengerRealtimeRoomMessages(ROOM_ID).find((m) => m.id === MESSAGE_ID);
    expect(row?.replyToMessageId).toBe(TARGET_ID);
  });
});
