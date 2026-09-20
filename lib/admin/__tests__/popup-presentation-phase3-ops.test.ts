import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  distributionPopupLifecycleNotice,
  popupApprovalStatusLabel,
  popupCompositionEventRequirement,
  popupCompositionOperatorLabel,
  popupEditHref,
  popupFrequencyOperatorLabel,
  resolvePopupBenefitOperationalHint,
  resolvePopupListCompositionLabel,
} from "@/lib/admin/promotion-ownership-visibility";
import {
  PLATFORM_POPUP_COMPOSITIONS,
  compositionContractNote,
  creativeModeForComposition,
  interruptivePresentationForComposition,
  resolvePlatformPopupComposition,
} from "@/lib/platform-popup/resolve-presentation-composition";
import {
  resolvePopupOperatorStatus,
  promotionOperatorStatusLabel,
} from "@/lib/admin/promotion-operation-status";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(`${ROOT}/${path}`, "utf8");

describe("Phase 3 — Popup 4-presentation operational clarity", () => {
  it("exposes exactly four operator compositions", () => {
    expect(PLATFORM_POPUP_COMPOSITIONS).toEqual([
      "artwork_modal",
      "promotion_card_modal",
      "bottom_promotion_sheet",
      "benefit_dialog",
    ]);
  });

  it("distinguishes Artwork vs Card despite shared center_modal persistence", () => {
    const artwork = resolvePlatformPopupComposition({
      presentationType: "center_modal",
      creativeMode: "artwork",
    });
    const card = resolvePlatformPopupComposition({
      presentationType: "center_modal",
      creativeMode: "card",
    });
    expect(artwork).toBe("artwork_modal");
    expect(card).toBe("promotion_card_modal");
    expect(interruptivePresentationForComposition(artwork)).toBe("center_modal");
    expect(interruptivePresentationForComposition(card)).toBe("center_modal");
    expect(creativeModeForComposition(artwork)).toBe("artwork");
    expect(creativeModeForComposition(card)).toBe("card");
    expect(resolvePopupListCompositionLabel({
      presentationType: "center_modal",
      creativeMode: "artwork",
      lang: "ko",
    })).not.toMatch(/중앙|center_modal/i);
    expect(resolvePopupListCompositionLabel({
      presentationType: "center_modal",
      creativeMode: "card",
      lang: "ko",
    })).toContain("프로모션 카드");
  });

  it("Benefit requires Event + Benefit section; others are optional", () => {
    for (const kind of PLATFORM_POPUP_COMPOSITIONS) {
      const req = popupCompositionEventRequirement(kind);
      if (kind === "benefit_dialog") expect(req).toBe("required");
      else expect(req).toBe("optional");
    }
    expect(
      resolvePopupBenefitOperationalHint({
        presentationType: "benefit_dialog",
        creativeMode: "card",
        linkedEventId: null,
        linkedEventHasBenefit: null,
      })
    ).toBe("event_link_needed");
    expect(
      resolvePopupBenefitOperationalHint({
        presentationType: "benefit_dialog",
        creativeMode: "card",
        linkedEventId: "evt-1",
        linkedEventHasBenefit: false,
      })
    ).toBe("benefit_info_needed");
    expect(
      resolvePopupBenefitOperationalHint({
        presentationType: "benefit_dialog",
        creativeMode: "card",
        linkedEventId: "evt-1",
        linkedEventHasBenefit: true,
      })
    ).toBe("none");
  });

  it("compositionContractNote never exposes raw presentation_type product taxonomy", () => {
    for (const kind of PLATFORM_POPUP_COMPOSITIONS) {
      const note = compositionContractNote(kind);
      expect(note.titleKo).not.toMatch(/center_modal|bottom_sheet|benefit_dialog|creative_mode/i);
      expect(note.bodyKo).not.toMatch(/center_modal|creative_mode/i);
      expect(popupCompositionOperatorLabel(kind, "ko")).not.toMatch(/center_modal/i);
    }
  });

  it("approval vs exposure labels stay distinct", () => {
    expect(popupApprovalStatusLabel("not_submitted", "ko")).toBe("작성 중");
    expect(popupApprovalStatusLabel("pending_review", "ko")).toBe("승인 대기");
    expect(popupApprovalStatusLabel("approved", "ko")).toBe("승인 완료");
    expect(popupApprovalStatusLabel("rejected", "ko")).toBe("반려");
    const exposure = promotionOperatorStatusLabel(
      resolvePopupOperatorStatus({
        status: "active",
        startsAt: "2020-01-01T00:00:00.000Z",
        endsAt: null,
      }),
      "ko"
    );
    expect(exposure).toBe("노출 중");
    expect(exposure).not.toBe(popupApprovalStatusLabel("approved", "ko"));
  });

  it("frequency labels map supported modes including once_campaign", () => {
    expect(popupFrequencyOperatorLabel("once_per_session", "ko")).toBe("세션당 1회");
    expect(popupFrequencyOperatorLabel("once_per_day", "ko")).toBe("하루 1회");
    expect(popupFrequencyOperatorLabel("once_campaign", "ko")).toBe("캠페인당 1회");
    expect(popupFrequencyOperatorLabel("close_only", "ko")).toContain("닫기");
  });

  it("Distribution draft ≠ live Popup; manage deep-link is canonical Popup editor", () => {
    const off = distributionPopupLifecycleNotice({
      enabled: false,
      channelRefId: null,
      lang: "ko",
    });
    expect(off.kind).toBe("off");
    expect(off.manageHref).toBeNull();

    const pending = distributionPopupLifecycleNotice({
      enabled: true,
      channelRefId: null,
      lang: "ko",
    });
    expect(pending.kind).toBe("draft_needs_ops");
    expect(pending.message).toMatch(/승인|노출/);
    expect(pending.manageHref).toBeNull();

    const linked = distributionPopupLifecycleNotice({
      enabled: true,
      channelRefId: "camp-42",
      lang: "ko",
    });
    expect(linked.kind).toBe("linked");
    expect(linked.message).toMatch(/노출되지 않음|승인/);
    expect(linked.manageHref).toBe(popupEditHref("camp-42"));
    expect(linked.manageHref).toBe("/admin/platform-popup/camp-42");
  });

  it("Admin detail uses composition resolver + approval/exposure split (no raw enum primary)", () => {
    const detail = read("components/admin/platform-popup/AdminPlatformPopupDetailWorkspace.tsx");
    expect(detail).toContain("resolvePlatformPopupComposition");
    expect(detail).toContain("PLATFORM_POPUP_COMPOSITIONS");
    expect(detail).toContain("data-admin-popup-ops-summary");
    expect(detail).toContain("data-admin-popup-approval-status");
    expect(detail).toContain("data-admin-popup-exposure-status");
    expect(detail).toContain("data-admin-popup-benefit-gate");
    expect(detail).not.toMatch(/titleKo:\s*"Artwork"/);
    expect(detail).toContain("creativeMode !== \"artwork\"");
  });

  it("Dist panel shows draft notice + Popup management deep-link", () => {
    const dist = read(
      "components/admin/platform-events/AdminPlatformEventDistributionPanel.tsx"
    );
    expect(dist).toContain("distributionPopupLifecycleNotice");
    expect(dist).toContain("data-admin-popup-dist-draft-notice");
    expect(dist).toContain("data-admin-popup-dist-manage-link");
    expect(dist).not.toMatch(/auto.?activat/i);
  });

  it("landscape preview deny copy is explicit", () => {
    const preview = read("components/admin/platform-popup/AdminPlatformPopupPreview.tsx");
    expect(preview).toContain("가로 화면에서는 팝업을 노출하지 않습니다.");
    expect(preview).toContain("data-admin-popup-preview-landscape-deny");
  });

  it("list filter supports four compositions without backend rewrite", () => {
    const list = read("components/admin/platform-popup/AdminPlatformPopupListPage.tsx");
    expect(list).toContain("data-admin-popup-filter-composition");
    expect(list).toContain("PLATFORM_POPUP_COMPOSITIONS");
    expect(list).toContain("resolvePlatformPopupComposition");
  });

  it("no fourth DB presentation_type and no auto-activate writer in Phase 3 files", () => {
    const detail = read("components/admin/platform-popup/AdminPlatformPopupDetailWorkspace.tsx");
    const dist = read(
      "components/admin/platform-events/AdminPlatformEventDistributionPanel.tsx"
    );
    const ownership = read("lib/admin/promotion-ownership-visibility.ts");
    for (const src of [detail, dist, ownership]) {
      expect(src).not.toMatch(/presentation_type.*=.*['\"]full_screen/);
      expect(src).not.toMatch(/autoActivate|auto_activate|approveAndActivateOnSave/);
    }
  });
});
