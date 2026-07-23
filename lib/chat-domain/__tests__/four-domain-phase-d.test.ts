import { describe, expect, it } from "vitest";
import {
  loadGeneralDirectListBootstrap,
  loadGroupListBootstrap,
  loadStoreOrderListBootstrap,
  loadTradeListBootstrap,
} from "@/lib/chat-domain/bootstrap";
import type { DomainListItemDto } from "@/lib/chat-domain/list/domain-list-dto";

describe("Phase D domain list bootstrap stubs", () => {
  it("returns not_wired for all four domains (Surface not cut over)", async () => {
    const gd = await loadGeneralDirectListBootstrap({ userId: "u1" });
    const group = await loadGroupListBootstrap({ userId: "u1" });
    const trade = await loadTradeListBootstrap({ userId: "u1" });
    const so = await loadStoreOrderListBootstrap({ userId: "u1" });
    expect(gd).toMatchObject({ status: "not_wired", chatDomain: "general_direct", items: [] });
    expect(group).toMatchObject({ status: "not_wired", chatDomain: "group", items: [] });
    expect(trade).toMatchObject({ status: "not_wired", chatDomain: "trade", items: [] });
    expect(so).toMatchObject({ status: "not_wired", chatDomain: "store_order", items: [] });
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
});
