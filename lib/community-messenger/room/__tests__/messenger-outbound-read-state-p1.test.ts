/**
 * P1 전송 상태 SSOT — 읽음 판정 순수 함수 · 낙관 행 순서 · 실시간 커서 패치
 * (docs/audit/messenger-chat-audit-2026-11-18/appendix-P1-send-status-design.md B-9 #3·#4·#7·#9)
 */
import { describe, expect, it } from "vitest";
import {
  compareMessengerReadOrderKey,
  messengerSubMillisecondMicros,
  resolveDirectPeerReadCursorKey,
  resolveGroupReadFloorKey,
  resolveMessengerOutboundReadState,
  resolveMessengerOutboundStatus,
} from "@/lib/community-messenger/room/messenger-outbound-read-state";
import {
  communityMessengerOptimisticSeq,
  mergeRoomMessages,
  nextOptimisticCommunityMessengerCreatedAtIso,
} from "@/components/community-messenger/room/community-messenger-room-helpers";
import { applyPeerReadReceiptRealtimePatch } from "@/lib/community-messenger/room/messenger-peer-read-cursor-guard";

const mine = (id: string, createdAt: string, extra: Record<string, unknown> = {}) => ({
  id,
  createdAt,
  isMine: true,
  messageType: "text",
  ...extra,
});

describe("1:1 읽음 커서 (createdAt, id) 튜플", () => {
  const rows = [
    mine("a", "2026-11-18T01:00:00.000Z"),
    mine("b", "2026-11-18T01:00:01.000Z"),
    mine("c", "2026-11-18T01:00:02.000Z"),
  ];

  it("커서 이전·같음 = 읽음, 이후 = 안 읽음", () => {
    const key = resolveDirectPeerReadCursorKey({ lastReadMessageId: "b", lastReadMessageCreatedAt: null, rows });
    expect(resolveMessengerOutboundReadState(rows[0]!, "direct", key)).toBe("read");
    expect(resolveMessengerOutboundReadState(rows[1]!, "direct", key)).toBe("read");
    expect(resolveMessengerOutboundReadState(rows[2]!, "direct", key)).toBe("unread");
  });

  it("커서 id 가 화면에 없으면 서버 created_at 으로 비교", () => {
    const key = resolveDirectPeerReadCursorKey({
      lastReadMessageId: "zz",
      lastReadMessageCreatedAt: "2026-11-18T01:00:01.500Z",
      rows,
    });
    expect(resolveMessengerOutboundReadState(rows[1]!, "direct", key)).toBe("read");
    expect(resolveMessengerOutboundReadState(rows[2]!, "direct", key)).toBe("unread");
  });

  it("같은 시각이면 id 문자열 순서", () => {
    const k = { t: 10, id: "m-5" };
    expect(compareMessengerReadOrderKey({ t: 10, id: "m-4" }, k)).toBeLessThan(0);
    expect(compareMessengerReadOrderKey({ t: 10, id: "m-6" }, k)).toBeGreaterThan(0);
    expect(compareMessengerReadOrderKey({ t: 10, id: "m-5" }, k)).toBe(0);
  });

  it("커서 시각을 모르면 전부 저장됨(안 읽음) — 과소 표시", () => {
    const key = resolveDirectPeerReadCursorKey({ lastReadMessageId: "zz", lastReadMessageCreatedAt: null, rows });
    expect(key).toBeNull();
    for (const r of rows) expect(resolveMessengerOutboundReadState(r, "direct", key)).toBe("unread");
  });

  it("보내는 중 행은 읽음이 될 수 없다(행이 시계·경고로 판정)", () => {
    const pending = mine("pending:r:1", "2026-11-18T00:00:00.000Z", { pending: true });
    const key = { t: Date.parse("2026-11-18T02:00:00.000Z"), id: "z" };
    expect(resolveMessengerOutboundReadState(pending, "direct", key)).toBe("none");
    expect(resolveMessengerOutboundStatus(pending, "none")).toBe("sending");
    expect(resolveMessengerOutboundStatus({ ...pending, sendFailed: true }, "none")).toBe("failed");
  });

  it("남의 메시지·시스템·통화 기록·삭제 묘비는 상태 없음", () => {
    const key = { t: 1e15, id: "z" };
    expect(resolveMessengerOutboundStatus({ ...rows[0]!, isMine: false }, "none")).toBeNull();
    expect(resolveMessengerOutboundReadState({ ...rows[0]!, messageType: "system" }, "direct", key)).toBe("none");
    expect(resolveMessengerOutboundReadState({ ...rows[0]!, messageType: "call_stub" }, "direct", key)).toBe("none");
    expect(
      resolveMessengerOutboundReadState({ ...rows[0]!, deletedForEveryoneAt: "2026-11-18T03:00:00Z" }, "direct", key)
    ).toBe("none");
  });

  it("오픈 그룹은 저장됨까지만", () => {
    expect(resolveMessengerOutboundReadState(rows[0]!, "untracked", null)).toBe("sent");
    expect(resolveMessengerOutboundStatus(rows[0]!, "sent")).toBe("sent");
  });
});

