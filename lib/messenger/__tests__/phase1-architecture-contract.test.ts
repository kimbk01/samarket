import { describe, expect, it } from "vitest";
import {
  assertDomainWriterAllowed,
  assertNoDualWrite,
  PHASE1_DEFAULT_CUTOVER,
} from "@/lib/messenger/contracts/cutover";
import {
  MESSENGER_SHELL_NAV_BADGE_POLICY,
  assertMessengerDomainWrite,
} from "@/lib/messenger/contracts/ownership";
import { MESSENGER_LEGACY_BANNED_IMPORT_PATHS } from "@/lib/messenger/legacy/classification";
import { generalDirectPorts } from "@/lib/messenger/general-direct";
import { groupPorts } from "@/lib/messenger/group";
import { tradePorts } from "@/lib/messenger/trade";
import {
  assertStoreOrderCustomerDisplayIdentity,
  storeOrderPorts,
} from "@/lib/messenger/store-order";
import {
  composeDeliveryNavOrderChatContribution,
  composeMessengerShellHome,
  composeMessengerTabBadge,
  MESSENGER_SHELL_FORBIDS_AUTHORITATIVE_ROOM_ARRAY,
} from "@/lib/messenger/shell";

describe("Phase 1 messenger domain architecture", () => {
  it("exposes ports for all four domains", () => {
    expect(generalDirectPorts.domain).toBe("general_direct");
    expect(groupPorts.domain).toBe("group");
    expect(tradePorts.domain).toBe("trade");
    expect(storeOrderPorts.domain).toBe("store_order");
    for (const p of [generalDirectPorts, groupPorts, tradePorts, storeOrderPorts]) {
      expect(p.cache.readOnlyUntilCutover).toBe(true);
      expect(p.bootstrap.acceptsOnlyOwnDomain).toBe(true);
      expect(p.realtime.requiresDomainTaggedPayload).toBe(true);
      expect(p.permission.serverAuthoritative).toBe(true);
    }
  });

  it("defaults all domain cutovers to off (no runtime authority change)", () => {
    expect(PHASE1_DEFAULT_CUTOVER.every((c) => c.mode === "off")).toBe(true);
    expect(() => assertDomainWriterAllowed({ cutover: "off", writer: "domain" })).toThrow(
      /dibay_domain_writer_forbidden/
    );
    expect(() => assertDomainWriterAllowed({ cutover: "on", writer: "legacy" })).toThrow(
      /dibay_legacy_writer_forbidden/
    );
    expect(() => assertNoDualWrite(["legacy", "domain"])).toThrow(/dibay_dual_write/);
  });

  it("shell composes ViewModels without owning domain writes", () => {
    expect(MESSENGER_SHELL_FORBIDS_AUTHORITATIVE_ROOM_ARRAY).toBe(true);
    const home = composeMessengerShellHome({
      generalDirectRows: [],
      tradeHub: {
        domain: "trade",
        roomCount: 2,
        unreadCount: 0,
        previewText: "",
        lastEventAt: null,
        latestRoomId: null,
        latestDomainIdentityKey: null,
        hrefToTradeList: "/community-messenger/trade-chats",
      },
      storeOrderHub: {
        domain: "store_order",
        roomCount: 3,
        unreadCount: 0,
        previewText: "",
        lastEventAt: null,
        latestRoomId: null,
        latestDomainIdentityKey: null,
        hrefToOrderList: "/community-messenger/delivery-chats",
      },
    });
    expect(home.tradeHub.roomCount).toBe(2);
    expect(home.storeOrderHub.roomCount).toBe(3);
    expect(home.groupRows).toHaveLength(0);
    expect(
      composeMessengerTabBadge(
        { domain: "general_direct", count: 1 },
        { domain: "group", count: 4 }
      )
    ).toBe(5);
    expect(composeDeliveryNavOrderChatContribution({ domain: "store_order", count: 7 })).toBe(7);
    expect(MESSENGER_SHELL_NAV_BADGE_POLICY.messengerTabDomains).toEqual(["general_direct", "group"]);
  });

  it("forbids store_order shared presentation; customer peer fallback fails", () => {
    const room = {
      roomId: "r1",
      chatDomain: "store_order" as const,
      domainIdentityKey: "store_order:o1",
    };
    expect(() => storeOrderPorts.presentation.resolveDisplayIdentity(room)).toThrow(
      /dual_presentation_ports/
    );
    expect(
      assertStoreOrderCustomerDisplayIdentity({
        room,
        storeName: "맛없는식당",
        storeImageUrl: "https://cdn/store.png",
      }).usedPeerUserFallback
    ).toBe(false);
    expect(() =>
      assertStoreOrderCustomerDisplayIdentity({
        room,
        storeName: "맛없는식당",
        storeImageUrl: null,
        peerUserName: "메인관리자",
      })
    ).toThrow(/peer_fallback_forbidden/);
  });

  it("forbids trade using general_direct identity", () => {
    expect(() =>
      tradePorts.presentation.resolveDisplayIdentity({
        roomId: "r",
        chatDomain: "trade",
        domainIdentityKey: "general_direct:a:b",
      })
    ).toThrow(/general_direct_identity_forbidden/);
  });

  it("blocks cross-domain ownership writes", () => {
    expect(() => assertMessengerDomainWrite("trade", "general_direct", "badge")).toThrow(
      /cross_domain_write/
    );
  });

  it("lists banned legacy imports for new modules", () => {
    expect(MESSENGER_LEGACY_BANNED_IMPORT_PATHS).toContain(
      "lib/community-messenger/bootstrap-cache"
    );
    expect(MESSENGER_LEGACY_BANNED_IMPORT_PATHS).toContain(
      "lib/community-messenger/room-context-meta"
    );
  });
});
