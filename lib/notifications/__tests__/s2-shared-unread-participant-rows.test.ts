/**
 * S2 (2026-11-09) — 배지 권위 1회 계산에서 participants·rooms 를 한 번만 읽어도
 * 메신저·거래/주문 로더 결과가 이전(각자 조회)과 같다.
 */
import { describe, expect, it, vi } from "vitest";
import { loadMessengerUnreadRoomFactsFromParticipants } from "@/lib/notifications/load-messenger-unread-room-facts-from-participants";
import { loadTradeStoreOrderUnreadRoomFactsFromParticipants } from "@/lib/notifications/load-trade-store-order-unread-room-facts-from-participants";
import { loadUnreadParticipantRoomRows } from "@/lib/notifications/load-unread-participant-room-rows";

const ME = "me-1";

const PARTS = [
  { room_id: "gd-1", unread_count: 2, left_at: null },
  { room_id: "grp-1", unread_count: 1, left_at: null },
  { room_id: "trade-1", unread_count: 3, left_at: null },
  { room_id: "so-buyer", unread_count: 1, left_at: null },
  { room_id: "so-owner", unread_count: 4, left_at: null },
  { room_id: "phantom", unread_count: 1, left_at: null },
];

const ROOMS = [
  { id: "gd-1", chat_domain: "general_direct", deleted_at: null, last_message: "hi", domain_identity_key: null },
  { id: "grp-1", chat_domain: "group", deleted_at: null, last_message: "yo", domain_identity_key: "group:grp-1" },
  { id: "trade-1", chat_domain: "trade", deleted_at: null, last_message: "deal", domain_identity_key: "trade:item:s:b" },
  { id: "so-buyer", chat_domain: "store_order", deleted_at: null, last_message: "order", domain_identity_key: "store_order:ord-b" },
  { id: "so-owner", chat_domain: "store_order", deleted_at: null, last_message: "order", domain_identity_key: "store_order:ord-o" },
  { id: "phantom", chat_domain: "general_direct", deleted_at: null, last_message: "", domain_identity_key: null },
];

type Q = { table: string; filters: Array<[string, unknown, unknown]> };

function fakeSb(opts?: { failParticipants?: boolean; failRooms?: boolean }) {
  const queries: Q[] = [];
  const sb = {
    from(table: string) {
      const q: Q = { table, filters: [] };
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gt", "is", "in", "neq"]) {
        b[m] = (a?: unknown, v?: unknown) => {
          if (m !== "select") q.filters.push([m, a, v]);
          return b;
        };
      }
      b.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => {
        queries.push(q);
        return Promise.resolve(resolve(q)).then(ok, err);
      };
      return b;
    },
  };
  function resolve(q: Q): { data: unknown; error: unknown } {
    const inIds = (q.filters.find(([m, c]) => m === "in" && c === "id")?.[2] ?? []) as string[];
    if (q.table === "community_messenger_participants") {
      // peer 조회 (neq user_id)
      if (q.filters.some(([m]) => m === "neq")) {
        return { data: [{ room_id: "gd-1", user_id: "peer-1" }], error: null };
      }
      if (opts?.failParticipants) return { data: null, error: { message: "p-fail" } };
      return { data: PARTS, error: null };
    }
    if (q.table === "community_messenger_rooms") {
      if (opts?.failRooms) return { data: null, error: { message: "r-fail" } };
      const domains = q.filters.find(([m, c]) => m === "in" && c === "chat_domain")?.[2] as string[] | undefined;
      return {
        data: ROOMS.filter((r) => inIds.includes(r.id) && (!domains || domains.includes(r.chat_domain))),
        error: null,
      };
    }
    if (q.table === "store_orders") {
      return {
        data: [
          { id: "ord-b", buyer_user_id: ME, store_id: "st-other" },
          { id: "ord-o", buyer_user_id: "buyer-x", store_id: "st-mine" },
        ].filter((o) => inIds.includes(o.id)),
        error: null,
      };
    }
    if (q.table === "stores") {
      return {
        data: [
          { id: "st-other", owner_user_id: "owner-x" },
          { id: "st-mine", owner_user_id: ME },
        ].filter((s) => inIds.includes(s.id)),
        error: null,
      };
    }
    return { data: [], error: null };
  }
  const unreadPartQueries = () =>
    queries.filter(
      (q) => q.table === "community_messenger_participants" && q.filters.some(([m, c]) => m === "gt" && c === "unread_count")
    ).length;
  const roomQueries = () => queries.filter((q) => q.table === "community_messenger_rooms").length;
  return { sb: sb as never, unreadPartQueries, roomQueries };
}

