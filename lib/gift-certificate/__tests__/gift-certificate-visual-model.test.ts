import { describe, expect, it } from "vitest";
import {
  buildGiftCertificateVisualModel,
  buildGiftVisualModelLabels,
} from "@/lib/gift-certificate/gift-certificate-visual-model";
import { formatGiftMoney } from "@/lib/gift-certificate/gift-certificate-format";

const labels = buildGiftVisualModelLabels((key, opts) => {
  const ko = opts?.fallbackKo ?? key;
  if (opts?.vars?.days != null) return ko.replace("{days}", String(opts.vars.days));
  if (opts?.vars?.store) return ko.replace("{store}", String(opts.vars.store));
  return ko;
});

describe("gift certificate visual model", () => {
  it("mall face value drives display amount", () => {
    const a = buildGiftCertificateVisualModel({
      surface: "mall",
      title: "만두 초코 사랑 합니다",
      giftScope: "PLATFORM",
      storeName: "DIBAY",
      faceValue: 1000,
      remainingBalance: null,
      variant: "standard",
      labels,
    });
    expect(a?.displayAmount.formatted).toBe("₱1,000");
    expect(a?.displayAmount.kind).toBe("FACE_VALUE");
    expect(a?.validity).toBeNull();
  });

  it("wallet remaining balance drives display amount", () => {
    const model = buildGiftCertificateVisualModel({
      surface: "wallet",
      title: "JTV 상품권",
      giftScope: "STORE",
      storeName: "JTV",
      faceValue: 1000,
      remainingBalance: 700,
      variant: "standard",
      labels,
    });
    expect(model?.displayAmount.formatted).toBe("₱700");
    expect(model?.displayAmount.secondaryFaceFormatted).toBe("₱1,000");
    expect(model?.validity).toBeNull();
  });

  it("binds certificate validity when explicit dates exist", () => {
    const model = buildGiftCertificateVisualModel({
      surface: "wallet",
      title: "JTV 상품권",
      giftScope: "STORE",
      storeName: "JTV",
      faceValue: 1000,
      remainingBalance: 700,
      validFrom: "2026-01-01",
      validUntil: "2026-12-31",
      variant: "standard",
      labels,
    });
    expect(model?.validity?.display).toBe("2026.01.01 ~ 2026.12.31");
  });

  it("formats PHP money canonically", () => {
    expect(formatGiftMoney(1000)).toBe("₱1,000");
  });
});
