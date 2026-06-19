import { describe, expect, it } from "vitest";
import { resolveMessengerRoomMessagesAutoScroll } from "@/lib/community-messenger/room/messenger-room-messages-auto-scroll";
import {
  hasMessengerRoomHydrationTimelineSeed,
  isMessengerRoomTimelinePaintableBootstrapSeed,
  shouldShowMessengerRoomTimelineHydrationSkeleton,
} from "@/lib/community-messenger/room/messenger-room-timeline-hydration";
import { resolveMessengerRoomTimelineLoadUi } from "@/lib/community-messenger/room/messenger-room-timeline-load-ui";
import {
  resolveMessengerRoomTimelinePaintSource,
  sortMessengerRoomTimelineMessages,
} from "@/lib/community-messenger/room/messenger-room-timeline-ssot";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

function msg(
  partial: Partial<CommunityMessengerMessage> & Pick<CommunityMessengerMessage, "id" | "createdAt">
): CommunityMessengerMessage {
  return {
    roomId: "room-1",
    senderId: "user-a",
    senderLabel: "User",
    messageType: "text",
    content: partial.content ?? "hello",
    metadata: {},
    isMine: false,
    ...partial,
  };
}

function snap(partial: {
  messages?: CommunityMessengerMessage[];
  lastMessage?: string;
}): NonNullable<Parameters<typeof resolveMessengerRoomTimelinePaintSource>[0]["snapshot"]> {
  return {
    messages: partial.messages,
    room: { lastMessage: partial.lastMessage ?? "" },
  };
}

