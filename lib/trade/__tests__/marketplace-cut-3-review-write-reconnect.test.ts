import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

describe("CUT 3 — submit-review sold buyer enforcement", () => {
  it("requires posts.sold_buyer_id to match session buyer", () => {
    const src = readRepoFile("app/api/trade/product-chat/[roomId]/submit-review/route.ts");
    expect(src).toContain('select("status, sold_buyer_id")');
    expect(src).toContain("sold_buyer_id");
    expect(src).toContain("확정된 구매자만 후기를 남길 수 있습니다.");
    expect(src).toContain("soldBuyerId !== chatBuyerId");
  });

  it("does not enforce review_deadline_at (lifecycle metadata only)", () => {
    const src = readRepoFile("app/api/trade/product-chat/[roomId]/submit-review/route.ts");
    expect(src).not.toContain("review_deadline_at");
  });

  it("uses canonical trust event mapping for good/normal/bad", () => {
    const src = readRepoFile("app/api/trade/product-chat/[roomId]/submit-review/route.ts");
    expect(src).toContain("trade_review_good");
    expect(src).toContain("trade_review_normal");
    expect(src).toContain("trade_review_bad");
    expect(src).toContain("recordTrustEvent");
    expect(src).toContain('trade_flow_status: "review_completed"');
  });
});

describe("CUT 3 — Trade Chat write entry only", () => {
  it("TradeFlowBanner exposes review write CTA via canonical sheet", () => {
    const banner = readRepoFile("components/trade/TradeFlowBanner.tsx");
    expect(banner).toContain("TradeReviewWriteSheet");
    expect(banner).toContain("canOpenTradeReviewSheet");
    expect(banner).toContain("trade_flow_review_write_cta");
    expect(banner).not.toContain("submitTransactionReviewDaangn");
  });

  it("TradeReviewWriteSheet calls submit-review API", () => {
    const sheet = readRepoFile("components/trade/TradeReviewWriteSheet.tsx");
    expect(sheet).toContain("/submit-review");
    expect(sheet).toContain("buyer_to_seller");
    expect(sheet).toContain("publicReviewType");
    expect(sheet).not.toContain("submitTransactionReviewDaangn");
    expect(sheet).not.toContain("transaction_reviews");
  });

  it("PurchaseHistoryCard still has no write CTA (CUT E/D preserved)", () => {
    const purchase = readRepoFile("components/mypage/purchases/PurchaseHistoryCard.tsx");
    expect(purchase).not.toContain("TradeReviewWriteSheet");
    expect(purchase).not.toContain("canShowPurchaseReviewSend");
  });

  it("reviews hub stays read-only received/written", () => {
    const hub = readRepoFile("components/mypage/reviews/TradeReviewsManagementView.tsx");
    expect(hub).toContain('"received" | "written"');
    expect(hub).not.toContain("TradeReviewWriteSheet");
  });
});

describe("CUT 3 — deadline contract authority", () => {
  it("review_deadline_at drives chat_mode transition grace, not submit gate in code", () => {
    const transitions = readRepoFile("lib/trade/apply-product-chat-time-transitions.ts");
    expect(transitions).toContain("review_deadline_at");
    expect(transitions).toContain("POST_CONFIRM_GRACE_AFTER_DEADLINE_MS");
    expect(transitions).not.toContain("submit-review");
  });
});