describe("S2 shared participants·rooms rows", () => {
  it("공유 조회 결과 = 각자 조회 결과 (메신저·거래·주문 모두)", async () => {
    const solo = fakeSb();
    const soloMessenger = await loadMessengerUnreadRoomFactsFromParticipants(solo.sb, ME);
    const soloTrade = await loadTradeStoreOrderUnreadRoomFactsFromParticipants(solo.sb, ME);

    const shared = fakeSb();
    const rows = loadUnreadParticipantRoomRows(shared.sb, ME);
    const [sharedMessenger, sharedTrade] = await Promise.all([
      loadMessengerUnreadRoomFactsFromParticipants(shared.sb, ME, rows),
      loadTradeStoreOrderUnreadRoomFactsFromParticipants(shared.sb, ME, rows),
    ]);

    expect(sharedMessenger).toEqual(soloMessenger);
    expect(sharedTrade).toEqual(soloTrade);
    // 데이터가 실제로 채워졌는지(빈 결과끼리 같다는 착시 방지)
    expect(soloMessenger.generalDirectUnreadRoomIds).toEqual(["gd-1"]);
    expect(soloMessenger.groupUnreadRoomIds).toEqual(["grp-1"]);
    expect(soloTrade.tradeUnreadRoomIds).toEqual(["trade-1"]);
    expect(soloTrade.customerOrderUnreadRoomIds).toEqual(["so-buyer"]);
    expect(soloTrade.ownerOrderUnreadRoomIds).toEqual(["so-owner"]);
  });

  it("조회 횟수 — 각자 participants 2·rooms 2 → 공유 1·1", async () => {
    const solo = fakeSb();
    await loadMessengerUnreadRoomFactsFromParticipants(solo.sb, ME);
    await loadTradeStoreOrderUnreadRoomFactsFromParticipants(solo.sb, ME);
    expect(solo.unreadPartQueries()).toBe(2);
    expect(solo.roomQueries()).toBe(2);

    const shared = fakeSb();
    const rows = loadUnreadParticipantRoomRows(shared.sb, ME);
    await Promise.all([
      loadMessengerUnreadRoomFactsFromParticipants(shared.sb, ME, rows),
      loadTradeStoreOrderUnreadRoomFactsFromParticipants(shared.sb, ME, rows),
    ]);
    expect(shared.unreadPartQueries()).toBe(1);
    expect(shared.roomQueries()).toBe(1);
  });

  it("조회 실패 — 이전과 같이 두 로더 모두 빈 결과", async () => {
    for (const fail of [{ failParticipants: true }, { failRooms: true }]) {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const solo = fakeSb(fail);
      const soloM = await loadMessengerUnreadRoomFactsFromParticipants(solo.sb, ME);
      const soloT = await loadTradeStoreOrderUnreadRoomFactsFromParticipants(solo.sb, ME);
      const shared = fakeSb(fail);
      const rows = loadUnreadParticipantRoomRows(shared.sb, ME);
      const sharedM = await loadMessengerUnreadRoomFactsFromParticipants(shared.sb, ME, rows);
      const sharedT = await loadTradeStoreOrderUnreadRoomFactsFromParticipants(shared.sb, ME, rows);
      expect(sharedM).toEqual(soloM);
      expect(sharedT).toEqual(soloT);
      expect(sharedM.generalDirectUnreadRoomIds).toEqual([]);
      expect(sharedT.tradeUnreadRoomIds).toEqual([]);
      warn.mockRestore();
    }
  });
});