describe("cm room regression matrix (pre-commit)", () => {
  describe("1. bootstrap seed paint guard", () => {
    it("lastMessage hint only, messages[] empty → paint 금지 · load UI loading/retry", () => {
      const snapshot = snap({ messages: [], lastMessage: "안녕하세요" });
      expect(isMessengerRoomTimelinePaintableBootstrapSeed(snapshot)).toBe(false);
      expect(
        resolveMessengerRoomTimelinePaintSource({
          displayRoomMessages: [],
          roomMessages: [],
          loading: true,
          timelineInitialLoadComplete: false,
          snapshot,
        })
      ).toEqual([]);
      expect(
        resolveMessengerRoomTimelineLoadUi({
          loading: true,
          displayMessageCount: 0,
          timelineLoadFailed: false,
          timelineInitialLoadComplete: false,
          roomMessagesLength: 0,
          snapshotMessagesLength: 0,
          lastMessage: "안녕하세요",
        })
      ).toBe("loading");
      expect(
        resolveMessengerRoomTimelineLoadUi({
          loading: false,
          displayMessageCount: 0,
          timelineLoadFailed: false,
          timelineInitialLoadComplete: false,
          roomMessagesLength: 0,
          snapshotMessagesLength: 0,
          lastMessage: "안녕하세요",
        })
      ).toBe("retry");
    });

    it("call_stub preview hint only (lastMessage, messages[] empty) → paint 금지", () => {
      const snapshot = snap({ messages: [], lastMessage: "부재중 음성 통화" });
      expect(isMessengerRoomTimelinePaintableBootstrapSeed(snapshot)).toBe(false);
      expect(
        resolveMessengerRoomTimelinePaintSource({
          displayRoomMessages: [],
          roomMessages: [],
          loading: false,
          timelineInitialLoadComplete: false,
          snapshot,
        })
      ).toEqual([]);
    });

    it("messages[] 있는 complete seed → merge 전 paint 허용", () => {
      const messages = [msg({ id: "m1", createdAt: "2026-01-01T00:00:00.000Z", content: "hi" })];
      const snapshot = snap({ messages, lastMessage: "hi" });
      expect(isMessengerRoomTimelinePaintableBootstrapSeed(snapshot)).toBe(true);
      const paint = resolveMessengerRoomTimelinePaintSource({
        displayRoomMessages: [],
        roomMessages: [],
        loading: false,
        timelineInitialLoadComplete: false,
        snapshot,
      });
      expect(paint.map((m) => m.id)).toEqual(["m1"]);
    });

    it("messages[] without lastMessage (신규 seed) → paint 허용", () => {
      const messages = [msg({ id: "only", createdAt: "2026-01-01T00:00:00.000Z" })];
      const snapshot = snap({ messages, lastMessage: "" });
      expect(isMessengerRoomTimelinePaintableBootstrapSeed(snapshot)).toBe(true);
    });
  });

  describe("2. load UI 3-state", () => {
    it("메시지 있는 방 → ok (spinner 없음)", () => {
      expect(
        resolveMessengerRoomTimelineLoadUi({
          loading: true,
          displayMessageCount: 5,
          timelineLoadFailed: false,
          timelineInitialLoadComplete: false,
          roomMessagesLength: 5,
          snapshotMessagesLength: 5,
          lastMessage: "x",
        })
      ).toBe("ok");
    });

    it("실패 방 → retry", () => {
      expect(
        resolveMessengerRoomTimelineLoadUi({
          loading: false,
          displayMessageCount: 0,
          timelineLoadFailed: true,
          timelineInitialLoadComplete: false,
          roomMessagesLength: 0,
          snapshotMessagesLength: 0,
          lastMessage: "hint",
        })
      ).toBe("retry");
    });

    it("진짜 빈 방 → ok", () => {
      expect(
        resolveMessengerRoomTimelineLoadUi({
          loading: false,
          displayMessageCount: 0,
          timelineLoadFailed: false,
          timelineInitialLoadComplete: true,
          roomMessagesLength: 0,
          snapshotMessagesLength: 0,
          lastMessage: "",
        })
      ).toBe("ok");
    });

    it("loading=false 무한 loading 회귀 없음", () => {
      const ui = resolveMessengerRoomTimelineLoadUi({
        loading: false,
        displayMessageCount: 0,
        timelineLoadFailed: false,
        timelineInitialLoadComplete: false,
        roomMessagesLength: 0,
        snapshotMessagesLength: 0,
        lastMessage: "stub",
      });
      expect(ui).not.toBe("loading");
    });
  });

  describe("3. prepend vs append auto-scroll", () => {
    it("prepend — tail id 불변 → scroll 금지", () => {
      expect(
        resolveMessengerRoomMessagesAutoScroll({
          previousTailMessageId: "tail-99",
          currentTailMessageId: "tail-99",
          currentTailIsMine: false,
        })
      ).toEqual({ scroll: false, reason: "skip_tail_unchanged" });
    });

    it("append — tail id 변경 → auto scroll", () => {
      expect(
        resolveMessengerRoomMessagesAutoScroll({
          previousTailMessageId: "tail-99",
          currentTailMessageId: "tail-100",
          currentTailIsMine: false,
        })
      ).toEqual({ scroll: true, reason: "messages_changed_auto" });
    });

    it("own tail unchanged — re-render/merge only → scroll 금지", () => {
      expect(
        resolveMessengerRoomMessagesAutoScroll({
          previousTailMessageId: "tail-99",
          currentTailMessageId: "tail-99",
          currentTailIsMine: true,
        })
      ).toEqual({ scroll: false, reason: "skip_tail_unchanged" });
    });

    it("own send — tail id 변경 → own append scroll", () => {
      expect(
        resolveMessengerRoomMessagesAutoScroll({
          previousTailMessageId: "tail-99",
          currentTailMessageId: "tail-100",
          currentTailIsMine: true,
        })
      ).toEqual({ scroll: true, reason: "own_message_append" });
    });

    it("ack id replace — same clientMessageId, server id only → scroll 금지 (깜빡임 방지)", () => {
      expect(
        resolveMessengerRoomMessagesAutoScroll({
          previousTailMessageId: "temp-abc",
          currentTailMessageId: "server-xyz",
          currentTailIsMine: true,
          previousTailClientMessageId: "cid-1",
          currentTailClientMessageId: "cid-1",
        })
      ).toEqual({ scroll: false, reason: "skip_ack_id_replace" });
    });

    it("상대 append — tail 변경 → auto scroll (bottom 근처 경로)", () => {
      expect(
        resolveMessengerRoomMessagesAutoScroll({
          previousTailMessageId: "m1",
          currentTailMessageId: "m2",
          currentTailIsMine: false,
        })
      ).toEqual({ scroll: true, reason: "messages_changed_auto" });
    });
  });

  describe("4. entry paint row counts (1/3/50)", () => {
    function tailIds(count: number): string[] {
      const rows = Array.from({ length: count }, (_, i) =>
        msg({ id: `m${i + 1}`, createdAt: `2026-01-01T00:00:${String(i).padStart(2, "0")}.000Z` })
      );
      return sortMessengerRoomTimelineMessages(rows).map((m) => m.id);
    }

    for (const count of [1, 3, 50] as const) {
      it(`${count} messages — paint source tail order preserved`, () => {
        const messages = Array.from({ length: count }, (_, i) =>
          msg({ id: `m${i + 1}`, createdAt: `2026-01-01T00:00:${String(i).padStart(2, "0")}.000Z` })
        );
        const paint = resolveMessengerRoomTimelinePaintSource({
          displayRoomMessages: messages,
          roomMessages: messages,
          loading: false,
          timelineInitialLoadComplete: true,
          snapshot: snap({ messages, lastMessage: "tail" }),
        });
        expect(paint.map((m) => m.id)).toEqual(tailIds(count));
        expect(paint[paint.length - 1]?.id).toBe(`m${count}`);
      });
    }
  });

  describe("5. skeleton / spinner guard", () => {
    it("메시지 paint 중 pass2 — hydration skeleton 숨김", () => {
      expect(
        shouldShowMessengerRoomTimelineHydrationSkeleton({
          displayRoomMessagesLength: 0,
          roomMessagesLength: 3,
          hydrationPass: 2,
          clientShellPlaceholder: false,
          loading: false,
          snapshotMessagesLength: 3,
          lastMessage: "x",
        })
      ).toBe(false);
    });

    it("lastMessage only + loading — skeleton 표시", () => {
      expect(
        shouldShowMessengerRoomTimelineHydrationSkeleton({
          displayRoomMessagesLength: 0,
          roomMessagesLength: 0,
          hydrationPass: 1,
          clientShellPlaceholder: false,
          loading: true,
          snapshotMessagesLength: 0,
          lastMessage: "hint",
        })
      ).toBe(true);
    });
  });

  describe("6. hydration seed SSOT (cold = re-entry paint path)", () => {
    it("lastMessage only — hasMessengerRoomHydrationTimelineSeed false", () => {
      expect(
        hasMessengerRoomHydrationTimelineSeed({
          roomMessagesLength: 0,
          snapshotMessagesLength: 0,
          snapshot: snap({ messages: [], lastMessage: "hint only" }),
        })
      ).toBe(false);
    });

    it("messages[] complete seed — hasMessengerRoomHydrationTimelineSeed true", () => {
      const messages = [msg({ id: "m1", createdAt: "2026-01-01T00:00:00.000Z" })];
      expect(
        hasMessengerRoomHydrationTimelineSeed({
          roomMessagesLength: 0,
          snapshotMessagesLength: 1,
          snapshot: snap({ messages, lastMessage: "m1" }),
        })
      ).toBe(true);
    });

    it("cold vs re-entry — 동일 paint source row order", () => {
      const messages = [
        msg({ id: "m1", createdAt: "2026-01-01T00:00:01.000Z" }),
        msg({ id: "m2", createdAt: "2026-01-01T00:00:02.000Z" }),
        msg({ id: "m3", createdAt: "2026-01-01T00:00:03.000Z" }),
      ];
      const snapshot = snap({ messages, lastMessage: "tail" });
      const coldPaint = resolveMessengerRoomTimelinePaintSource({
        displayRoomMessages: [],
        roomMessages: messages,
        loading: false,
        timelineInitialLoadComplete: false,
        snapshot,
      });
      const reentryPaint = resolveMessengerRoomTimelinePaintSource({
        displayRoomMessages: messages,
        roomMessages: messages,
        loading: false,
        timelineInitialLoadComplete: true,
        snapshot,
      });
      expect(coldPaint.map((m) => m.id)).toEqual(reentryPaint.map((m) => m.id));
    });
  });
});
