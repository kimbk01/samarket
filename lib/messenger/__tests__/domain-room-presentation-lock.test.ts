/**
 * Domain room presentation lock — single Read Authority for Canary timeline seed.
 */
import { describe, expect, it } from "vitest";
import type { DomainRoomPresentation } from "@/components/community-messenger/domain-shell-canary/DomainRoomReadCanaryContext";
import { composeDomainRoomHeaderChrome } from "@/lib/messenger/contracts/domain-room-header-chrome";
import {
  applyDomainRoomPresentationLock,
  isDomainRoomReadAuthority,
  parseDomainOrderIdFromIdentityKey,
} from "@/components/community-messenger/domain-shell-canary/apply-domain-room-presentation-lock";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

function baseSnapshot(overrides?: {
  roomId?: string;
  chatDomain?: CommunityMessengerRoomSnapshot["room"]["chatDomain"];
  domainIdentityKey?: string;
  title?: string;
  contextMeta?: CommunityMessengerRoomSnapshot["room"]["contextMeta"];
  messages?: CommunityMessengerRoomSnapshot["messages"];
}): CommunityMessengerRoomSnapshot {
  const roomId = overrides?.roomId ?? "room-1";
  return {
    viewerUserId: "viewer-1",
    room: {
      id: roomId,
      chatDomain: overrides?.chatDomain ?? "general_direct",
      domainIdentityKey: overrides?.domainIdentityKey ?? "general_direct:a:b",
      roomType: "direct",
      roomStatus: "active",
      visibility: "private",
      joinPolicy: "invite_only",
      identityPolicy: "real_name",
      isReadonly: false,
      title: overrides?.title ?? "Legacy Title",
      subtitle: "",
      summary: "",
      avatarUrl: null,
      unreadCount: 0,
      lastMessage: "",
      lastMessageAt: "",
      memberCount: 2,
      ownerUserId: null,
      ownerLabel: "",
      memberLimit: null,
      isDiscoverable: false,
      requiresPassword: false,
      allowMemberInvite: false,
      contextMeta: overrides?.contextMeta ?? null,
      messengerDirectKey: "store_order:order-leg",
    },
    members: [],
    messages: overrides?.messages ?? [
      {
        id: "m1",
        roomId,
        senderId: "viewer-1",
        senderLabel: "Me",
        messageType: "text",
        content: "keep-me",
        createdAt: "2026-01-01T00:00:00.000Z",
        isMine: true,
      },
    ],
    myRole: "member",
    activeCall: null,
  };
}

