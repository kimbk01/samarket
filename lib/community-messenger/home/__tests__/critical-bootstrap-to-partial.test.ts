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
