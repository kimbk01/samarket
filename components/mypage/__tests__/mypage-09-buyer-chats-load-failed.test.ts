import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("MYPAGE-09 buyer inquiry fetch error ≠ empty chats", () => {
  it("sales fetch catch does not silently become empty rows for empty-hint", () => {
    const src = readFileSync(
      resolve(process.cwd(), "components/mypage/products/MyProductsView.tsx"),
      "utf8"
    );
    expect(src).toContain("salesLoadFailed");
    expect(src).toContain("salesOk");
    expect(src).not.toMatch(
      /fetchTradeHistorySalesBySession\(\)\s*\.catch\(\s*\(\)\s*=>\s*\[\]\s*\)/
    );
  });

  it("listing block distinguishes loadFailed from no-buyer-chats empty hint", () => {
    const block = readFileSync(
      resolve(process.cwd(), "components/mypage/seller/ListingBuyerChatsBlock.tsx"),
      "utf8"
    );
    expect(block).toContain("loadFailed");
    expect(block).toContain("marketplace_seller_listing_buyer_chats_load_failed");
    const failIdx = block.indexOf("loadFailed ?");
    const emptyIdx = block.indexOf("marketplace_seller_listing_no_buyer_chats");
    expect(failIdx).toBeGreaterThan(-1);
    expect(emptyIdx).toBeGreaterThan(failIdx);
  });

  it("card suppresses empty hint when buyer chats load failed", () => {
    const card = readFileSync(
      resolve(process.cwd(), "components/mypage/products/MyProductCard.tsx"),
      "utf8"
    );
    expect(card).toContain("buyerChatsLoadFailed");
    expect(card).toContain("showBuyerChatEmptyHint = isLiveForSale && !buyerChatsLoadFailed");
  });
});
