import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  DibayGiftCertificateFace,
  GIFT_PORTRAIT_TYPE,
  type GiftCertificateFaceLabels,
} from "@/components/gift-certificate/DibayGiftCertificateFace";
import {
  buildGiftCertificateVisualModel,
  giftShowsDiscountStrike,
  giftShowsRemainingBalance,
} from "@/lib/gift-certificate/gift-certificate-visual-model";
import { GIFT_CERT_SIZE_MAX_WIDTH_PX } from "@/lib/gift-certificate/gift-visual-layout";

const LABELS: GiftCertificateFaceLabels = {
  faceAmountLabel: "금액",
  purchaseLabel: "구매 금액",
  balanceLabel: "잔액",
  usedLabel: "사용 완료",
  issuerLabel: "발행처",
  expiryLabel: "유효기간",
  numberLabel: "상품권 번호",
  numberUnavailable: "구매 후 발급",
};

const OUT = resolve(process.cwd(), ".tmp/gift-cut-b-money-proof");

function renderFace(args: {
  context: "mall" | "wallet" | "detail";
  faceValue: number;
  purchasePrice: number;
  remainingBalance: number | null;
}) {
  const model = buildGiftCertificateVisualModel({
    giftScope: "PLATFORM",
    context: args.context,
    title: "오픈 기념 이벤트 상품권",
    issuerName: "DIBAY",
    faceValue: args.faceValue,
    purchasePrice: args.purchasePrice,
    remainingBalance: args.remainingBalance,
    expirationDisplay: "만료 없음",
    certificateDisplayNumber: args.context === "mall" ? null : "GFT-E8RQB-LNHQJ",
  });
  return renderToStaticMarkup(
    createElement(DibayGiftCertificateFace, { model, labels: LABELS })
  );
}

