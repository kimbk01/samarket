/** 거래방 진입 감사 D5 — 서버가 거래방 역할을 보는 사람 기준으로 내려준다(PR 2). */
import { describe, expect, it } from "vitest";
import { resolveTradeContextMetaForViewer } from "@/lib/community-messenger/product-chat-messenger-meta";
import { messengerTradeViewerRoleFromContextMeta } from "@/lib/community-messenger/messenger-trade-viewer-role";
import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";

const SELLER = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const BUYER = "0c4b0a80-9755-4ebe-9a10-f8e1ced4c0cc";
const IDENTITY = `trade:227dcf5b-9d88-4417-8f78-b9e721824ed3:${SELLER}:${BUYER}`;
/** 운영 거래방 저장값처럼 구매자 시점으로 저장된 summary */
const STORED: CommunityMessengerRoomContextMetaV1 = {
  v: 1,
  kind: "trade",
  headline: "팝니다 · Toyota Vios",
  productChatId: "f2259da3-66cf-4e78-990b-dd9236f222c2",
  roleLabel: "구매자",
};

describe("resolveTradeContextMetaForViewer", () => {
  it("판매자에게는 판매자, 구매자에게는 구매자", () => {
    expect(messengerTradeViewerRoleFromContextMeta(resolveTradeContextMetaForViewer(STORED, SELLER, IDENTITY))).toBe("seller");
    expect(messengerTradeViewerRoleFromContextMeta(resolveTradeContextMetaForViewer(STORED, BUYER, IDENTITY))).toBe("buyer");
  });
  it("다른 필드는 그대로", () => {
    const out = resolveTradeContextMetaForViewer(STORED, SELLER, IDENTITY);
    expect(out?.kind === "trade" && out.productChatId).toBe(STORED.productChatId);
    expect(out?.headline).toBe(STORED.headline);
  });
  it("정체성이 없거나 당사자가 아니면 저장값 그대로", () => {
    expect(resolveTradeContextMetaForViewer(STORED, SELLER, null)).toBe(STORED);
    expect(resolveTradeContextMetaForViewer(STORED, "someone-else", IDENTITY)).toBe(STORED);
    expect(resolveTradeContextMetaForViewer(STORED, SELLER, "general:x")).toBe(STORED);
  });
  it("거래방이 아니면 바꾸지 않는다", () => {
    expect(resolveTradeContextMetaForViewer(null, SELLER, IDENTITY)).toBeNull();
  });
});
