/**
 * @vitest-environment node
 * CUT 1 — presentation geometry + Event Benefit authority (focused structural).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertBenefitDialogContent,
  extractPlatformEventBenefitContent,
  isBenefitDialogEligibleForEventSections,
} from "@/lib/platform-popup/event-benefit-authority";
import { buildPlatformPopupPresentationWinner } from "@/lib/platform-popup/build-presentation-winner";
import type { PlatformPopupCandidate } from "@/lib/platform-popup/resolve-popup-ad";

const ROOT = process.cwd();

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const baseCandidate: PlatformPopupCandidate = {
  id: "camp-1",
  status: "active",
  approvalStatus: "approved",
  priority: 1,
  surfaces: ["GLOBAL"],
  creative: {
    id: "cr-1",
    status: "ready",
    aspectW: 36,
    aspectH: 25,
    creativeMode: "card",
    assetPath: "qa/sample.webp",
    assetUrl:
      "https://example.supabase.co/storage/v1/object/public/platform-popup-creatives/qa/sample.webp",
    altText: "QA popup",
  },
  ctaType: "internal_page",
  ctaTarget: "/market",
  externalUrl: null,
  suppressions: [],
};

describe("CUT1 Event Benefit authority", () => {
  it("extracts benefit section title/body only", () => {
    const benefit = extractPlatformEventBenefitContent([
      { type: "text", title: "Hello", body: "ignore" },
      { type: "benefit", title: " ₱100 OFF ", body: " Min ₱500 " },
    ]);
    expect(benefit).toEqual({ title: "₱100 OFF", body: "Min ₱500" });
  });

  it("rejects empty benefit title", () => {
    expect(extractPlatformEventBenefitContent([{ type: "benefit", title: "  " }])).toBeNull();
    expect(isBenefitDialogEligibleForEventSections([{ type: "text", title: "x" }])).toBe(false);
  });

  it("assertBenefitDialogContent fail-closes without Event benefit", () => {
    expect(assertBenefitDialogContent("benefit_dialog", null)).toEqual({
      ok: false,
      reason: "benefit_content_required",
    });
    expect(assertBenefitDialogContent("center_modal", null)).toEqual({
      ok: true,
      required: false,
    });
  });

  it("buildPresentationWinner returns null for benefit_dialog without Event benefit", () => {
    const presentation = buildPlatformPopupPresentationWinner(
      {
        campaignId: "camp-1",
        creativeId: "cr-1",
        surface: "TRADE",
        href: "/events/evt-1",
        presentationType: "benefit_dialog",
        frequencyMode: "once_per_session",
        creativeMode: "card",
      },
      baseCandidate,
      {
        assetUrl: baseCandidate.creative!.assetUrl,
        assetPath: baseCandidate.creative!.assetPath,
        altText: "QA",
      },
      { suppressionMode: "SESSION", timezone: "Asia/Manila" },
      null
    );
    expect(presentation).toBeNull();
  });

  it("buildPresentationWinner attaches Event benefit when present", () => {
    const presentation = buildPlatformPopupPresentationWinner(
      {
        campaignId: "camp-1",
        creativeId: "cr-1",
        surface: "TRADE",
        href: "/events/evt-1",
        presentationType: "benefit_dialog",
        frequencyMode: "once_per_session",
        creativeMode: "card",
      },
      baseCandidate,
      {
        assetUrl: baseCandidate.creative!.assetUrl,
        assetPath: baseCandidate.creative!.assetPath,
        altText: "QA",
      },
      {
        suppressionMode: "SESSION",
        timezone: "Asia/Manila",
        title: "Campaign title must not be benefit",
        body: "Campaign body must not be benefit",
      },
      { title: "₱100 OFF Delivery", body: "Min order ₱500" }
    );
    expect(presentation?.benefit).toEqual({
      title: "₱100 OFF Delivery",
      body: "Min order ₱500",
    });
    expect(presentation?.title).toBe("Campaign title must not be benefit");
  });
});

describe("CUT1 geometry structural contracts", () => {
  it("Artwork does not use Card media class or cover", () => {
    const artwork = readRepo("components/platform-popup/presentations/ArtworkModalPresentation.tsx");
    const media = readRepo("components/platform-popup/primitives/PopupCreativeMedia.tsx");
    const css = readRepo("app/platform-popup.css");
    expect(artwork).toContain('composition="artwork_modal"');
    expect(artwork).toContain("dibay-promo-artwork-stack");
    expect(artwork).toContain("dibay-promo-artwork-card");
    expect(media).toContain('data-media-policy={isArtwork ? "contain-alpha"');
    const artworkBlock = css.match(
      /\.dibay-promo-creative--artwork\s*\{[\s\S]*?\}\s*\.dibay-promo-creative--artwork \.dibay-promo-creative__img\s*\{[\s\S]*?\}/
    )?.[0];
    expect(artworkBlock).toBeTruthy();
    expect(artworkBlock).toContain("object-fit: contain");
    expect(artworkBlock).not.toContain("object-fit: cover");
    expect(artworkBlock).toContain("aspect-ratio: auto");
    expect(artworkBlock).toContain("background: transparent !important");
  });

  it("Card uses 36:25 + cover", () => {
    const css = readRepo("app/platform-popup.css");
    expect(css).toContain(".dibay-promo-creative--card");
    expect(css).toMatch(/\.dibay-promo-creative--card[\s\S]*?aspect-ratio:\s*36\s*\/\s*25/);
    expect(css).toMatch(/\.dibay-promo-creative--card[\s\S]*?object-fit:\s*cover/);
  });

  it("Sheet consumes canonical --safe-bottom spacer", () => {
    const sheet = readRepo(
      "components/platform-popup/presentations/BottomPromotionSheetPresentation.tsx"
    );
    const css = readRepo("app/platform-popup.css");
    expect(sheet).toContain('data-promo-safe-bottom="1"');
    expect(sheet).toContain("dibay-promo-sheet__safe-bottom");
    expect(css).toContain(".dibay-promo-sheet__safe-bottom");
    expect(css).toMatch(
      /\.dibay-promo-sheet__safe-bottom[\s\S]*?height:\s*var\(--safe-bottom/
    );
    expect(css).not.toMatch(/env\(safe-area-inset-bottom/);
  });

  it("Benefit resolves Event Benefit hierarchy (not Card clone)", () => {
    const benefit = readRepo(
      "components/platform-popup/presentations/BenefitDialogPresentation.tsx"
    );
    expect(benefit).toContain('data-benefit-authority="event_section"');
    expect(benefit).toContain("dibay-promo-benefit__value");
    expect(benefit).toContain("benefitTitle");
    expect(benefit).not.toContain("border-dashed");
    expect(benefit).not.toContain("dibay-promo-card");
  });

  it("Admin preview dispatches production DibayPopupAd + landscape deny copy", () => {
    const preview = readRepo("components/admin/platform-popup/AdminPlatformPopupPreview.tsx");
    const detail = readRepo(
      "components/admin/platform-popup/AdminPlatformPopupDetailWorkspace.tsx"
    );
    expect(preview).toContain('from "@/components/platform-popup/DibayPopupAd"');
    expect(preview).toContain("benefit={winner.benefit}");
    expect(preview).toContain("가로 화면에서는 팝업을 노출하지 않습니다.");
    expect(detail).toContain("admin_platform_popup_benefit_requires_event_benefit");
    expect(detail).toContain("연결된 이벤트에 혜택 정보가 있을 때 사용할 수 있습니다.");
    expect(detail).toContain("extractPlatformEventBenefitContent");
  });

  it("safe-area SSOT remains app-shell --safe-* (promo does not invent UA pads)", () => {
    const shell = readRepo("app/app-shell.css");
    expect(shell).toContain(
      "--safe-bottom: max(env(safe-area-inset-bottom, 0px), var(--dibay-safe-bottom, 0px))"
    );
    const css = readRepo("app/platform-popup.css");
    expect(css).not.toMatch(/Android|iPhone|device-model|userAgent/i);
  });
});
