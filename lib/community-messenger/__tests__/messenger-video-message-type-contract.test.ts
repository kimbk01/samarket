import { describe, expect, it } from "vitest";
import { canonicalRoomListPreviewFromMessageFields } from "@/lib/community-messenger/room-list-semantic-preview";
import {
  parseCommunityMessengerBumpMessageSnapshot,
  serializeCommunityMessengerMessageForBump,
} from "@/lib/community-messenger/realtime/community-messenger-room-bump-message-snapshot";
import { resolveMessengerVideoFields } from "@/lib/community-messenger/messenger-video-message-map";
import { canForwardMessage } from "@/lib/community-messenger/message-actions/message-share-policy";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

const SENDER = "11111111-1111-4111-8111-111111111111";
const ROOM = "22222222-2222-4222-8222-222222222222";
const MSG = "44444444-4444-4444-8444-444444444444";

const videoMessage: CommunityMessengerMessage = {
  id: MSG,
  roomId: ROOM,
  senderId: SENDER,
  senderLabel: "me",
  messageType: "video",
  content: "https://x.supabase.co/storage/v1/object/public/messenger-media/a.mp4",
  createdAt: "2026-11-24T00:00:00.000Z",
  isMine: true,
  callKind: null,
  callStatus: null,
  metadata: {
    video_thumb_url: "https://x.supabase.co/storage/v1/object/public/messenger-media/a.thumb.jpg",
    video_duration_ms: 42_000,
    video_width: 720,
    video_height: 1280,
    fileSizeBytes: 1234,
    mimeType: "video/mp4",
  },
};

describe("video 메시지 종류 계약", () => {
  it("방 목록 미리보기는 저장 URL 이 아니라 「동영상」 토큰(DB 함수와 같은 값)", () => {
    const r = canonicalRoomListPreviewFromMessageFields({ messageType: "video", content: videoMessage.content });
    expect(r.lastMessageType).toBe("video");
    expect(r.lastMessage).toBe("동영상");
  });

  it("실시간 bump 스냅샷이 video 를 text 로 떨어뜨리지 않고 metadata 를 싣는다", () => {
    const row = serializeCommunityMessengerMessageForBump(videoMessage);
    expect(row?.messageType).toBe("video");
    const parsed = parseCommunityMessengerBumpMessageSnapshot(
      { fromUserId: SENDER, canonicalRoomId: ROOM, messageId: MSG, message: row },
      "55555555-5555-4555-8555-555555555555"
    );
    expect(parsed?.messageType).toBe("video");
    expect(resolveMessengerVideoFields(parsed!)).toMatchObject({ videoDurationMs: 42_000, videoWidth: 720, videoHeight: 1280 });
  });

  it("전체삭제된 영상은 표시 필드 없음", () => {
    expect(resolveMessengerVideoFields({ ...videoMessage, deletedForEveryoneAt: "2026-11-24T01:00:00Z" })).toBeNull();
  });

  it("전달하기는 이번 범위 밖(O6) — 영상은 전달 불가", () => {
    expect(canForwardMessage(videoMessage, "direct")).toBe(false);
  });
});
