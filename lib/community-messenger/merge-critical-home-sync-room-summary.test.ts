import { beforeEach, describe, expect, it } from "vitest";
import {
  mergeMessengerRoomSummaryForHomeSyncCriticalPatch,
  mergeTradeRoomContextMetaPreferLocalDetail,
} from "@/lib/community-messenger/merge-critical-home-sync-room-summary";
import {
  clearLocalReadGuardsForTests,
  setLocalReadGuard,
} from "@/lib/community-messenger/read/local-read-guard";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function room(partial: Partial<CommunityMessengerRoomSummary> & Pick<CommunityMessengerRoomSummary, "id">): CommunityMessengerRoomSummary {
  const { id, ...restPartial } = partial;
  return {
    id,
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "상대",
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "",
    lastMessageAt: "2026-01-01T00:00:00.000Z",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    ...restPartial,
  };
}

describe("mergeTradeRoomContextMetaPreferLocalDetail", () => {
  it("keeps prev trade meta when incoming omits contextMeta", () => {
    const prev = {
      v: 1 as const,
      kind: "trade" as const,
      headline: "실제 제목",
      productCategoryLabel: "중고차",
      postId: "p1",
    };
    expect(mergeTradeRoomContextMetaPreferLocalDetail(prev, undefined)).toEqual(prev);
  });

  it("fills placeholder headline from prev", () => {
    const prev = { v: 1 as const, kind: "trade" as const, headline: "BMW X5" };
    const incoming = { v: 1 as const, kind: "trade" as const, headline: "거래", postId: "p1" };
    const m = mergeTradeRoomContextMetaPreferLocalDetail(prev, incoming);
    expect(m?.headline).toBe("BMW X5");
    expect(m?.postId).toBe("p1");
  });

  it("fills productCategoryLabel from prev when incoming lacks it", () => {
    const prev = { v: 1 as const, kind: "trade" as const, headline: "청소기", productCategoryLabel: "생활가전" };
    const incoming = { v: 1 as const, kind: "trade" as const, headline: "청소기" };
    const m = mergeTradeRoomContextMetaPreferLocalDetail(prev, incoming);
    expect(m?.productCategoryLabel).toBe("생활가전");
  });

  it("fills sellerDisplayName from prev when incoming lacks it", () => {
    const prev = { v: 1 as const, kind: "trade" as const, headline: "X", sellerDisplayName: "판매자닉" };
    const incoming = { v: 1 as const, kind: "trade" as const, headline: "X" };
    const m = mergeTradeRoomContextMetaPreferLocalDetail(prev, incoming);
    expect(m?.sellerDisplayName).toBe("판매자닉");
  });
});

describe("mergeMessengerRoomSummaryForHomeSyncCriticalPatch", () => {
  beforeEach(() => {
    clearLocalReadGuardsForTests();
  });

  it("preserves prev contextMeta when incoming dropped it", () => {
    const prev = room({
      id: "r1",
      contextMeta: { v: 1, kind: "trade", headline: "상품 A", productCategoryLabel: "디지털" },
    });
    const incoming = room({ id: "r1", unreadCount: 3 });
    const out = mergeMessengerRoomSummaryForHomeSyncCriticalPatch(prev, incoming);
    expect(out.unreadCount).toBe(3);
    expect(out.contextMeta?.kind).toBe("trade");
    expect(out.contextMeta?.headline).toBe("상품 A");
  });

  it("when local read guard is active, ignores stale positive unread for same lastMessageAt", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: ts, source: "manual" });
    const prev = room({
      id: "r1",
      lastMessageAt: ts,
      unreadCount: 0,
    });
    const incoming = room({ id: "r1", lastMessageAt: ts, unreadCount: 5 });
    const out = mergeMessengerRoomSummaryForHomeSyncCriticalPatch(prev, incoming);
    expect(out.unreadCount).toBe(0);
  });

  it("when guard active but lastMessageAt advances, allows server unread", () => {
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: "2026-01-02T00:00:00.000Z", source: "manual" });
    const prev = room({
      id: "r1",
      lastMessageAt: "2026-01-03T00:00:00.000Z",
      unreadCount: 0,
    });
    const incoming = room({
      id: "r1",
      lastMessageAt: "2026-01-03T01:00:00.000Z",
      unreadCount: 2,
    });
    const out = mergeMessengerRoomSummaryForHomeSyncCriticalPatch(prev, incoming);
    expect(out.unreadCount).toBe(2);
  });
});
