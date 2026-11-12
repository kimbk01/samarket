import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

/** 거래 후기 없음(Owner 2026-10-28) — CUT 3 의 후기 작성 경로는 닫는다. 데이터(transaction_reviews)는 보존. */
describe("거래 후기 없음 — 작성 경로 닫힘", () => {
  it("TradeFlowBanner 에 후기 작성 버튼·시트가 없다", () => {
    const banner = readRepoFile("components/trade/TradeFlowBanner.tsx");
    expect(banner).not.toContain("TradeReviewWriteSheet");
    expect(banner).not.toContain("canOpenTradeReviewSheet");
    expect(banner).not.toContain("trade_flow_review_write_cta");
  });

  it("후기 작성 시트 파일이 없다", () => {
    expect(fs.existsSync(path.join(REPO_ROOT, "components/trade/TradeReviewWriteSheet.tsx"))).toBe(false);
  });

  it("PurchaseHistoryCard 에 후기 작성·보기가 없다", () => {
    const purchase = readRepoFile("components/mypage/purchases/PurchaseHistoryCard.tsx");
    expect(purchase).not.toContain("TradeReviewWriteSheet");
    expect(purchase).not.toContain("canShowPurchaseReviewSend");
    expect(purchase).not.toContain("BuyerReviewReadSheet");
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
