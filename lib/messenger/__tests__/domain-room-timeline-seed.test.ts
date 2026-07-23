/**
 * Domain timeline seed — lock-before-assert contract (Identity Authority).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { composeDomainRoomHeaderChrome } from "@/lib/messenger/contracts/domain-room-header-chrome";
import type { DomainRoomPresentation } from "@/components/community-messenger/domain-shell-canary/DomainRoomReadCanaryContext";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

const fetchBootstrap = vi.fn();
const prepareStoreOrder = vi.fn();

vi.mock("@/lib/community-messenger/room/fetch-community-messenger-room-bootstrap-client", () => ({
  fetchCommunityMessengerRoomBootstrapClient: (...args: unknown[]) => fetchBootstrap(...args),
}));

vi.mock("@/lib/store-order-chat/store-order-messenger-room-entry-client", () => ({
  prepareStoreOrderMessengerRoomEntryByRoomId: (...args: unknown[]) => prepareStoreOrder(...args),
}));

function snap(overrides?: Partial<CommunityMessengerRoomSnapshot["room"]>): CommunityMessengerRoomSnapshot {
  return {
    viewerUserId: "viewer-1",
    room: {
      id: "room-1",
      chatDomain: "general_direct",
      domainIdentityKey: "general_direct:wrong",
      roomType: "direct",
      roomStatus: "active",
      visibility: "private",
      joinPolicy: "invite_only",
      identityPolicy: "real_name",
      isReadonly: false,
      title: "Legacy",
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
      contextMeta: { v: 1, kind: "delivery", storeOrderId: "leaked" },
      messengerDirectKey: "store_order:leaked",
      ...overrides,
    },
    members: [],
    messages: [
      {
        id: "m1",
        roomId: "room-1",
        senderId: "viewer-1",
        senderLabel: "Me",
        messageType: "text",
        content: "hi",
        createdAt: "2026-01-01T00:00:00.000Z",
        isMine: true,
      },
    ],
    myRole: "member",
    activeCall: null,
  };
}

describe("loadDomainRoomTimelineSeed", () => {
  beforeEach(() => {
    fetchBootstrap.mockReset();
    prepareStoreOrder.mockReset();
  });

  it("locks Legacy seed to Domain trade identity before assert (wrong Legacy domain OK)", async () => {
    const { loadDomainRoomTimelineSeed } = await import(
      "@/components/community-messenger/domain-shell-canary/load-domain-room-timeline-seed"
    );
    fetchBootstrap.mockResolvedValue(
      snap({
        chatDomain: undefined,
        domainIdentityKey: undefined,
        contextMeta: { v: 1, kind: "delivery", storeOrderId: "x" },
      })
    );
    const presentation: DomainRoomPresentation = {
      authority: "domain_room_presentation_canary",
      roomId: "room-1",
      chatDomain: "trade",
      domainIdentityKey: "trade:item-1:seller-1:buyer-1",
      header: {
        kind: "trade",
        title: "Peer",
        avatarUrl: "https://cdn.example/peer.jpg",
        peerLabel: "Peer",
        productTitle: "Product",
        productImageUrl: "https://cdn.example/item.jpg",
        itemId: "item-1",
        productChatId: "pc-1",
        chatDomain: "trade",
        domainIdentityKey: "trade:item-1:seller-1:buyer-1",
      },
      chrome: composeDomainRoomHeaderChrome({
        kind: "trade",
        peerLabel: "Peer",
        productTitle: "Product",
      }),
    };
    const result = await loadDomainRoomTimelineSeed({
      roomId: "room-1",
      presentation,
      expected: {
        domain: "trade",
        identityKey: "trade:item-1:seller-1:buyer-1",
      },
      viewerUserId: "viewer-1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.room.chatDomain).toBe("trade");
    expect(result.snapshot.room.domainIdentityKey).toBe("trade:item-1:seller-1:buyer-1");
    expect(result.snapshot.room.title).toBe("Peer");
    expect(result.snapshot.room.contextMeta?.kind).toBe("trade");
    expect(result.snapshot.room.contextMeta?.headline).toBe("Product");
    expect(result.snapshot.room.contextMeta?.productChatId).toBe("pc-1");
    expect(result.snapshot.room.contextMeta?.postId).toBe("item-1");
    expect(result.snapshot.messages).toHaveLength(1);
    expect(prepareStoreOrder).not.toHaveBeenCalled();
  });

  it("uses Domain delivery meta for store_order ensure path", async () => {
    const { loadDomainRoomTimelineSeed } = await import(
      "@/components/community-messenger/domain-shell-canary/load-domain-room-timeline-seed"
    );
    prepareStoreOrder.mockResolvedValue({
      ok: true,
      roomId: "room-1",
      snapshot: snap({
        chatDomain: "store_order",
        domainIdentityKey: "store_order:order-1",
        contextMeta: { v: 1, kind: "delivery", storeOrderId: "order-1" },
      }),
    });
    const presentation: DomainRoomPresentation = {
      authority: "domain_room_presentation_canary",
      roomId: "room-1",
      chatDomain: "store_order",
      domainIdentityKey: "store_order:order-1",
      header: {
        kind: "buyer_store",
        title: "Cafe",
        avatarUrl: null,
        orderId: "order-1",
        orderStatusLabel: null,
        chatDomain: "store_order",
        domainIdentityKey: "store_order:order-1",
      },
      chrome: composeDomainRoomHeaderChrome({ kind: "buyer_store", orderId: "order-1" }),
    };
    const result = await loadDomainRoomTimelineSeed({
      roomId: "room-1",
      presentation,
      expected: { domain: "store_order", identityKey: "store_order:order-1" },
    });
    expect(result.ok).toBe(true);
    expect(prepareStoreOrder).toHaveBeenCalledWith(
      "room-1",
      expect.objectContaining({
        instantContextMeta: expect.objectContaining({
          kind: "delivery",
          storeOrderId: "order-1",
        }),
      })
    );
    if (!result.ok) return;
    expect(result.snapshot.room.title).toBe("Cafe");
  });
});
