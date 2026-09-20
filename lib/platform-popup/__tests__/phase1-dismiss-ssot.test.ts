/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { frequencyModeToDismissSuppressMode } from "@/lib/platform-popup/dismiss-ssot";
import { resolvePlatformPopupPresentationSuppressionOptions } from "@/lib/platform-popup/popup-suppression-ui";
import { resolvePlatformPopupSuppressionUxMapping } from "@/lib/platform-popup/popup-suppression-ux-contract";
import {
  compositionUsesFloatingClose,
  resolvePlatformPopupComposition,
} from "@/lib/platform-popup/resolve-presentation-composition";

const ROOT = process.cwd();

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Phase 1 dismiss SSOT", () => {
  it("maps frequency → dismiss suppress mode", () => {
    expect(frequencyModeToDismissSuppressMode("once_per_session")).toBe("SESSION");
    expect(frequencyModeToDismissSuppressMode("once_per_day")).toBe("TODAY");
    expect(frequencyModeToDismissSuppressMode("once_campaign")).toBe("CAMPAIGN");
    expect(frequencyModeToDismissSuppressMode("close_only")).toBe("CLOSE");
  });

  it("default suppression chrome is empty (X-only)", () => {
    expect(
      resolvePlatformPopupPresentationSuppressionOptions({
        suppressionMode: "TODAY",
        frequencyMode: "once_per_day",
      })
    ).toEqual([]);
    expect(
      resolvePlatformPopupPresentationSuppressionOptions({
        suppressionMode: "SESSION",
        frequencyMode: "once_per_session",
      })
    ).toEqual([]);
  });

  it("UX mapping: dismissWrites follows frequency; buttons empty by default", () => {
    const m = resolvePlatformPopupSuppressionUxMapping({
      suppressionMode: "TODAY",
      frequencyMode: "once_per_day",
    });
    expect(m.dismissWrites).toBe("TODAY");
    expect(m.userFacingButtons).toEqual([]);
    expect(m.closeControlPrimary).toBe(true);
  });

  it("host: impression path has no frequency suppress fetch; dismiss uses dismiss-ssot", () => {
    const host = readRepo("components/platform-popup/GlobalPopupHost.tsx");
    expect(host).toContain("frequencyModeToDismissSuppressMode");
    expect(host).toContain("handleImpression");
    expect(host).toContain("onImpression={handleImpression}");
    expect(host).not.toContain("frequency_suppress_failed");
    expect(host).toContain('App.addListener("backButton"');
    // Impression handler must not POST suppress.
    const impressionBlock = host.slice(
      host.indexOf("const handleImpression"),
      host.indexOf("const handleImageError")
    );
    expect(impressionBlock).not.toContain("/api/platform-popup/suppress");
  });

  it("DibayPopupAd no longer exposes onRenderComplete as impression+suppress hook", () => {
    const ad = readRepo("components/platform-popup/DibayPopupAd.tsx");
    expect(ad).toContain("onImpression");
    expect(ad).not.toContain("onRenderComplete");
  });
});

describe("Phase 1 compositions A–D", () => {
  it("maps benefit_dialog presentation", () => {
    expect(
      resolvePlatformPopupComposition({
        presentationType: "benefit_dialog",
        creativeMode: "card",
      })
    ).toBe("benefit_dialog");
  });

  it("all interruptive compositions use floating close", () => {
    expect(compositionUsesFloatingClose("artwork_modal")).toBe(true);
    expect(compositionUsesFloatingClose("promotion_card_modal")).toBe(true);
    expect(compositionUsesFloatingClose("bottom_promotion_sheet")).toBe(true);
    expect(compositionUsesFloatingClose("benefit_dialog")).toBe(true);
  });

  it("BenefitDialogPresentation exists and sheets use floating X class", () => {
    const benefit = readRepo(
      "components/platform-popup/presentations/BenefitDialogPresentation.tsx"
    );
    expect(benefit).toContain('data-composition="benefit_dialog"');
    const sheet = readRepo(
      "components/platform-popup/presentations/BottomPromotionSheetPresentation.tsx"
    );
    expect(sheet).toContain("dibay-promo-close-x--sheet");
    expect(sheet).not.toContain('variant="text"');
  });
});
