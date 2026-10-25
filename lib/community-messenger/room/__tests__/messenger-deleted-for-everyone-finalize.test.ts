import { beforeEach, describe, expect, it } from "vitest";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { mergeCommunityMessengerMessageLists } from "@/lib/community-messenger/room/merge-community-messenger-foreground-bootstrap";
import { finalizeDeletedForEveryoneMessage } from "@/lib/community-messenger/room/messenger-message-merge-authority";
import { mergePrimedTimelineSeedIntoExisting } from "@/lib/community-messenger/room/merge-primed-timeline-seed";
import { resolveDeletedMessagePlaceholder } from "@/lib/community-messenger/message-actions/message-reply-policy";
import { resetMessengerRealtimeStore } from "@/lib/community-messenger/stores/messenger-realtime-store";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

/** 1단계 결함 D-13 (2026-10-26): 전체삭제 묘비가 있는 행은 어느 병합 순서로도 원문·답장·첨부가 되살아나지 않는다. */

const ROOM_ID = "c202326f-8109-4ce4-aa61-394f0a799e7d";
const PEER = "22222222-2222-2222-2222-222222222222";
const TOMB = "2026-10-26T02:15:19.000Z";
const PLACEHOLDER = resolveDeletedMessagePlaceholder();

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function msg(n: number, extra?: Partial<CommunityMessengerMessage>): CommunityMessengerMessage {
  return {
    id: uuid(n),
    roomId: ROOM_ID,
    senderId: PEER,
    senderLabel: "Peer",
    messageType: "text",
    content: `m${n}`,
    createdAt: `2026-10-26T02:14:${String(n).padStart(2, "0")}.000Z`,
    clientMessageId: null,
    isMine: false,
    ...extra,
  };
}

/** 받는 쪽 캐시에 남은 옛 행 — 답장 인용·원문 그대로 */
const staleReply = msg(1, {
  content: "S1reply0214",
  replyToMessageId: uuid(9),
  replyPreviewText: "원문",
  replyPreviewType: "text",
  replySenderLabelSnapshot: "q",
});

/** 서버가 내려준 삭제 행(현재 매퍼처럼 답장 필드가 남아 있어도 확정 함수가 비운다) */
const serverDeleted = msg(1, {
  content: PLACEHOLDER,
  deletedForEveryoneAt: TOMB,
  replyToMessageId: uuid(9),
  replyPreviewText: "원문",
});

function expectFinal(row: CommunityMessengerMessage | undefined) {
  expect(row).toBeDefined();
  expect(row!.content).toBe(PLACEHOLDER);
  expect(row!.deletedForEveryoneAt).toBe(TOMB);
  expect(row!.replyToMessageId).toBeUndefined();
  expect(row!.replyPreviewText).toBeUndefined();
}

describe("finalizeDeletedForEveryoneMessage", () => {
  it("묘비 없는 행은 같은 객체 그대로", () => {
    expect(finalizeDeletedForEveryoneMessage(staleReply)).toBe(staleReply);
  });

  it("묘비 행: 원문·답장·첨부 제거, 자리표시 문구", () => {
    const row = finalizeDeletedForEveryoneMessage(
      msg(2, {
        messageType: "image",
        content: "",
        deletedForEveryoneAt: TOMB,
        imageAlbumUrls: ["https://x/a.jpg"],
        imagePreviewUrl: "https://x/p.jpg",
        imageOriginalUrl: "https://x/o.jpg",
      })
    );
    expect(row.content).toBe(PLACEHOLDER);
    expect(row.imageAlbumUrls).toBeUndefined();
    expect(row.imagePreviewUrl).toBeUndefined();
    expect(row.imageOriginalUrl).toBeUndefined();
    expect(row.messageType).toBe("image");
  });

  it("이미 확정된 행은 같은 객체(불필요한 재렌더 없음)", () => {
    const once = finalizeDeletedForEveryoneMessage(serverDeleted);
    expect(finalizeDeletedForEveryoneMessage(once)).toBe(once);
  });
});

describe("병합 순서와 무관하게 삭제 확정", () => {
  beforeEach(() => {
    resetMessengerRealtimeStore();
  });

  it("mergeRoomMessages: 서버 삭제 행 뒤에 옛 시드가 와도 원문 복귀 없음", () => {
    const merged = mergeRoomMessages(mergeRoomMessages([], [serverDeleted]), [staleReply]);
    expectFinal(merged.find((m) => m.id === uuid(1)));
  });

  it("mergeRoomMessages: 옛 행 위에 서버 삭제 행", () => {
    const merged = mergeRoomMessages([staleReply], [serverDeleted]);
    expectFinal(merged.find((m) => m.id === uuid(1)));
  });

  it("mergeCommunityMessengerMessageLists: 양방향", () => {
    expectFinal(mergeCommunityMessengerMessageLists([serverDeleted], [staleReply]).find((m) => m.id === uuid(1)));
    expectFinal(mergeCommunityMessengerMessageLists([staleReply], [serverDeleted]).find((m) => m.id === uuid(1)));
  });

  it("mergePrimedTimelineSeedIntoExisting: 화면은 삭제, 캐시 시드는 원문", () => {
    const next = mergePrimedTimelineSeedIntoExisting({ roomId: ROOM_ID, prev: [serverDeleted], seed: [staleReply] });
    expectFinal(next.find((m) => m.id === uuid(1)));
  });

  it("삭제와 무관한 행·통화 기록은 그대로", () => {
    const stub = msg(3, {
      messageType: "call_stub",
      content: "음성 통화",
      callKind: "voice",
      callStatus: "ended",
      callSessionId: "s-1",
    });
    const plain = msg(4);
    const merged = mergeRoomMessages([stub, plain], [serverDeleted]);
    const outStub = merged.find((m) => m.id === uuid(3));
    expect(outStub?.content).toBe("음성 통화");
    expect(outStub?.callStatus).toBe("ended");
    expect(merged.find((m) => m.id === uuid(4))?.content).toBe("m4");
    expect(merged.filter((m) => m.messageType === "call_stub")).toHaveLength(1);
  });
});
