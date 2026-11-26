/**
 * F2 (2026-11-26 · 개정안 §15) — 재연결 뒤 상대 읽음 재조회 판정
 */
import { describe, expect, it } from "vitest";
import { roomHasOutboundAwaitingRead } from "@/lib/community-messenger/room/messenger-outbound-read-state";

const row = (id: string, t: string, isMine: boolean, extra: Record<string, unknown> = {}) => ({
  id,
  createdAt: `2026-11-26T15:${t}.000000Z`,
  isMine,
  messageType: "text",
  ...extra,
});

describe("1:1", () => {
  const m3 = row("m3", "22:29", true);
  const m4 = row("m4", "23:02", false);
  it("내 마지막 메시지가 상대 커서 뒤 → 재조회", () => {
    expect(
      roomHasOutboundAwaitingRead({
        roomType: "direct",
        rows: [row("m2", "19:14", false), m3],
        readReceipt: { lastReadMessageId: "m2", lastReadMessageCreatedAt: "2026-11-26T15:19:14.000000Z" },
      })
    ).toBe(true);
  });
  it("실기 §14: 상대가 읽고 답장(M4 병합) — 내 마지막 메시지 M3 가 커서(옛 값) 뒤 → 재조회", () => {
    expect(
      roomHasOutboundAwaitingRead({
        roomType: "direct",
        rows: [row("m2", "19:14", false), m3, m4],
        readReceipt: { lastReadMessageId: "m2", lastReadMessageCreatedAt: "2026-11-26T15:19:14.000000Z" },
      })
    ).toBe(true);
  });
  it("이미 읽힘 → 재조회 안 함", () => {
    expect(
      roomHasOutboundAwaitingRead({
        roomType: "direct",
        rows: [m3, m4],
        readReceipt: { lastReadMessageId: "m3", lastReadMessageCreatedAt: m3.createdAt },
      })
    ).toBe(false);
  });
  it("상대 커서 없음 → 안 읽힘으로 보고 재조회", () => {
    expect(roomHasOutboundAwaitingRead({ roomType: "direct", rows: [m3], readReceipt: null })).toBe(true);
  });
  it("내 메시지가 없음·시스템·통화 기록·삭제·보내는 중만 → 재조회 안 함", () => {
    expect(
      roomHasOutboundAwaitingRead({
        roomType: "direct",
        rows: [
          m4,
          row("s", "23:10", true, { messageType: "system" }),
          row("c", "23:11", true, { messageType: "call_stub" }),
          row("d", "23:12", true, { deletedForEveryoneAt: "2026-11-26T15:23:13Z" }),
          row("p", "23:14", true, { pending: true }),
        ],
        readReceipt: null,
      })
    ).toBe(false);
  });
});

describe("단체", () => {
  it("비공개 단체: 마지막 확정 메시지가 내 것 → 재조회, 남의 것 → 안 함", () => {
    expect(
      roomHasOutboundAwaitingRead({ roomType: "private_group", rows: [row("a", "10:00", false), row("b", "11:00", true)] })
    ).toBe(true);
    expect(
      roomHasOutboundAwaitingRead({ roomType: "private_group", rows: [row("a", "10:00", true), row("b", "11:00", false)] })
    ).toBe(false);
  });
  it("오픈 단체 → 안 함", () => {
    expect(roomHasOutboundAwaitingRead({ roomType: "open_group", rows: [row("a", "10:00", true)] })).toBe(false);
  });
});
