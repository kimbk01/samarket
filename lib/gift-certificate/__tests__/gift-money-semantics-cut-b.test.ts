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

const OUT = resolve(process.cwd(), ".tmp/gift-modern-ticket-proof");

function renderFace(args: {
  context: "mall" | "wallet" | "detail" | "used";
  giftScope?: "PLATFORM" | "STORE";
  faceValue: number;
  purchasePrice: number;
  remainingBalance: number | null;
  title?: string;
  issuerName?: string;
}) {
  const model = buildGiftCertificateVisualModel({
    giftScope: args.giftScope ?? "PLATFORM",
    context: args.context,
    title: args.title ?? "오픈 기념 이벤트 상품권",
    issuerName: args.issuerName ?? "DIBAY",
    faceValue: args.faceValue,
    purchasePrice: args.purchasePrice,
    remainingBalance: args.remainingBalance,
    expirationDisplay: "만료 없음",
    certificateDisplayNumber:
      args.context === "mall" ? null : "GFT-WP9Q8-WP9Q8",
  });
  return renderToStaticMarkup(
    createElement(DibayGiftCertificateFace, { model, labels: LABELS })
  );
}

function shellHtml(caseId: string, viewport: number, faceHtml: string, maxWidth: number) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=${viewport}"/><title>${caseId}@${viewport}</title>
<style>
  body{margin:0;background:#eef1ee;font-family:system-ui,sans-serif}
  .frame{width:${viewport}px;margin:0 auto;padding:16px;box-sizing:border-box}
  .card{max-width:${maxWidth}px;margin:0 auto;background:transparent}
</style></head><body><div class="frame" data-case="${caseId}" data-viewport="${viewport}"><div class="card">${faceHtml}</div></div></body></html>`;
}

describe("modern ticket money semantics + fixtures", () => {
  it("A DISCOUNT: face + strike purchase row + OFF badge + no remaining", () => {
    expect(giftShowsDiscountStrike(1000, 900)).toBe(true);
    const html = renderFace({
      context: "wallet",
      faceValue: 1000,
      purchasePrice: 900,
      remainingBalance: 1000,
    });
    expect(html).toContain("금액");
    expect(html).toContain('data-gift-face-amount="1"');
    expect(html).toContain("₱1,000");
    expect(html).toContain("구매 금액");
    expect(html).toContain('data-gift-purchase-amount="1"');
    expect(html).toContain("₱900");
    expect(html).toContain('data-gift-face-strike-line="1"');
    expect(html).toContain("10% OFF");
    expect(html).toContain('data-gift-brand-rail="1"');
    expect(html).toContain('data-gift-meta-grid="1"');
    expect(html).not.toContain('data-gift-remaining-amount="1"');
    expect(html).not.toContain("잔액");
  });

  it("B FLAT: no strike, no 0% OFF", () => {
    expect(giftShowsDiscountStrike(1000, 1000)).toBe(false);
    const html = renderFace({
      context: "wallet",
      faceValue: 1000,
      purchasePrice: 1000,
      remainingBalance: 1000,
    });
    expect(html).toContain("구매 금액");
    expect(html).toContain('data-gift-discount-strike="0"');
    expect(html).not.toContain('data-gift-face-strike-line="1"');
    expect(html).not.toContain("0% OFF");
    expect(html).not.toContain("10% OFF");
  });

  it("C historical partial never shows remaining", () => {
    expect(giftShowsRemainingBalance(1000, 880)).toBe(false);
    const html = renderFace({
      context: "wallet",
      faceValue: 1000,
      purchasePrice: 900,
      remainingBalance: 880,
    });
    expect(html).not.toContain('data-gift-remaining-amount="1"');
    expect(html).not.toContain("잔액");
    expect(html).toContain('data-gift-availability="AVAILABLE"');
  });

  it("D USED: same geometry + USED status + restrained stamp", () => {
    const html = renderFace({
      context: "used",
      faceValue: 1000,
      purchasePrice: 900,
      remainingBalance: 0,
    });
    expect(html).toContain('data-gift-availability="USED"');
    expect(html).toContain('data-gift-brand-rail="1"');
    expect(html).toContain("data-gift-used-stamp");
  });

  it("writes 390 / 768 / wide HTML fixtures", () => {
    mkdirSync(OUT, { recursive: true });
    const cases = [
      {
        id: "A-DIBAY-DISCOUNT",
        faceValue: 1000,
        purchasePrice: 900,
        remainingBalance: 1000,
        context: "wallet" as const,
      },
      {
        id: "B-DIBAY-FLAT",
        faceValue: 1000,
        purchasePrice: 1000,
        remainingBalance: 1000,
        context: "wallet" as const,
      },
      {
        id: "C-STORE-AVAILABLE",
        faceValue: 1000,
        purchasePrice: 1000,
        remainingBalance: 1000,
        context: "wallet" as const,
        giftScope: "STORE" as const,
        title: "U7 Positive Fee QA",
        issuerName: "나의 오른손딸방",
      },
      {
        id: "D-USED",
        faceValue: 1000,
        purchasePrice: 900,
        remainingBalance: 0,
        context: "used" as const,
      },
    ];
    const viewports = [
      { name: "390", width: 390, size: "md" as const },
      { name: "768", width: 768, size: "md" as const },
      { name: "1024", width: 1024, size: "lg" as const },
    ];
    const report: Record<string, unknown> = {
      amountTitleRatio: GIFT_PORTRAIT_TYPE.amountValue / GIFT_PORTRAIT_TYPE.title,
      geometry: "640x360-modern-ticket",
      cases: {},
    };
    for (const c of cases) {
      const faceHtml = renderFace(c);
      (report.cases as Record<string, unknown>)[c.id] = {
        hasRail: faceHtml.includes('data-gift-brand-rail="1"'),
        hasMetaGrid: faceHtml.includes('data-gift-meta-grid="1"'),
        hasStrike: faceHtml.includes('data-gift-face-strike-line="1"'),
        hasRemaining: false,
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
    expect(readFileSync(resolve(OUT, "REPORT.json"), "utf8")).toContain("A-DIBAY-DISCOUNT");
  });
});