describe("읽음 순서 키 — 같은 ms 안 마이크로초 (리뷰 #3)", () => {
  it("ms 가 같으면 µs 로 비교해 서버 (created_at µs, id) 순서와 같다", () => {
    const cursor = resolveDirectPeerReadCursorKey({
      lastReadMessageId: "mmm",
      lastReadMessageCreatedAt: "2026-11-18T01:00:00.123400+00:00",
      rows: [],
    });
    // id 는 커서보다 작지만 µs 가 더 늦다 → 서버 기준 커서 뒤(안 읽음)
    expect(resolveMessengerOutboundReadState(mine("aaa", "2026-11-18T01:00:00.123500+00:00"), "direct", cursor)).toBe(
      "unread"
    );
    // id 는 커서보다 크지만 µs 가 더 이르다 → 읽음
    expect(resolveMessengerOutboundReadState(mine("zzz", "2026-11-18T01:00:00.123300+00:00"), "direct", cursor)).toBe(
      "read"
    );
  });

  it("µs 가 없는 값은 0 — 기존 ms·id 비교 유지", () => {
    expect(messengerSubMillisecondMicros("2026-11-18T01:00:00.123Z")).toBe(0);
    expect(messengerSubMillisecondMicros("2026-11-18T01:00:00.123456Z")).toBe(456);
    expect(messengerSubMillisecondMicros("2026-11-18T01:00:00Z")).toBe(0);
  });
});

describe("비공개 그룹 읽음 floor", () => {
  const rows = [
    mine("old", "2026-11-18T00:00:00.000Z"),
    mine("m1", "2026-11-18T01:00:00.000Z"),
    mine("m2", "2026-11-18T01:00:01.000Z"),
    mine("m3", "2026-11-18T01:00:02.000Z"),
  ];

  it("읽음 수 ≥1 인 가장 늦은 메시지 이하 전부 읽음(조회 범위 밖 옛 메시지 포함)", () => {
    const floor = resolveGroupReadFloorKey(rows, { m2: { readCount: 1 }, m3: { readCount: 0 } });
    expect(resolveMessengerOutboundReadState(rows[0]!, "private_group", floor)).toBe("read");
    expect(resolveMessengerOutboundReadState(rows[2]!, "private_group", floor)).toBe("read");
    expect(resolveMessengerOutboundReadState(rows[3]!, "private_group", floor)).toBe("unread");
  });

  it("아무도 안 읽었으면 전부 저장됨", () => {
    const floor = resolveGroupReadFloorKey(rows, { m1: { readCount: 0 } });
    expect(floor).toBeNull();
    for (const r of rows) expect(resolveMessengerOutboundReadState(r, "private_group", floor)).toBe("unread");
  });
});

describe("낙관 행 순서 (B-2 #13)", () => {
  const base = { roomId: "r", senderId: "u", senderLabel: "me", messageType: "text" as const, isMine: true, callKind: null, callStatus: null };

  it("보내는 중 행끼리 같은 시각을 받지 않는다", () => {
    const confirmed = { ...base, id: "c1", content: "x", createdAt: "2099-01-01T00:00:00.000Z" };
    const t1 = nextOptimisticCommunityMessengerCreatedAtIso([confirmed]);
    const p1 = { ...base, id: "pending:r:9", content: "a", createdAt: t1, pending: true };
    const t2 = nextOptimisticCommunityMessengerCreatedAtIso([confirmed, p1]);
    expect(Date.parse(t2)).toBeGreaterThan(Date.parse(t1));
  });

  it("같은 시각 보내는 중 행은 생성 순번 순서(…:9 → …:10)", () => {
    const at = "2026-11-18T01:00:00.000Z";
    const p9 = { ...base, id: "pending:r:9", content: "nine", createdAt: at, pending: true };
    const p10 = { ...base, id: "pending:r:10", content: "ten", createdAt: at, pending: true };
    const merged = mergeRoomMessages([], [p10, p9]);
    expect(merged.map((m) => m.id)).toEqual(["pending:r:9", "pending:r:10"]);
    expect(communityMessengerOptimisticSeq("pending:image:r:12")).toBe(12);
    expect(communityMessengerOptimisticSeq("abc")).toBeNull();
  });
});

describe("실시간 상대 읽음 패치 (S3-(e))", () => {
  const prev = {
    roomId: "r",
    readerUserId: "p",
    lastReadAt: "2026-11-18T01:00:00.000Z",
    lastReadMessageId: "old",
    lastReadMessageCreatedAt: "2026-11-18T00:59:00.000Z",
  };

  it("새 id 를 화면에서 못 찾으면 created_at 을 비운다(옛 시각과 섞지 않음)", () => {
    const next = applyPeerReadReceiptRealtimePatch(prev, {
      lastReadMessageId: "new",
      lastReadAt: "2026-11-18T01:05:00.000Z",
      createdAtForCursor: null,
    });
    expect(next.lastReadMessageId).toBe("new");
    expect(next.lastReadMessageCreatedAt).toBeNull();
  });

  it("찾으면 그 시각, 같은 id(읽은 시각만 전진)면 기존 시각 유지", () => {
    expect(
      applyPeerReadReceiptRealtimePatch(prev, {
        lastReadMessageId: "new",
        lastReadAt: null,
        createdAtForCursor: "2026-11-18T01:04:00.000Z",
      }).lastReadMessageCreatedAt
    ).toBe("2026-11-18T01:04:00.000Z");
    expect(
      applyPeerReadReceiptRealtimePatch(prev, {
        lastReadMessageId: "old",
        lastReadAt: "2026-11-18T01:06:00.000Z",
        createdAtForCursor: null,
      }).lastReadMessageCreatedAt
    ).toBe(prev.lastReadMessageCreatedAt);
  });
});
