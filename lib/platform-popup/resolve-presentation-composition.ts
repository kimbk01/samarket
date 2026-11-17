/**
 * Presentation COMPOSITION ≠ DB presentation_type alone.
 * Maps interruptive presentation + creative mode → Type A / B / C / D.
 *
 * Shared SSOT remains campaign/creative/frequency/destination.
 * Geometry + DOM composition diverge by kind.
 * Type E FULL_SCREEN_EVENT is a destination page — not mapped here.
 */

import { translateBy } from "@/lib/i18n/translate-by";
import {
  normalizePlatformPopupCreativeMode,
  normalizePlatformPopupPresentationType,
  type PlatformPopupCreativeMode,
  type PlatformPopupInterruptivePresentation,
  type PlatformPopupPresentationType,
} from "@/lib/platform-popup/presentation-contract";

/** Owner visual compositions (interruptive overlay only). */
export const PLATFORM_POPUP_COMPOSITIONS = [
  "artwork_modal",
  "promotion_card_modal",
  "bottom_promotion_sheet",
  "benefit_dialog",
  // 진입 감사 PO-3 (2026-11-17)
  "coupon_card",
  "artwork_full",
  "list_sheet",
  "tooltip",
] as const;
export type PlatformPopupComposition = (typeof PLATFORM_POPUP_COMPOSITIONS)[number];

export function resolvePlatformPopupComposition(input: {
  presentationType?: string | null;
  creativeMode?: string | null;
}): PlatformPopupComposition {
  const presentation = normalizePlatformPopupPresentationType(input.presentationType);
  const creative = normalizePlatformPopupCreativeMode(input.creativeMode);

  if (presentation === "benefit_dialog") return "benefit_dialog";
  if (presentation === "bottom_sheet") return "bottom_promotion_sheet";
  if (presentation === "coupon_card") return "coupon_card";
  if (presentation === "artwork_full") return "artwork_full";
  if (presentation === "list_sheet") return "list_sheet";
  if (presentation === "tooltip") return "tooltip";
  if (creative === "artwork") return "artwork_modal";
  return "promotion_card_modal";
}

export function compositionUsesFloatingClose(kind: PlatformPopupComposition): boolean {
  return kind !== "tooltip";
}

export function compositionIsSheet(kind: PlatformPopupComposition): boolean {
  return kind === "bottom_promotion_sheet" || kind === "list_sheet";
}

export function interruptivePresentationForComposition(
  kind: PlatformPopupComposition
): PlatformPopupInterruptivePresentation {
  if (kind === "bottom_promotion_sheet") return "bottom_sheet";
  if (kind === "benefit_dialog") return "benefit_dialog";
  if (kind === "coupon_card" || kind === "artwork_full" || kind === "list_sheet" || kind === "tooltip") return kind;
  return "center_modal";
}

/** 팝업 구성은 card·artwork 만 — `ptr_band` 는 PTR 띠 광고 전용 */
export function creativeModeForComposition(
  kind: PlatformPopupComposition
): Extract<PlatformPopupCreativeMode, "card" | "artwork"> {
  // 진입 감사 PO-3: 새 형태는 원본 비율(투명 PNG 가능) 소재 — 그림 전체형·쿠폰 아이콘·목록 머리 그림·말풍선 아이콘
  return kind === "promotion_card_modal" || kind === "bottom_promotion_sheet" || kind === "benefit_dialog"
    ? "card"
    : "artwork";
}

/** Admin / docs — operator-facing composition labels (UI also uses i18n fallbacks). */
export function compositionContractNote(kind: PlatformPopupComposition): {
  titleKo: string;
  titleEn: string;
  bodyKo: string;
  bodyEn: string;
} {
  switch (kind) {
    case "artwork_modal":
      return {
        titleKo: "아트워크 팝업",
        titleEn: "Artwork popup",
        bodyKo: "투명 PNG 등 비주얼 중심 소재를 강조합니다.",
        bodyEn: "Highlights visual-first creatives such as transparent PNGs.",
      };
    case "promotion_card_modal":
      return {
        titleKo: "프로모션 카드",
        titleEn: "Promotion card",
        bodyKo: "이미지·내용·CTA를 하나의 카드로 보여줍니다.",
        bodyEn: "Shows image, copy, and CTA as one card.",
      };
    case "bottom_promotion_sheet":
      return {
        titleKo: "하단 프로모션 시트",
        titleEn: "Bottom promotion sheet",
        bodyKo: "화면 하단에서 자연스럽게 올라오는 프로모션입니다.",
        bodyEn: "A promotion that rises naturally from the bottom of the screen.",
      };
    case "benefit_dialog":
      return {
        titleKo: "혜택/쿠폰 다이얼로그",
        titleEn: "Benefit / coupon dialog",
        bodyKo: "연결된 이벤트의 쿠폰·혜택 정보를 중심으로 보여줍니다.",
        bodyEn: "Focuses on coupon and benefit info from the linked Event.",
      };
    // 진입 감사 PO-3 (2026-11-17) — 문구는 카탈로그 키
    case "coupon_card":
    case "artwork_full":
    case "list_sheet":
    case "tooltip":
      return {
        titleKo: translateBy("ko", `platform_popup_composition_${kind}_title`),
        titleEn: translateBy("en", `platform_popup_composition_${kind}_title`),
        bodyKo: translateBy("ko", `platform_popup_composition_${kind}_body`),
        bodyEn: translateBy("en", `platform_popup_composition_${kind}_body`),
      };
  }
}

export function isInterruptivePresentationType(
  value: PlatformPopupPresentationType
): value is PlatformPopupInterruptivePresentation {
  return (
    value === "center_modal" ||
    value === "bottom_sheet" ||
    value === "benefit_dialog" ||
    value === "coupon_card" ||
    value === "artwork_full" ||
    value === "list_sheet" ||
    value === "tooltip"
  );
}