describe("applyDomainRoomPresentationLock", () => {
  it("locks chatDomain/identity — Room Header is counterparty, product seeds contextMeta", () => {
    const presentation: DomainRoomPresentation = {
      authority: "domain_room_presentation_canary",
      roomId: "room-1",
      chatDomain: "trade",
      domainIdentityKey: "trade:item-1:seller-1:buyer-1",
      header: {
        kind: "trade",
        title: "Buyer Peer",
        avatarUrl: "https://cdn.example/peer.jpg",
        peerLabel: "Buyer Peer",
        productTitle: "Domain Product",
        productImageUrl: "https://cdn.example/p.jpg",
        itemId: "item-1",
        productChatId: "pc-real-1",
        chatDomain: "trade",
        domainIdentityKey: "trade:item-1:seller-1:buyer-1",
      },
      chrome: composeDomainRoomHeaderChrome({
        kind: "trade",
        peerLabel: "Buyer Peer",
        productTitle: "Domain Product",
      }),
    };
    const snap = baseSnapshot({
      contextMeta: { v: 1, kind: "delivery", storeOrderId: "wrong-order" },
    });
    const locked = applyDomainRoomPresentationLock(snap, presentation);
    expect(locked.room.chatDomain).toBe("trade");
    expect(locked.room.domainIdentityKey).toBe("trade:item-1:seller-1:buyer-1");
    expect(locked.room.title).toBe("Buyer Peer");
    expect(locked.room.avatarUrl).toBe("https://cdn.example/peer.jpg");
    expect(locked.room.contextMeta?.kind).toBe("trade");
    expect(locked.room.contextMeta?.postId).toBe("item-1");
    expect(locked.room.contextMeta?.productChatId).toBe("pc-real-1");
    expect(locked.room.contextMeta?.productChatId).not.toBe("item-1");
    expect(locked.room.contextMeta?.headline).toBe("Domain Product");
    expect(locked.room.contextMeta?.thumbnailUrl).toBe("https://cdn.example/p.jpg");
    expect(locked.room.contextMeta?.sellerId).toBe("seller-1");
    expect(locked.room.contextMeta?.buyerId).toBe("buyer-1");
    expect(locked.messages).toHaveLength(1);
    expect(locked.messages[0]?.content).toBe("keep-me");
    expect(locked.messages).toBe(snap.messages);
  });

  it("does not seed productChatId from posts.id when product_chats id is missing", () => {
    const presentation: DomainRoomPresentation = {
      authority: "domain_room_presentation_canary",
      roomId: "room-1",
      chatDomain: "trade",
      domainIdentityKey: "trade:item-1:seller-1:buyer-1",
      header: {
        kind: "trade",
        title: "Buyer Peer",
        avatarUrl: "https://cdn.example/peer.jpg",
        peerLabel: "Buyer Peer",
        productTitle: "Domain Product",
        productImageUrl: "https://cdn.example/p.jpg",
        itemId: "item-1",
        productChatId: null,
        chatDomain: "trade",
        domainIdentityKey: "trade:item-1:seller-1:buyer-1",
      },
      chrome: composeDomainRoomHeaderChrome({
        kind: "trade",
        peerLabel: "Buyer Peer",
        productTitle: "Domain Product",
      }),
    };
    const snap = baseSnapshot({
      contextMeta: { v: 1, kind: "trade", productChatId: "item-1", postId: "item-1" },
    });
    const locked = applyDomainRoomPresentationLock(snap, presentation);
    expect(locked.room.contextMeta?.postId).toBe("item-1");
    expect(locked.room.contextMeta?.productChatId).toBeUndefined();
    expect(locked.room.contextMeta?.headline).toBe("Domain Product");
  });

  it("promotes Legacy direct roomType to private_group for Domain group", () => {
    const presentation: DomainRoomPresentation = {
      authority: "domain_room_presentation_canary",
      roomId: "room-1",
      chatDomain: "group",
      domainIdentityKey: "group:g1",
      header: {
        kind: "group",
        title: "Study Group",
        avatarUrl: null,
        memberCount: 5,
        chatDomain: "group",
        domainIdentityKey: "group:g1",
      },
      chrome: composeDomainRoomHeaderChrome({ kind: "group", memberCount: 5 }),
    };
    const locked = applyDomainRoomPresentationLock(
      baseSnapshot({ chatDomain: "general_direct", domainIdentityKey: "general_direct:a:b" }),
      presentation
    );
    expect(locked.room.chatDomain).toBe("group");
    expect(locked.room.roomType).toBe("private_group");
    expect(locked.room.memberCount).toBe(5);
    expect(locked.room.contextMeta).toBeNull();
    expect(locked.room.title).toBe("Study Group");
    expect(locked.room.messengerDirectKey).toBeNull();
  });

  it("clears delivery reinference for general_direct", () => {
    const presentation: DomainRoomPresentation = {
      authority: "domain_room_presentation_canary",
      roomId: "room-1",
      chatDomain: "general_direct",
      domainIdentityKey: "general_direct:user-a:user-b",
      header: {
        kind: "general_peer",
        title: "Friend",
        avatarUrl: null,
        chatDomain: "general_direct",
        domainIdentityKey: "general_direct:user-a:user-b",
      },
      chrome: composeDomainRoomHeaderChrome({ kind: "general_peer" }),
    };
    const snap = baseSnapshot({
      contextMeta: { v: 1, kind: "delivery", storeOrderId: "ord-x" },
      chatDomain: "store_order",
      domainIdentityKey: "store_order:ord-x",
    });
    const locked = applyDomainRoomPresentationLock(snap, presentation);
    expect(locked.room.chatDomain).toBe("general_direct");
    expect(locked.room.contextMeta).toBeNull();
    expect(locked.room.title).toBe("Friend");
  });

  it("store_order sets order context from identity", () => {
    const presentation: DomainRoomPresentation = {
      authority: "domain_room_presentation_canary",
      roomId: "room-1",
      chatDomain: "store_order",
      domainIdentityKey: "store_order:order-99",
      header: {
        kind: "buyer_store",
        title: "Cafe Store",
        avatarUrl: null,
        orderId: "order-99",
        orderStatusLabel: null,
        chatDomain: "store_order",
        domainIdentityKey: "store_order:order-99",
      },
      chrome: composeDomainRoomHeaderChrome({ kind: "buyer_store", orderId: "order-99" }),
    };
    const snap = baseSnapshot({
      contextMeta: { v: 1, kind: "trade", postId: "item" },
    });
    const locked = applyDomainRoomPresentationLock(snap, presentation);
    expect(locked.room.chatDomain).toBe("store_order");
    expect(locked.room.contextMeta?.kind).toBe("delivery");
    expect(locked.room.contextMeta?.storeOrderId).toBe("order-99");
    expect(locked.room.contextMeta?.storeDisplayName).toBe("Cafe Store");
  });

  it("mismatch roomId throws", () => {
    const presentation: DomainRoomPresentation = {
      authority: "domain_room_presentation_canary",
      roomId: "other-room",
      chatDomain: "trade",
      domainIdentityKey: "trade:i:s:b",
      header: {
        kind: "trade",
        title: "X",
        avatarUrl: null,
        peerLabel: "X",
        productTitle: "P",
        productImageUrl: null,
        itemId: "i",
        productChatId: null,
        chatDomain: "trade",
        domainIdentityKey: "trade:i:s:b",
      },
      chrome: composeDomainRoomHeaderChrome({
        kind: "trade",
        peerLabel: "X",
        productTitle: "P",
      }),
    };
    expect(() => applyDomainRoomPresentationLock(baseSnapshot(), presentation)).toThrow(
      /dibay_domain_room_presentation_room_id_mismatch/
    );
  });
});

