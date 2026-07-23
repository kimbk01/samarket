/**
 * Domain presentation — Trade peer avatar / listing dock / Group avatar contracts.
 */
import { describe, expect, it } from "vitest";
import { buildTradeHeaderModel } from "@/lib/messenger/trade/header";
import { buildTradeIdentity } from "@/lib/messenger/trade/identity";
import { buildGroupHeaderModel } from "@/lib/messenger/group/header";
import { resolveGroupPresentation } from "@/lib/messenger/group/presentation";
import { GROUP_DOMAIN, GROUP_IMAGE_PLACEHOLDER_MARKER } from "@/lib/messenger/group/types";
import { resolveGroupDomainImageSrc } from "@/components/community-messenger/domain-shell-canary/GroupDomainAvatar";
import { applyDomainRoomPresentationLock } from "@/components/community-messenger/domain-shell-canary/apply-domain-room-presentation-lock";
import type { DomainRoomPresentation } from "@/components/community-messenger/domain-shell-canary/DomainRoomReadCanaryContext";
import { composeDomainRoomHeaderChrome } from "@/lib/messenger/contracts/domain-room-header-chrome";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import type { TradeListItem } from "@/lib/messenger/trade/types";
import type { GroupListItem } from "@/lib/messenger/group/types";
import { hasCustomUserAvatar, resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";

const SELLER = "seller-u";
const BUYER = "buyer-u";
const GOOGLE_AVATAR = "https://lh3.googleusercontent.com/a/peer-photo";

function tradeItem(partial: Partial<TradeListItem> & { itemId: string }): TradeListItem {
  const id = buildTradeIdentity({
    itemId: partial.itemId,
    sellerUserId: partial.sellerUserId ?? SELLER,
    counterpartyUserId: partial.counterpartyUserId ?? BUYER,
  });
  return {
    roomId: partial.roomId ?? `room-${partial.itemId}`,
    chatDomain: "trade",
    domainIdentityKey: id.identityKey,
    itemId: partial.itemId,
    sellerUserId: partial.sellerUserId ?? SELLER,
    counterpartyUserId: partial.counterpartyUserId ?? BUYER,
    itemTitle: partial.itemTitle ?? "상품A",
    itemImageUrl: partial.itemImageUrl ?? "https://cdn.example/listing.jpg",
    peerDisplayName: partial.peerDisplayName ?? "Peer",
    peerAvatarUrl: partial.peerAvatarUrl === undefined ? GOOGLE_AVATAR : partial.peerAvatarUrl,
    productChatId: partial.productChatId === undefined ? "pc-1" : partial.productChatId,
    lastMessage: "hi",
    lastMessageAt: "2026-07-14T00:00:00.000Z",
    unreadCount: 0,
    tradeStatusLabel: null,
    updatedAt: "2026-07-14T00:00:00.000Z",
    generation: "1",
  };
}

function groupItem(partial: Partial<GroupListItem> = {}): GroupListItem {
  return {
    roomId: partial.roomId ?? "g-room",
    chatDomain: GROUP_DOMAIN,
    domainIdentityKey: partial.domainIdentityKey ?? "group:g1",
    groupId: partial.groupId ?? "g1",
    groupSubtype: partial.groupSubtype ?? "private_group",
    groupName: partial.groupName ?? "우리 모임",
    groupImageUrl: partial.groupImageUrl === undefined ? null : partial.groupImageUrl,
    memberCount: partial.memberCount ?? 4,
    lastMessage: "hi",
    lastMessageAt: "2026-07-14T00:00:00.000Z",
    unreadCount: 0,
    updatedAt: "2026-07-14T00:00:00.000Z",
    generation: "1",
  };
}

function emptySnap(): CommunityMessengerRoomSnapshot {
  return {
    room: {
      id: "room-1",
      title: "legacy",
      avatarUrl: null,
      roomType: "direct",
      memberCount: 2,
      summary: null,
      contextMeta: null,
      messengerDirectKey: null,
      chatDomain: null,
      domainIdentityKey: null,
    },
    messages: [],
    viewerUserId: BUYER,
    myRole: "member",
  } as unknown as CommunityMessengerRoomSnapshot;
}

describe("trade room peer avatar presentation", () => {
  it("buyer sees seller peer avatar URL (Google/CDN passes resolveUserAvatarImageSrc)", () => {
    const item = tradeItem({
      itemId: "i1",
      peerDisplayName: "Seller",
      peerAvatarUrl: GOOGLE_AVATAR,
      itemImageUrl: "https://cdn.example/product.jpg",
    });
    const header = buildTradeHeaderModel(item, { viewerUserId: BUYER });
    expect(header.peerAvatarUrl).toBe(GOOGLE_AVATAR);
    expect(resolveUserAvatarImageSrc(header.peerAvatarUrl)).toBe(GOOGLE_AVATAR);
    expect(hasCustomUserAvatar(header.peerAvatarUrl)).toBe(true);
    expect(header.peerAvatarUrl).not.toBe(header.productImageUrl);
  });

  it("seller sees buyer peer avatar — not viewer self image", () => {
    const viewerSelf = "https://cdn.example/self.jpg";
    const peer = "https://cdn.example/buyer.jpg";
    const item = tradeItem({
      itemId: "i1",
      peerDisplayName: "Buyer",
      peerAvatarUrl: peer,
    });
    const header = buildTradeHeaderModel(item, { viewerUserId: SELLER });
    expect(header.peerAvatarUrl).toBe(peer);
    expect(header.peerAvatarUrl).not.toBe(viewerSelf);
  });

  it("peer image missing → null src for domain-only placeholder path", () => {
    const item = tradeItem({ itemId: "i1", peerAvatarUrl: null });
    const header = buildTradeHeaderModel(item, { viewerUserId: BUYER });
    expect(header.peerAvatarUrl).toBeNull();
    expect(resolveUserAvatarImageSrc(header.peerAvatarUrl)).toBeNull();
  });
});

describe("trade product dock contextMeta", () => {
  it("seeds real productChatId + listing fields into ready dock meta", () => {
    const presentation: DomainRoomPresentation = {
      authority: "domain_room_presentation_canary",
      roomId: "room-1",
      chatDomain: "trade",
      domainIdentityKey: "trade:item-a:seller-u:buyer-u",
      header: {
        kind: "trade",
        title: "Peer",
        avatarUrl: GOOGLE_AVATAR,
        peerLabel: "Peer",
        productTitle: "Kelvinator",
        productImageUrl: "https://cdn.example/k.jpg",
        itemId: "item-a",
        productChatId: "pc-real",
        chatDomain: "trade",
        domainIdentityKey: "trade:item-a:seller-u:buyer-u",
      },
      chrome: composeDomainRoomHeaderChrome({
        kind: "trade",
        peerLabel: "Peer",
        productTitle: "Kelvinator",
      }),
    };
    const locked = applyDomainRoomPresentationLock(emptySnap(), presentation);
    expect(locked.room.contextMeta?.postId).toBe("item-a");
    expect(locked.room.contextMeta?.productChatId).toBe("pc-real");
    expect(locked.room.contextMeta?.headline).toBe("Kelvinator");
    expect(locked.room.contextMeta?.thumbnailUrl).toContain("k.jpg");
  });

  it("listing without product_chats → postId/headline ready, productChatId absent", () => {
    const presentation: DomainRoomPresentation = {
      authority: "domain_room_presentation_canary",
      roomId: "room-1",
      chatDomain: "trade",
      domainIdentityKey: "trade:item-a:seller-u:buyer-u",
      header: {
        kind: "trade",
        title: "Peer",
        avatarUrl: null,
        peerLabel: "Peer",
        productTitle: "Only Title",
        productImageUrl: null,
        itemId: "item-a",
        productChatId: null,
        chatDomain: "trade",
        domainIdentityKey: "trade:item-a:seller-u:buyer-u",
      },
      chrome: composeDomainRoomHeaderChrome({
        kind: "trade",
        peerLabel: "Peer",
        productTitle: "Only Title",
      }),
    };
    const locked = applyDomainRoomPresentationLock(
      {
        ...emptySnap(),
        room: {
          ...emptySnap().room,
          contextMeta: { v: 1, kind: "trade", productChatId: "item-a", postId: "item-a" },
        },
      } as CommunityMessengerRoomSnapshot,
      presentation
    );
    expect(locked.room.contextMeta?.postId).toBe("item-a");
    expect(locked.room.contextMeta?.productChatId).toBeUndefined();
    expect(locked.room.contextMeta?.headline).toBe("Only Title");
  });

  it("same peer different listing → distinct itemId and product context", () => {
    const a = tradeItem({ itemId: "item-a", productChatId: "pc-a", itemTitle: "A" });
    const b = tradeItem({ itemId: "item-b", productChatId: "pc-b", itemTitle: "B" });
    expect(a.domainIdentityKey).not.toBe(b.domainIdentityKey);
    expect(buildTradeHeaderModel(a).itemId).not.toBe(buildTradeHeaderModel(b).itemId);
    expect(buildTradeHeaderModel(a).productChatId).toBe("pc-a");
    expect(buildTradeHeaderModel(b).productChatId).toBe("pc-b");
  });
});

describe("group image / placeholder contract", () => {
  it("group image URL is used when present", () => {
    const item = groupItem({ groupImageUrl: "https://cdn.example/group.png" });
    const header = buildGroupHeaderModel(item);
    expect(header.groupImageUrl).toBe("https://cdn.example/group.png");
    expect(resolveGroupDomainImageSrc(header.groupImageUrl)).toContain("group.png");
  });

  it("missing group image → null src (group-only placeholder, not participant)", () => {
    const item = groupItem({ groupImageUrl: null });
    const header = buildGroupHeaderModel(item);
    expect(header.groupImageUrl).toBeNull();
    expect(resolveGroupDomainImageSrc(header.groupImageUrl)).toBeNull();
    expect(resolveGroupDomainImageSrc(GROUP_IMAGE_PLACEHOLDER_MARKER)).toBeNull();
  });

  it("rejects participant avatar fallback into group presentation", () => {
    expect(() =>
      resolveGroupPresentation({
        roomId: "g-room",
        chatDomain: GROUP_DOMAIN,
        domainIdentityKey: "group:g1",
        groupName: "모임",
        groupImageUrl: null,
        memberAvatarUrl: "https://cdn.example/member.jpg",
      })
    ).toThrow(/dibay_group_member_avatar/);
  });

  it("rejects OAuth personal avatar host as group image", () => {
    const item = groupItem({
      groupImageUrl: "https://lh3.googleusercontent.com/a/ACg8ocKl2fapoHLT46Jer=s96-c",
    });
    const header = buildGroupHeaderModel(item);
    expect(header.groupImageUrl).toBeNull();
    expect(resolveGroupDomainImageSrc(item.groupImageUrl)).toBeNull();
  });
});
