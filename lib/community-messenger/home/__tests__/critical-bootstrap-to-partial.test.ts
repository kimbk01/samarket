import { describe, expect, it } from "vitest";
import {
  communityMessengerBootstrapFromCriticalPayload,
  criticalRoomRowToRoomSummary,
} from "@/lib/community-messenger/home/critical-bootstrap-to-partial";
import { communityMessengerRoomIsConfirmedTrade } from "@/lib/community-messenger/messenger-room-domain";
import type { CommunityMessengerCriticalRoomRow } from "@/lib/community-messenger/types";

function criticalRow(
  overrides: Partial<CommunityMessengerCriticalRoomRow> & Pick<CommunityMessengerCriticalRoomRow, "room_id">
): CommunityMessengerCriticalRoomRow {
  return {
    room_id: overrides.room_id,
    room_type: overrides.room_type ?? "direct",
    direct_key: overrides.direct_key ?? null,
    title: overrides.title ?? "room",
    avatar_url: overrides.avatar_url ?? null,
    avatar_ref: null,
    last_message_preview: overrides.last_message_preview ?? "hi",
    last_message_at: overrides.last_message_at ?? "2026-07-13T00:00:00.000Z",
    unread_count: overrides.unread_count ?? 0,
    participant_labels_minimal: overrides.participant_labels_minimal ?? [
      { user_id: "u1", label: "A", avatar_url: null },
      { user_id: "u2", label: "B", avatar_url: null },
    ],
    group_meta: overrides.group_meta ?? null,
    context_meta: overrides.context_meta,
  };
}

describe("criticalRoomRowToRoomSummary", () => {
  it("A. preserves trade context_meta on contextMeta", () => {
    const row = criticalRow({
      room_id: "room-trade",
      context_meta: { v: 1, kind: "trade", productChatId: "pc-1" },
    });
    const summary = criticalRoomRowToRoomSummary(row, "u1");
    expect(summary.contextMeta?.kind).toBe("trade");
    expect(summary.contextMeta?.productChatId).toBe("pc-1");
  });

  it("B. keeps contextMeta null when context_meta is null", () => {
    const row = criticalRow({
      room_id: "room-null",
      context_meta: null,
    });
    const summary = criticalRoomRowToRoomSummary(row, "u1");
    expect(summary.contextMeta).toBeNull();
  });

  it("C. does not misclassify general_friend direct room without trade meta", () => {
    const row = criticalRow({
      room_id: "room-general",
      direct_key: "general_friend:u1:u2",
      context_meta: null,
    });
    const summary = criticalRoomRowToRoomSummary(row, "u1");
    expect(summary.contextMeta).toBeNull();
    expect(communityMessengerRoomIsConfirmedTrade(summary)).toBe(false);
  });

  it("D. maps general_friend directKey with trade context_meta to confirmed trade", () => {
    const row = criticalRow({
      room_id: "room-gf-trade",
      direct_key: "general_friend:u1:u2",
      context_meta: { v: 1, kind: "trade", productChatId: "pc-gf" },
    });
    const summary = criticalRoomRowToRoomSummary(row, "u1");
    expect(summary.contextMeta?.kind).toBe("trade");
    expect(communityMessengerRoomIsConfirmedTrade(summary)).toBe(true);
  });

  it("E. parses context_meta JSON string without field loss", () => {
    const row = criticalRow({
      room_id: "room-string-meta",
      context_meta: JSON.stringify({
        v: 1,
        kind: "trade",
        productChatId: "pc-str",
        buyerId: "buyer-1",
        sellerId: "seller-1",
      }) as unknown as CommunityMessengerCriticalRoomRow["context_meta"],
    });
    const summary = criticalRoomRowToRoomSummary(row, "u1");
    expect(summary.contextMeta).toEqual({
      v: 1,
      kind: "trade",
      productChatId: "pc-str",
      buyerId: "buyer-1",
      sellerId: "seller-1",
    });
  });

  it("rejects invalid context_meta objects", () => {
    const row = criticalRow({
      room_id: "room-invalid",
      context_meta: { v: 2, kind: "trade" } as unknown as CommunityMessengerCriticalRoomRow["context_meta"],
    });
    const summary = criticalRoomRowToRoomSummary(row, "u1");
    expect(summary.contextMeta).toBeNull();
  });
});

describe("communityMessengerBootstrapFromCriticalPayload", () => {
  it("maps all critical chats through context_meta → contextMeta", () => {
    const payload = communityMessengerBootstrapFromCriticalPayload({
      tier: "critical",
      me: null,
      tabs: { chats: 1, groups: 0 },
      chats: [
        criticalRow({
          room_id: "c1",
          context_meta: { v: 1, kind: "trade", productChatId: "pc-1" },
        }),
      ],
      groups: [],
    });
    expect(payload.chats[0]?.contextMeta?.kind).toBe("trade");
    expect(payload.clientHydrationTier).toBe("critical");
  });
});

/**
 * A-16 (10-27 09:04 Samsung 재현): 앱 재시작 첫 화면(critical)에 보관 값이 없어 「보관된 채팅」 줄이 없다가
 * lite 응답(약 1초 뒤)에서 생기며 목록이 밀렸다.
 */
describe("A-16 critical viewer 값", () => {
  it("서버 summary 의 보관·차단 숨김·고정·알림 끔을 critical 행에 싣는다", async () => {
    const { summaryToCriticalRow } = await import("@/lib/community-messenger/bootstrap/critical-stage");
    const base = criticalRoomRowToRoomSummary(criticalRow({ room_id: "r-a16" }), "u1");
    const row = summaryToCriticalRow(
      { ...base, isArchivedByViewer: true, isBlockedHiddenByViewer: false, isPinned: true, isMuted: true },
      []
    );
    expect(row.is_archived_by_viewer).toBe(true);
    expect(row.is_blocked_hidden_by_viewer).toBe(false);
    expect(row.is_pinned).toBe(true);
    expect(row.is_muted).toBe(true);
  });

  it("critical 행의 viewer 값이 첫 화면 방 요약에 들어간다(보관된 방은 보관함으로 분류)", async () => {
    const { communityMessengerRoomIsInboxHidden } = await import("@/lib/community-messenger/types");
    const s = criticalRoomRowToRoomSummary(
      { ...criticalRow({ room_id: "r-arch" }), is_archived_by_viewer: true, is_pinned: false, is_muted: true },
      "u1"
    );
    expect(s.isArchivedByViewer).toBe(true);
    expect(s.isMuted).toBe(true);
    expect(s.isPinned).toBe(false);
    expect(communityMessengerRoomIsInboxHidden(s)).toBe(true);
  });

  it("구 응답(필드 없음)은 지금과 같이 값을 넣지 않는다", () => {
    const s = criticalRoomRowToRoomSummary(criticalRow({ room_id: "r-old" }), "u1");
    expect("isArchivedByViewer" in s).toBe(false);
    expect("isPinned" in s).toBe(false);
    expect("isMuted" in s).toBe(false);
  });
});
