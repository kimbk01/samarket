import { beforeEach, describe, expect, it } from "vitest";
import { coalesceRoomSummarySnapshotRow } from "@/lib/community-messenger/consistency/messenger-consistency-merge";
import {
  clearMessengerConsistencyStateForTests,
  bumpRoomTruthVersion,
} from "@/lib/community-messenger/consistency/messenger-consistency-version";
import {
  clearHomeListServerUnreadIncreaseForTests,
  hasCriticalPatchReadClearEvidence,
  mergeMessengerRoomSummaryForHomeSyncCriticalPatch,
  mergeMessengerRoomSummaryForHomeSyncReplace,
  mergeTradeRoomContextMetaPreferLocalDetail,
  noteBootstrapUnreadIncreasesFromBootstrap,
  noteHomeListServerUnreadIncrease,
  peekRecentHomeListServerUnreadIncrease,
  shouldBlockCriticalPatchStaleZeroClobber,
  shouldBlockStalePositiveUnreadDecreaseClobber,
} from "@/lib/community-messenger/merge-critical-home-sync-room-summary";
import {
  shouldBlockStaleHomeListUnreadZero,
} from "@/lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list";
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
    clearMessengerConsistencyStateForTests();
    clearHomeListServerUnreadIncreaseForTests();
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

  it("home_sync_critical_patch accepts server unread increase at same lastMessageAt despite read guard", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: ts, source: "manual" });
    const prev = room({
      id: "r1",
      lastMessageAt: ts,
      unreadCount: 0,
    });
    const incoming = room({ id: "r1", lastMessageAt: ts, unreadCount: 5 });
    const out = mergeMessengerRoomSummaryForHomeSyncCriticalPatch(prev, incoming);
    expect(out.unreadCount).toBe(5);
  });

  it("home_sync_replace accepts server unread increase at same lastMessageAt despite read guard", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: ts, source: "manual" });
    const prev = room({
      id: "r1",
      lastMessageAt: ts,
      unreadCount: 0,
    });
    const incoming = room({ id: "r1", lastMessageAt: ts, unreadCount: 5 });
    const out = mergeMessengerRoomSummaryForHomeSyncReplace(prev, incoming);
    expect(out.unreadCount).toBe(5);
  });

  it("home_sync_replace allows actual read clear when local read guard is active at tail", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: ts, source: "manual" });
    const prev = room({ id: "r1", lastMessageAt: ts, unreadCount: 5 });
    const incoming = room({ id: "r1", lastMessageAt: ts, unreadCount: 0 });
    expect(hasCriticalPatchReadClearEvidence(prev, incoming)).toBe(true);
    const out = mergeMessengerRoomSummaryForHomeSyncReplace(prev, incoming);
    expect(out.unreadCount).toBe(0);
  });

  it("low-level coalesce home_sync_replace still suppresses stale positive unread under read guard", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: ts, source: "manual" });
    const prev = room({
      id: "r1",
      lastMessageAt: ts,
      unreadCount: 0,
    });
    const incoming = room({ id: "r1", lastMessageAt: ts, unreadCount: 5 });
    const out = coalesceRoomSummarySnapshotRow(prev, incoming, {
      surface: "home_sync",
      roomId: "r1",
      source: "home_sync_replace",
      eventType: "replace",
    });
    expect(out).toBe(prev);
    expect(out.unreadCount).toBe(0);
  });

  it("does not resurrect unread when incoming lastMessageAt is older than prev (stale_version)", () => {
    const prev = room({
      id: "r1",
      unreadCount: 0,
      lastMessageAt: "2026-06-05T12:00:00.000Z",
    });
    bumpRoomTruthVersion("r1", Date.parse("2026-06-05T12:00:00.000Z"), "realtime");
    const incoming = room({
      id: "r1",
      unreadCount: 5,
      lastMessageAt: "2026-06-05T11:00:00.000Z",
    });
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

  it("records recent server unread increase TTL when critical_patch restores server unread", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: ts, source: "manual" });
    const prev = room({ id: "r1", lastMessageAt: ts, unreadCount: 0 });
    const incoming = room({ id: "r1", lastMessageAt: ts, unreadCount: 5 });
    const out = mergeMessengerRoomSummaryForHomeSyncCriticalPatch(prev, incoming);
    expect(out.unreadCount).toBe(5);
    expect(peekRecentHomeListServerUnreadIncrease("r1")).toBe(5);
  });

  it("blocks stale local_unread(0) after critical_patch server unread increase", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: ts, source: "manual" });
    const prev = room({ id: "r1", lastMessageAt: ts, unreadCount: 0 });
    const incoming = room({ id: "r1", lastMessageAt: ts, unreadCount: 5 });
    const out = mergeMessengerRoomSummaryForHomeSyncCriticalPatch(prev, incoming);
    expect(out.unreadCount).toBe(5);
    expect(
      shouldBlockStaleHomeListUnreadZero({
        busType: "cm.room.local_unread",
        roomId: "r1",
        incomingUnread: 0,
        existingUnread: 5,
      })
    ).toBe(true);
  });

  it("allows real mark_read clear after critical_patch when lastReadMessageId present", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: ts, source: "manual" });
    const prev = room({ id: "r1", lastMessageAt: ts, unreadCount: 0 });
    mergeMessengerRoomSummaryForHomeSyncCriticalPatch(prev, room({ id: "r1", lastMessageAt: ts, unreadCount: 5 }));
    expect(
      shouldBlockStaleHomeListUnreadZero({
        busType: "cm.room.read",
        roomId: "r1",
        incomingUnread: 0,
        existingUnread: 5,
        lastReadMessageId: "msg-read-1",
      })
    ).toBe(false);
  });

  it("critical_patch stale positive decrease 5 to 3 blocked at same lastMessageAt", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    noteHomeListServerUnreadIncrease("r1", 5);
    const prev = room({ id: "r1", lastMessageAt: ts, unreadCount: 5 });
    const incoming = room({ id: "r1", lastMessageAt: ts, unreadCount: 3 });
    expect(shouldBlockStalePositiveUnreadDecreaseClobber(prev, incoming)).toBe(true);
    const outCritical = mergeMessengerRoomSummaryForHomeSyncCriticalPatch(prev, incoming);
    const outReplace = mergeMessengerRoomSummaryForHomeSyncReplace(prev, incoming);
    expect(outCritical.unreadCount).toBe(5);
    expect(outReplace.unreadCount).toBe(5);
  });

  it("home_sync_replace server increase 3 to 5 still applies after stale decrease guard", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    const prev = room({ id: "r1", lastMessageAt: ts, unreadCount: 3 });
    const incoming = room({ id: "r1", lastMessageAt: ts, unreadCount: 5 });
    const out = mergeMessengerRoomSummaryForHomeSyncReplace(prev, incoming);
    expect(out.unreadCount).toBe(5);
  });

  it("stale positive decrease allows actual read clear to zero", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: ts, source: "manual" });
    const prev = room({ id: "r1", lastMessageAt: ts, unreadCount: 5 });
    const incoming = room({ id: "r1", lastMessageAt: ts, unreadCount: 0 });
    expect(shouldBlockStalePositiveUnreadDecreaseClobber(prev, incoming)).toBe(false);
    const out = mergeMessengerRoomSummaryForHomeSyncReplace(prev, incoming);
    expect(out.unreadCount).toBe(0);
  });

  it("critical_patch stale zero does not clobber prev positive unread at same lastMessageAt", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    const prev = room({ id: "r1", lastMessageAt: ts, unreadCount: 5 });
    const incoming = room({ id: "r1", lastMessageAt: ts, unreadCount: 0 });
    expect(shouldBlockCriticalPatchStaleZeroClobber(prev, incoming)).toBe(true);
    const out = mergeMessengerRoomSummaryForHomeSyncCriticalPatch(prev, incoming);
    expect(out.unreadCount).toBe(5);
  });

  it("critical_patch stale zero blocked when recent server unread increase TTL is active", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    noteHomeListServerUnreadIncrease("r1", 5);
    const prev = room({ id: "r1", lastMessageAt: ts, unreadCount: 5 });
    const incoming = room({ id: "r1", lastMessageAt: ts, unreadCount: 0 });
    expect(shouldBlockCriticalPatchStaleZeroClobber(prev, incoming)).toBe(true);
    const out = mergeMessengerRoomSummaryForHomeSyncCriticalPatch(prev, incoming);
    expect(out.unreadCount).toBe(5);
  });

  it("critical_patch allows actual read clear when local read guard is active at tail", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: ts, source: "manual" });
    const prev = room({ id: "r1", lastMessageAt: ts, unreadCount: 5 });
    const incoming = room({ id: "r1", lastMessageAt: ts, unreadCount: 0 });
    expect(hasCriticalPatchReadClearEvidence(prev, incoming)).toBe(true);
    expect(shouldBlockCriticalPatchStaleZeroClobber(prev, incoming)).toBe(false);
    const out = mergeMessengerRoomSummaryForHomeSyncCriticalPatch(prev, incoming);
    expect(out.unreadCount).toBe(0);
  });

  it("critical_patch allows zero when incoming payload carries lastReadMessageId", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    const prev = room({ id: "r1", lastMessageAt: ts, unreadCount: 5 });
    const incoming = {
      ...room({ id: "r1", lastMessageAt: ts, unreadCount: 0 }),
      lastReadMessageId: "msg-read-1",
    } as CommunityMessengerRoomSummary;
    expect(shouldBlockCriticalPatchStaleZeroClobber(prev, incoming)).toBe(false);
    const out = mergeMessengerRoomSummaryForHomeSyncCriticalPatch(prev, incoming);
    expect(out.unreadCount).toBe(0);
  });

  it("stale critical 0 does not block a later fresh critical 5 at same lastMessageAt", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: ts, source: "manual" });
    const prev = room({ id: "r1", lastMessageAt: ts, unreadCount: 0 });
    const afterStale = mergeMessengerRoomSummaryForHomeSyncCriticalPatch(
      prev,
      room({ id: "r1", lastMessageAt: ts, unreadCount: 0 })
    );
    expect(afterStale.unreadCount).toBe(0);
    const out = mergeMessengerRoomSummaryForHomeSyncCriticalPatch(
      afterStale,
      room({ id: "r1", lastMessageAt: ts, unreadCount: 5 })
    );
    expect(out.unreadCount).toBe(5);
  });

  it("noteBootstrapUnreadIncreasesFromBootstrap records monotonic floor TTL on cache prime", () => {
    const prev = room({ id: "r1", lastMessageAt: "2026-01-02T00:00:00.000Z", unreadCount: 0 });
    const next = room({ id: "r1", lastMessageAt: "2026-01-02T00:00:00.000Z", unreadCount: 5 });
    noteBootstrapUnreadIncreasesFromBootstrap({ chats: [prev], groups: [] }, { chats: [next], groups: [] });
    expect(peekRecentHomeListServerUnreadIncrease("r1")).toBe(5);
  });
});