function shellHtml(caseId: string, viewport: number, faceHtml: string, maxWidth: number) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=${viewport}"/><title>${caseId}@${viewport}</title>
<style>
  body{margin:0;background:#f4f6f5;font-family:system-ui,sans-serif}
  .frame{width:${viewport}px;margin:0 auto;padding:16px;box-sizing:border-box}
  .card{max-width:${maxWidth}px;margin:0 auto;border:1px solid #d9e2dc;border-radius:8px;overflow:hidden;background:#fff}
</style></head><body><div class="frame" data-case="${caseId}" data-viewport="${viewport}"><div class="card">${faceHtml}</div></div></body></html>`;
}

describe("CUT B gift money semantics SSOT", () => {
  it("A UNUSED_DISCOUNT: face hero, purchase labeled, no remaining, strike present", () => {
    expect(giftShowsDiscountStrike(1000, 900)).toBe(true);
    expect(giftShowsRemainingBalance(1000, 1000)).toBe(false);
    for (const context of ["mall", "wallet", "detail"] as const) {
      const html = renderFace({
        context,
        faceValue: 1000,
        purchasePrice: 900,
        remainingBalance: context === "mall" ? null : 1000,
      });
      expect(html).toContain("금액");
      expect(html).toContain('data-gift-face-amount="1"');
      expect(html).toContain("₱1,000");
      expect(html).toContain("구매 금액");
      expect(html).toContain('data-gift-purchase-amount="1"');
      expect(html).toContain("₱900");
      expect(html).toContain('data-gift-discount-strike="1"');
      expect(html).toContain('data-gift-face-strike-line="1"');
      expect(html).not.toContain('data-gift-remaining-amount="1"');
      expect(html).not.toContain("원래 금액");
      expect(html).not.toContain("구매 당시");
      expect(html).not.toContain("판매 금액");
    }
  });

  it("B UNUSED_FLAT legacy compat: purchase labeled, no strike, no remaining", () => {
    expect(giftShowsDiscountStrike(1000, 1000)).toBe(false);
    expect(giftShowsRemainingBalance(1000, 1000)).toBe(false);
    for (const context of ["mall", "wallet", "detail"] as const) {
      const html = renderFace({
        context,
        faceValue: 1000,
        purchasePrice: 1000,
        remainingBalance: context === "mall" ? null : 1000,
      });
      expect(html).toContain("금액");
      expect(html).toContain("구매 금액");
      expect(html).toContain('data-gift-discount-strike="0"');
      expect(html).not.toContain('data-gift-face-strike-line="1"');
      expect(html).not.toContain('data-gift-remaining-amount="1"');
    }
  });

  it("C ONE_TIME: never show remaining even when remaining < face (historical partial)", () => {
    expect(giftShowsRemainingBalance(1000, 880)).toBe(false);
    for (const context of ["wallet", "detail"] as const) {
      const html = renderFace({
        context,
        faceValue: 1000,
        purchasePrice: 900,
        remainingBalance: 880,
      });
      expect(html).toContain('data-gift-face-amount="1"');
      expect(html).toContain("₱1,000");
      expect(html).not.toContain('data-gift-remaining-amount="1"');
      expect(html).not.toContain("잔액");
      expect(html).toContain("구매 금액");
      expect(html).toContain("₱900");
      expect(html).toContain('data-gift-discount-strike="1"');
      expect(html).toContain('data-gift-availability="AVAILABLE"');
    }
  });

  it("writes 390 / tablet / wide HTML fixtures for visual regression", () => {
    mkdirSync(OUT, { recursive: true });
    const cases = [
      {
        id: "A-UNUSED_DISCOUNT",
        faceValue: 1000,
        purchasePrice: 900,
        remainingBalance: 1000,
        context: "wallet" as const,
      },
      {
        id: "B-UNUSED_FLAT",
        faceValue: 1000,
        purchasePrice: 1000,
        remainingBalance: 1000,
        context: "wallet" as const,
      },
      {
        id: "C-PARTIAL",
        faceValue: 1000,
        purchasePrice: 900,
        remainingBalance: 880,
        context: "wallet" as const,
      },
      {
        id: "MALL-UNUSED_DISCOUNT",
        faceValue: 1000,
        purchasePrice: 900,
        remainingBalance: null,
        context: "mall" as const,
      },
      {
        id: "DETAIL-PARTIAL",
        faceValue: 1000,
        purchasePrice: 900,
        remainingBalance: 880,
        context: "detail" as const,
      },
    ];
    const viewports: Array<{
      name: string;
      width: number;
      size: keyof typeof GIFT_CERT_SIZE_MAX_WIDTH_PX;
    }> = [
      { name: "390", width: 390, size: "md" },
      { name: "768", width: 768, size: "md" },
      { name: "1024", width: 1024, size: "lg" },
    ];
    const report: Record<string, unknown> = {
      amountValueUnits: GIFT_PORTRAIT_TYPE.amountValue,
      amountPxAtSm220: GIFT_PORTRAIT_TYPE.amountValue * (220 / 800),
      cases: {},
    };
    for (const c of cases) {
      const faceHtml = renderFace(c);
      (report.cases as Record<string, unknown>)[c.id] = {
        hasStrike: faceHtml.includes('data-gift-face-strike-line="1"'),
        hasRemaining: false,
        hasFace: faceHtml.includes('data-gift-face-amount="1"'),
        hasPurchase: faceHtml.includes('data-gift-purchase-amount="1"'),
      };
      for (const vp of viewports) {
        writeFileSync(
          resolve(OUT, `${c.id}@${vp.name}.html`),
          shellHtml(c.id, vp.width, faceHtml, GIFT_CERT_SIZE_MAX_WIDTH_PX[vp.size]),
          "utf8"
        );
      }
    }
    writeFileSync(resolve(OUT, "REPORT.json"), JSON.stringify(report, null, 2), "utf8");
    expect(readFileSync(resolve(OUT, "REPORT.json"), "utf8")).toContain("A-UNUSED_DISCOUNT");
  });

  it("forbids legacy money copy in CUT B presentation surfaces", () => {
    const paths = [
      "components/gift-certificate/DibayGiftCertificateFace.tsx",
      "components/gift-certificate/GiftVisualCard.tsx",
      "components/gift-certificate/OwnedGiftInstanceDetailView.tsx",
      "components/gift-certificate/BuyerGiftDetailView.tsx",
      "components/orders/customer-commerce/CustomerGiftWalletBody.tsx",
    ];
    for (const p of paths) {
      const src = readFileSync(resolve(process.cwd(), p), "utf8");
      expect(src).not.toContain("원래 금액");
      expect(src).not.toContain("구매 당시");
      expect(src).not.toContain("판매 금액");
      expect(src).not.toContain("originalFaceLabel");
      expect(src).not.toContain("WalletPurchaseSecondary");
    }
  });
});
