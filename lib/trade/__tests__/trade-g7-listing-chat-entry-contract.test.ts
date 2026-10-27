import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("G7 판매 상태·채팅 진입 계약", () => {
  const core = read("lib/trade/item-trade-chat-start-core.ts");

  it("TM-39: 기존 방 재사용이 예약 차단보다 먼저다", () => {
    const reuse = core.indexOf("buildJsonForExistingItemTradeRoom(sbAny, {");
    const reserveBlock = core.indexOf("shouldBlockNewItemChatForBuyer(row");
    expect(reuse).toBeGreaterThan(0);
    expect(reserveBlock).toBeGreaterThan(reuse);
  });

  it("TM-21: 판매완료 글의 새 방은 관리자 「판매 후 채팅 허용」 이 아니면 거부", () => {
    const soldBlock = core.indexOf('row.status === "sold"');
    expect(soldBlock).toBeGreaterThan(core.indexOf("buildJsonForExistingItemTradeRoom(sbAny, {"));
    expect(core).toContain("allowChatAfterSold !== true");
  });

  it("TM-17: seller-listing-state 는 completed 를 거부하고 seller-complete 로 보낸다", () => {
    const route = read("app/api/posts/[postId]/seller-listing-state/route.ts");
    expect(route).toContain('nextListing === "completed"');
    expect(route).toContain("completed_requires_seller_complete");
    expect(route.indexOf('nextListing === "completed"')).toBeLessThan(route.indexOf("canSellerListingTransition(prevListing"));
  });
});
