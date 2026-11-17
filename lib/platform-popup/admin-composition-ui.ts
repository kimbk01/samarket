/**
 * 앱 진입 어드민 v3 §4·§6 (Owner 2026-11-17 「v3대로 진행」) — 팝업 형태 8종의 어드민 표시(짧은 이름 키 · 아이콘 글자 ·
 * 그림 칸 규격 · 샘플 미리보기 여부). 순수 · 화면 공용. 규격 값은 `creative-size-spec.ts` 하나에서 온다.
 */
import type { MessageKey } from "@/lib/i18n/message-key";
import { POPUP_ARTWORK_MIN_LONG_EDGE, popupCreativeSpecForComposition } from "@/lib/platform-popup/creative-size-spec";
import type { PlatformPopupComposition } from "@/lib/platform-popup/resolve-presentation-composition";

const SHORT_LABEL_KEY: Record<PlatformPopupComposition, MessageKey> = {
  promotion_card_modal: "admin_popup_v3_comp_promotion_card_modal",
  artwork_modal: "admin_popup_v3_comp_artwork_modal",
  bottom_promotion_sheet: "admin_popup_v3_comp_bottom_promotion_sheet",
  benefit_dialog: "admin_popup_v3_comp_benefit_dialog",
  artwork_full: "admin_popup_v3_comp_artwork_full",
  coupon_card: "admin_popup_v3_comp_coupon_card",
  list_sheet: "admin_popup_v3_comp_list_sheet",
  tooltip: "admin_popup_v3_comp_tooltip",
};

/** v3 형태 고르기 순서 (시안 §4 카드 순서) */
export const ADMIN_POPUP_COMPOSITION_PICK_ORDER: readonly PlatformPopupComposition[] = [
  "promotion_card_modal",
  "artwork_modal",
  "bottom_promotion_sheet",
  "benefit_dialog",
  "artwork_full",
  "coupon_card",
  "list_sheet",
  "tooltip",
];

export function popupCompositionShortLabelKey(kind: PlatformPopupComposition): MessageKey {
  return SHORT_LABEL_KEY[kind];
}

/** 목록 「형태」 열 앞 작은 그림 글자(장식 · aria-hidden) */
export function popupCompositionGlyph(kind: PlatformPopupComposition): string {
  switch (kind) {
    case "bottom_promotion_sheet":
    case "list_sheet":
      return "▭";
    case "tooltip":
      return "◔";
    case "artwork_modal":
    case "artwork_full":
      return "◇";
    default:
      return "▢";
  }
}

/** 카드형(36:25 자르기) 형태 */
export function popupCompositionIsCard(kind: PlatformPopupComposition): boolean {
  return popupCreativeSpecForComposition(kind).kind === "card";
}

/** 형태 카드에 적는 그림 규격 1줄 — 문구 키 + 값 */
export function popupCompositionSpecLine(kind: PlatformPopupComposition): {
  key: MessageKey;
  vars: Record<string, string | number>;
} {
  const spec = popupCreativeSpecForComposition(kind);
  if (spec.kind === "card") {
    return { key: "admin_popup_v3_spec_card", vars: { ratio: spec.ratio ?? "36:25", recommended: spec.recommended } };
  }
  return { key: "admin_popup_v3_spec_artwork", vars: { recommended: spec.recommended, min: POPUP_ARTWORK_MIN_LONG_EDGE } };
}

/** 그림형 권장 크기(px) — `popupArtworkSlot(recommended)` 에 넘긴다 */
export function popupArtworkRecommendedSize(kind: PlatformPopupComposition): { width: number; height: number } {
  const [w, h] = popupCreativeSpecForComposition(kind).recommended.split("×").map((v) => Number(v));
  return { width: w || 1080, height: h || 1080 };
}

/** 미리보기에 예시 데이터를 쓰는 형태(앱은 회원·화면별 실제 데이터로 그림) — 저장·앱 전송 없음 */
export const ADMIN_POPUP_SAMPLE_PREVIEW_COMPOSITIONS: ReadonlySet<PlatformPopupComposition> = new Set([
  "list_sheet",
  "coupon_card",
  "tooltip",
]);
