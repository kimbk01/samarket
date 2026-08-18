import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";
import { resolveMessengerRoomPhase2DomainChrome } from "@/components/community-messenger/room/phase2/resolve-messenger-room-phase2-domain-chrome";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate("ko", key, vars);

function directRoom(
  extra: Partial<CommunityMessengerRoomSummary> = {}
): CommunityMessengerRoomSummary {
  return {
    id: "room-1",
    roomType: "direct",
    title: "상대방",
    avatarUrl: null,
    memberCount: 2,
    messengerDirectKey: "u1:u2",
    chatDomain: "general_direct",
    contextMeta: null,
    ...extra,
  } as CommunityMessengerRoomSummary;
}

describe("resolveMessengerRoomPhase2DomainChrome", () => {
  it("general direct keeps 1:1 label and member suffix", () => {
    const out = resolveMessengerRoomPhase2DomainChrome({
      room: directRoom(),
      viewerUserId: "u1",
      t,
    });
    expect(out.roomTypeLabel).toBe(translate("ko", "nav_messenger_direct_room"));
    expect(out.showTimelineMemberCountSuffix).toBe(true);
    expect(out.timelineMemberCount).toBe(2);
    expect(out.chrome.forbidsGeneralDirectChrome).toBe(false);
  });

  it("trade forbids general chrome and member suffix", () => {
    const out = resolveMessengerRoomPhase2DomainChrome({
      room: directRoom({
        chatDomain: "trade",
        messengerDirectKey: "trade_pc:pc1",
        contextMeta: { v: 1, kind: "trade", headline: "맥북", productChatId: "pc1" },
      }),
      viewerUserId: "u1",
      t,
    });
    expect(out.roomTypeLabel).toBe(translate("ko", "nav_trade_chat_label"));
    expect(out.showTimelineMemberCountSuffix).toBe(false);
    expect(out.headerPrimaryText).toBe("맥북");
    expect(out.headerSecondaryText).toBe("상대방");
    expect(out.chrome.profileKind).toBe("listing");
    expect(out.chrome.forbidsGeneralDirectChrome).toBe(true);
  });

  it("store order customer uses order chat label without member suffix", () => {
    const out = resolveMessengerRoomPhase2DomainChrome({
      room: directRoom({
        chatDomain: "store_order",
        messengerDirectKey: "store_order:o1",
        contextMeta: {
          v: 1,
          kind: "delivery",
          storeOrderId: "o1",
          storeId: "s1",
          storeDisplayName: "테스트 매장",
        },
      }),
      viewerUserId: "u1",
      myRole: "member",
      storeOrderId: "o1",
      t,
    });
    expect(out.roomTypeLabel).toBe(translate("ko", "nav_chat_order"));
    expect(out.showTimelineMemberCountSuffix).toBe(false);
    expect(out.chrome.forbidsGeneralDirectChrome).toBe(true);
  });

  it("commerce trade key keeps trade chrome even if chatDomain is general_direct", () => {
    const out = resolveMessengerRoomPhase2DomainChrome({
      room: directRoom({
        chatDomain: "general_direct",
        messengerDirectKey: "trade_pc:pc1",
        contextMeta: { v: 1, kind: "trade", headline: "자전거 팝니다", productChatId: "pc1" },
      }),
      viewerUserId: "u1",
      t,
    });
    expect(out.roomTypeLabel).toBe(translate("ko", "nav_trade_chat_label"));
    expect(out.showTimelineMemberCountSuffix).toBe(false);
    expect(out.headerPrimaryText).toBe("자전거 팝니다");
    expect(out.headerSecondaryText).toBe("상대방");
    expect(out.chrome.profileKind).toBe("listing");
    expect(out.chrome.forbidsGeneralDirectChrome).toBe(true);
  });

  it("pair-key friend DM stays general even with leftover trade contextMeta", () => {
    const out = resolveMessengerRoomPhase2DomainChrome({
      room: directRoom({
        chatDomain: "general_direct",
        messengerDirectKey: "u1:u2",
        contextMeta: { v: 1, kind: "trade", headline: "자전거 팝니다", productChatId: "pc1" },
      }),
      viewerUserId: "u1",
      t,
    });
    expect(out.roomTypeLabel).toBe(translate("ko", "nav_messenger_direct_room"));
    expect(out.showTimelineMemberCountSuffix).toBe(true);
    expect(out.chrome.forbidsGeneralDirectChrome).toBe(false);
  });

  it("commerce store-order key keeps order chrome even if chatDomain is general_direct", () => {
    const out = resolveMessengerRoomPhase2DomainChrome({
      room: directRoom({
        chatDomain: "general_direct",
        messengerDirectKey: "store_order:o1",
        contextMeta: {
          v: 1,
          kind: "delivery",
          storeOrderId: "o1",
          storeId: "s1",
          storeDisplayName: "MARKET MARKET",
        },
      }),
      viewerUserId: "u1",
      myRole: "member",
      storeOrderId: "o1",
      t,
    });
    expect(out.roomTypeLabel).toBe(translate("ko", "nav_chat_order"));
    expect(out.showTimelineMemberCountSuffix).toBe(false);
    expect(out.chrome.forbidsGeneralDirectChrome).toBe(true);
  });

  it("R4 quarantine pair-key trade room never falls back to general 1:1 chrome", () => {
    const out = resolveMessengerRoomPhase2DomainChrome({
      room: directRoom({
        id: "661e27ad-7c8c-4d9d-a16d-ccab83bc1507",
        chatDomain: "general_direct",
        messengerDirectKey: "u1:u2",
        peerUserId: "u2",
        contextMeta: { v: 1, kind: "trade", headline: "다물품 묶음" },
      }),
      viewerUserId: "u1",
      t,
    });
    expect(out.roomTypeLabel).toBe(translate("ko", "nav_trade_chat_label"));
    expect(out.showTimelineMemberCountSuffix).toBe(false);
    expect(out.chrome.profileKind).toBe("listing");
    expect(out.chrome.forbidsGeneralDirectChrome).toBe(true);
    expect(out.headerPrimaryText).toBe("다물품 묶음");
  });

  it("chatDomain trade with pair key stays trade chrome without merging to friend DM", () => {
    const out = resolveMessengerRoomPhase2DomainChrome({
      room: directRoom({
        id: "30f97067-27f6-4bfa-8dfb-27f4f4f6ca13",
        chatDomain: "trade",
        messengerDirectKey: "u1:u2",
        peerUserId: "u2",
        contextMeta: { v: 1, kind: "trade", headline: "헬멧" },
      }),
      viewerUserId: "u1",
      t,
    });
    expect(out.roomTypeLabel).toBe(translate("ko", "nav_trade_chat_label"));
    expect(out.headerPrimaryText).toBe("헬멧");
    expect(out.headerSecondaryText).toBe("상대방");
    expect(out.showTimelineMemberCountSuffix).toBe(false);
  });

  it("private group keeps member suffix via group chrome", () => {
    const out = resolveMessengerRoomPhase2DomainChrome({
      room: {
        ...directRoom(),
        roomType: "private_group",
        memberCount: 5,
        chatDomain: "group",
      } as CommunityMessengerRoomSummary,
      viewerUserId: "u1",
      t,
    });
    expect(out.roomTypeLabel).toBe(translate("ko", "nav_messenger_private_group"));
    expect(out.showTimelineMemberCountSuffix).toBe(true);
    expect(out.timelineMemberCount).toBe(5);
  });
});
