import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveTradeRoomListingUnavailable } from "@/lib/community-messenger/room/phase2/use-trade-room-listing-unavailable";
import { patchTradeRoomSummaryItemStateLabel } from "@/lib/trade/listing-visibility/listing-visibility-room-sync";
import { getChatListingItemStateLabel } from "@/lib/products/seller-listing-state";

/** 2차 실기 D1·D2 설계 G1~G3 (docs/audit/trade-chat-card-after-delete-design-2026-11-04.md · Owner 「설계안 승인」 2026-11-04) */
const src = (p: string) => readFileSync(p, "utf8");
const detail = (status: string, sellerId = "seller") =>
  ({ sellerId, product: { status } }) as unknown as Parameters<typeof resolveTradeRoomListingUnavailable>[0]["detail"];

describe("G1 거래방 「볼 수 없는 글」 판정 1곳", () => {
  it("상세 글 상태가 숨김·삭제면 구매자에게 true · 판매자 본인은 false", () => {
    expect(resolveTradeRoomListingUnavailable({ detail: detail("hidden"), viewerUserId: "buyer", summaryItemStateLabel: "판매중", removedByBroadcast: false })).toBe(true);
    expect(resolveTradeRoomListingUnavailable({ detail: detail("deleted"), viewerUserId: "buyer", summaryItemStateLabel: null, removedByBroadcast: false })).toBe(true);
    expect(resolveTradeRoomListingUnavailable({ detail: detail("hidden"), viewerUserId: "seller", summaryItemStateLabel: "숨김", removedByBroadcast: true })).toBe(false);
  });
  it("방 정보 문구(숨김·삭제됨)·방송만으로도 true · 공개 글은 false", () => {
    expect(resolveTradeRoomListingUnavailable({ detail: detail("active"), viewerUserId: "buyer", summaryItemStateLabel: "삭제됨", removedByBroadcast: false })).toBe(true);
    expect(resolveTradeRoomListingUnavailable({ detail: detail("active"), viewerUserId: "buyer", summaryItemStateLabel: "판매중", removedByBroadcast: true })).toBe(true);
    expect(resolveTradeRoomListingUnavailable({ detail: detail("active"), viewerUserId: "buyer", summaryItemStateLabel: "판매중", removedByBroadcast: false })).toBe(false);
    expect(resolveTradeRoomListingUnavailable({ detail: detail("sold"), viewerUserId: "buyer", summaryItemStateLabel: "판매완료", removedByBroadcast: false })).toBe(false);
  });
  it("상세가 아직 없으면 보류(판매자 여부 모름)", () => {
    expect(resolveTradeRoomListingUnavailable({ detail: null, viewerUserId: "buyer", summaryItemStateLabel: "숨김", removedByBroadcast: true })).toBe(false);
  });
  it("방 머리·첫 안내 카드·⋮ 가 같은 훅을 쓴다 · ⋮ 의 따로 판정은 없다", () => {
    const pres = src("lib/community-messenger/room/phase2/use-messenger-room-phase2-room-presentation.ts");
    expect(pres).toContain("useTradeRoomListingUnavailable({");
    expect(pres).toContain('const unavailableTitle = t("trade_unavailable_title");');
    expect(pres).toMatch(/imageUrl: null,\s*peerLabel,\s*headerTitle: formatTradeMarketplacePeerProductTitle\(peerLabel, unavailableTitle\),\s*postId: null,/);
    const dot = src("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2OneToOneDotMenu.tsx");
    expect(dot).toContain("useTradeRoomListingUnavailable({");
    expect(dot).toContain("product: { ...built.product, unavailable: tradeListingUnavailable }");
    expect(dot).not.toContain("isUnavailableItemStateLabel");
    const menu = src("components/community-messenger/room/phase2/ChatRoomMoreMenu.tsx");
    expect(menu).toContain('roomType === "trade" && tradeContext?.product.unavailable ? (');
    expect(menu).not.toContain("useTradeListingRemoved");
    /** 방 머리를 눌러도 글 창은 postId 가 있을 때만 */
    expect(src("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx")).toContain(
      "if (listingHeader.postId && tradePostDetailSlide) openListingDetailSlide();"
    );
  });
});

describe("G2 글 노출이 바뀌면 거래방 정보의 글 상태 문구만 맞춘다", () => {
  const raw = JSON.stringify({ v: 1, kind: "trade", headline: "자전거", postId: "p1", priceLabel: "₱1", itemStateLabel: "판매중", roleLabel: "구매자" });
  it("문구만 바뀌고 다른 칸은 그대로 · 다른 글·같은 값·깨진 JSON 은 건드리지 않는다", () => {
    const next = patchTradeRoomSummaryItemStateLabel(raw, "p1", "숨김");
    expect(next).not.toBeNull();
    expect(JSON.parse(next!)).toEqual({ ...JSON.parse(raw), itemStateLabel: "숨김" });
    expect(patchTradeRoomSummaryItemStateLabel(raw, "p2", "숨김")).toBeNull();
    expect(patchTradeRoomSummaryItemStateLabel(raw, "p1", "판매중")).toBeNull();
    expect(patchTradeRoomSummaryItemStateLabel("not json", "p1", "숨김")).toBeNull();
  });
  it("문구 = 채팅 목록과 같은 함수(숨김·삭제됨·판매 단계)", () => {
    expect(getChatListingItemStateLabel("inquiry", "hidden")).toBe("숨김");
    expect(getChatListingItemStateLabel("inquiry", "deleted")).toBe("삭제됨");
  });
  it("방송 1곳에서 같이 부른다(관리자 조치 2곳·신고 숨김·판매자 숨김/다시 보이기·판매자 삭제가 모두 지나는 곳) · 실패해도 조치는 그대로", () => {
    const server = src("lib/trade/listing-visibility/listing-visibility-server.ts");
    expect(server).toContain("const res = await syncTradeRoomItemStateLabels(id);");
    expect(server).toMatch(/try \{\s*const res = await syncTradeRoomItemStateLabels\(id\);[\s\S]*?\} catch/);
    const sync = src("lib/trade/listing-visibility/listing-visibility-room-sync.ts");
    expect(sync).toContain('import "server-only"');
    expect(sync).toContain('.update({ summary: w.summary })');
    expect(sync).not.toMatch(/updated_at\s*:/);
  });
});

describe("G3 거래 채팅 목록 「볼 수 없는 글」 줄은 가격을 되살리지 않는다", () => {
  it("미리보기 훅에 글 id 를 넘기지 않는다", () => {
    expect(src("components/community-messenger/MessengerChatListItem.tsx")).toContain(
      "postId: tradeRowModel?.productUnavailable ? null : tradeRowModel?.postId,"
    );
  });
});