describe("parseDomainOrderIdFromIdentityKey / isDomainRoomReadAuthority", () => {
  it("parses store_order identity", () => {
    expect(parseDomainOrderIdFromIdentityKey("store_order:abc")).toBe("abc");
    expect(parseDomainOrderIdFromIdentityKey("trade:a:b:c")).toBeNull();
    expect(parseDomainOrderIdFromIdentityKey("store_order:")).toBeNull();
  });

  it("matches room authority", () => {
    const p: DomainRoomPresentation = {
      authority: "domain_room_presentation_canary",
      roomId: "r1",
      chatDomain: "trade",
      domainIdentityKey: "trade:i:s:b",
      header: {
        kind: "trade",
        title: "T",
        avatarUrl: null,
        peerLabel: "T",
        productTitle: "Prod",
        productImageUrl: null,
        itemId: "i",
        productChatId: null,
        chatDomain: "trade",
        domainIdentityKey: "trade:i:s:b",
      },
      chrome: composeDomainRoomHeaderChrome({
        kind: "trade",
        peerLabel: "T",
        productTitle: "Prod",
      }),
    };
    expect(isDomainRoomReadAuthority(p, "r1")).toBe(true);
    expect(isDomainRoomReadAuthority(p, "r2")).toBe(false);
    expect(isDomainRoomReadAuthority(null, "r1")).toBe(false);
  });
});
