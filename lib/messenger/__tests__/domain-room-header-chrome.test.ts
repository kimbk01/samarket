import { describe, expect, it } from "vitest";
import {
  composeDomainRoomHeaderChrome,
} from "@/lib/messenger/contracts/domain-room-header-chrome";
import {
  resolveDomainRoomHeaderSecondaryText,
} from "@/components/community-messenger/domain-shell-canary/domain-room-header-chrome-client";
import type { MessageKey } from "@/lib/i18n/messages";

const t = (key: MessageKey, vars?: Record<string, string | number>) => {
  if (vars?.orderNo != null) return `${String(key)}:${vars.orderNo}`;
  return String(key);
};

describe("composeDomainRoomHeaderChrome — Domain Header Factory", () => {
  it("general_peer allows 1:1 chrome and user identity", () => {
    const chrome = composeDomainRoomHeaderChrome({ kind: "general_peer" });
    expect(chrome.roomTypeLabelKey).toBe("nav_messenger_direct_room");
    expect(chrome.forbidsGeneralDirectChrome).toBe(false);
    expect(chrome.profileKind).toBe("user");
    expect(chrome.identityKind).toBe("user");
    expect(chrome.showMemberCountSuffix).toBe(false);
  });

  it("trade Room chrome: listing profileKind + peer secondary", () => {
    const asSellerView = composeDomainRoomHeaderChrome({
      kind: "trade",
      peerLabel: "구매 희망자 김철수",
      productTitle: "맥북 프로 M3",
    });
    expect(asSellerView.roomTypeLabelKey).toBe("nav_trade_chat_label");
    expect(asSellerView.forbidsGeneralDirectChrome).toBe(true);
    expect(asSellerView.profileKind).toBe("listing");
    expect(asSellerView.identityKind).toBe("listing_seller_counterparty");
    expect(resolveDomainRoomHeaderSecondaryText(asSellerView.headerSecondary, t)).toBe(
      "구매 희망자 김철수"
    );

    const asBuyerView = composeDomainRoomHeaderChrome({
      kind: "trade",
      peerLabel: "판매자 홍길동",
      productTitle: "맥북 프로 M3",
    });
    expect(asBuyerView.profileKind).toBe("listing");
    expect(resolveDomainRoomHeaderSecondaryText(asBuyerView.headerSecondary, t)).toBe(
      "판매자 홍길동"
    );
  });

  it("buyer_store forbids general chrome and uses store + order secondary", () => {
    const chrome = composeDomainRoomHeaderChrome({
      kind: "buyer_store",
      orderId: "SO1781948788277b4ba",
      orderStatusLabel: null,
    });
    expect(chrome.roomTypeLabelKey).toBe("nav_chat_order");
    expect(chrome.forbidsGeneralDirectChrome).toBe(true);
    expect(chrome.profileKind).toBe("store");
    expect(chrome.identityKind).toBe("store");
    expect(chrome.showMemberCountSuffix).toBe(false);
    expect(resolveDomainRoomHeaderSecondaryText(chrome.headerSecondary, t)).toContain(
      "store_messenger_list_order_no"
    );
  });

  it("owner_buyer_peer uses customer profile identity", () => {
    const chrome = composeDomainRoomHeaderChrome({
      kind: "owner_buyer_peer",
      orderId: "ord-1",
    });
    expect(chrome.roomTypeLabelKey).toBe("nav_chat_order");
    expect(chrome.forbidsGeneralDirectChrome).toBe(true);
    expect(chrome.profileKind).toBe("customer");
    expect(chrome.identityKind).toBe("customer");
  });

  it("group uses member count chrome without general direct phrase", () => {
    const chrome = composeDomainRoomHeaderChrome({
      kind: "group",
      memberCount: 6,
      groupSubtype: "private",
    });
    expect(chrome.roomTypeLabelKey).toBe("nav_messenger_private_group");
    expect(chrome.forbidsGeneralDirectChrome).toBe(true);
    expect(chrome.showMemberCountSuffix).toBe(true);
    expect(chrome.memberCountForSuffix).toBe(6);
    expect(resolveDomainRoomHeaderSecondaryText(chrome.headerSecondary, t)).toBe("6");
  });
});
