import { describe, expect, it } from "vitest";
import {
  buildGeneralDirectIdentity,
  buildGroupIdentity,
  buildStoreOrderIdentity,
  buildStoreOrderRoomIdentity,
  buildTradeIdentity,
} from "@/lib/chat-domain/four-domain-freeze";
import {
  inferPlannedColumnsFromLegacyRoom,
  legacyGeneralDirectKeyFromIdentity,
  plannedColumnsForGeneralDirect,
  plannedColumnsForStoreOrderRoom,
  plannedColumnsForTrade,
} from "@/lib/chat-domain/domain-identity-legacy-map";

describe("four-domain-freeze identity builders", () => {
  it("sorts GD pair and prefixes gd:", () => {
    expect(buildGeneralDirectIdentity("b", "a")).toBe("gd:a:b");
    expect(buildGeneralDirectIdentity("a", "b")).toBe("gd:a:b");
  });

  it("builds group / trade / store_order room identities", () => {
    expect(buildGroupIdentity(" room-1 ")).toBe("group:room-1");
    expect(buildTradeIdentity("item1", "s2", "s1")).toBe("trade:item1:s1:s2");
    expect(buildStoreOrderRoomIdentity("ord-9")).toBe("so:order:ord-9");
    expect(buildStoreOrderIdentity("owner", "ord-9", "u1")).toBe("so:owner:ord-9:u1");
  });
});

describe("domain-identity-legacy-map", () => {
  it("round-trips GD identity ↔ legacy direct_key (long-form SSOT)", () => {
    const planned = plannedColumnsForGeneralDirect("u2", "u1");
    expect(planned.domain_identity).toBe("general_direct:u1:u2");
    expect(legacyGeneralDirectKeyFromIdentity(planned.domain_identity)).toBe("u1:u2");
    expect(legacyGeneralDirectKeyFromIdentity("gd:u1:u2")).toBe("u1:u2");
  });

  it("maps legacy GD / group / store_order; refuses trade_pc guess", () => {
    expect(
      inferPlannedColumnsFromLegacyRoom({
        id: "r1",
        room_type: "direct",
        direct_key: "u1:u2",
      }),
    ).toEqual(plannedColumnsForGeneralDirect("u1", "u2"));

    expect(
      inferPlannedColumnsFromLegacyRoom({
        id: "g1",
        room_type: "private_group",
        direct_key: null,
      })?.domain_identity,
    ).toBe("group:g1");

    expect(
      inferPlannedColumnsFromLegacyRoom({
        id: "r2",
        room_type: "direct",
        direct_key: "store_order:ord-1",
      }),
    ).toEqual(plannedColumnsForStoreOrderRoom("ord-1"));
    expect(plannedColumnsForStoreOrderRoom("ord-1").domain_identity).toBe("store_order:ord-1");

    expect(
      inferPlannedColumnsFromLegacyRoom({
        id: "r3",
        room_type: "direct",
        direct_key: "trade_pc:pc-1",
      }),
    ).toBeNull();
  });

  it("trade planned columns require explicit seller/buyer order (not sorted)", () => {
    expect(plannedColumnsForTrade("item", "seller", "buyer").domain_identity).toBe(
      "trade:item:seller:buyer",
    );
  });
});
