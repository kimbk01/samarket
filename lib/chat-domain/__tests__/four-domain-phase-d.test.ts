import { describe, expect, it } from "vitest";
import {
  loadGeneralDirectListBootstrap,
  loadGroupListBootstrap,
  loadStoreOrderListBootstrap,
  loadTradeListBootstrap,
} from "@/lib/chat-domain/bootstrap";
import type { DomainListItemDto } from "@/lib/chat-domain/list/domain-list-dto";
import {
  applyTradeListProjection,
  getDomainListProjection,
  __resetDomainListProjectionsForTest,
} from "@/lib/chat-domain/list/domain-list-writers";
import { dualWriteDomainListProjectionsFromRooms } from "@/lib/chat-domain/list/dual-write-domain-list-from-rooms";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

describe("Phase D domain list bootstrap (slice-1 wired)", () => {
  it("requires supabase client (no silent not_wired stub)", async () => {
    const gd = await loadGeneralDirectListBootstrap({ userId: "u1" });
    const group = await loadGroupListBootstrap({ userId: "u1" });
    const trade = await loadTradeListBootstrap({ userId: "u1" });
    const so = await loadStoreOrderListBootstrap({ userId: "u1" });
    expect(gd).toMatchObject({ status: "error", chatDomain: "general_direct", error: "missing_supabase_client" });
    expect(group).toMatchObject({ status: "error", chatDomain: "group", error: "missing_supabase_client" });
    expect(trade).toMatchObject({ status: "error", chatDomain: "trade", error: "missing_supabase_client" });
    expect(so).toMatchObject({ status: "error", chatDomain: "store_order", error: "missing_supabase_client" });
  });

  it("DomainListItemDto shape accepts freeze identity", () => {
    const item: DomainListItemDto = {
      roomId: "r1",
      chatDomain: "general_direct",
      domainIdentity: "gd:a:b",
      unreadCount: 0,
      lastMessageAt: null,
      title: "",
    };
    expect(item.domainIdentity.startsWith("gd:")).toBe(true);
  });

  it("dual-write applies Domain projections fail-closed", () => {
    __resetDomainListProjectionsForTest();
    const rooms = [
      {
        id: "t1",
        chatDomain: "trade",
        domainIdentity: "trade:i:s:b",
        unreadCount: 2,
        lastMessageAt: "2026-01-01T00:00:00Z",
        title: "Trade",
        lastMessage: "hi",
      },
      {
        id: "skip",
        unreadCount: 1,
        title: "No domain",
      },
    ] as unknown as CommunityMessengerRoomSummary[];
    const r = dualWriteDomainListProjectionsFromRooms(rooms, 10);
    expect(r.byDomain.trade).toBe(1);
    expect(r.omitted).toBe(1);
    expect(getDomainListProjection("trade")?.items[0]?.roomId).toBe("t1");
    expect(applyTradeListProjection({ chatDomain: "trade", items: [], versionMs: 11 }).status).toBe("ok");
  });
});
