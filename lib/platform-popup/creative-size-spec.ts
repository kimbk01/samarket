/**
 * 진입 감사 재감사 (Owner 2026-11-17 「이미지 삽입 시 기본 크기·최대 크기·비율·문구가 어드민에 적용되어 문제 없어야」) —
 * 팝업 소재·문구 규격 단일 정의. 서버 업로드·저장 검사와 어드민 안내가 같은 값을 쓴다. 순수 모듈.
 *
 * 근거: 예전에는 최소 해상도 검사가 없어 작은 그림이 1440×1000 으로 늘어나 흐려졌고(카드), 제목·본문·버튼 글 길이 제한이 없어
 * 긴 글이 틀을 깨뜨릴 수 있었다. 운영 최대값(2026-11-17 조회): 제목 27자 · 본문 14자 · 버튼 13자 · 이벤트 제목 42자.
 */
import { POPUP_CREATIVE_SOURCE_MAX_BYTES } from "@/lib/platform-popup/creative-pixel-ssot";
import type { PlatformPopupComposition } from "@/lib/platform-popup/resolve-presentation-composition";

/** 카드(36:25) 원본 최소 — 최종 1440×1000 의 절반(2배 넘게 늘리지 않음) */
export const POPUP_CARD_MIN_SOURCE = { width: 720, height: 500 } as const;
/** 카드 최종 크기(서버가 맞춤) */
export const POPUP_CARD_OUTPUT = { width: 1440, height: 1000 } as const;
/** 그림형(투명 PNG) 원본 긴 변 최소 · 최종 긴 변 최대(서버가 줄임) */
export const POPUP_ARTWORK_MIN_LONG_EDGE = 720;
export const POPUP_ARTWORK_OUTPUT_MAX_EDGE = 1600;
/** 원본 픽셀 상한(4천만 화소) — 작은 파일에 거대한 크기(압축 폭탄)로 서버가 멈추지 않게 */
export const POPUP_SOURCE_MAX_PIXELS = 40_000_000;
export const POPUP_SOURCE_MAX_MB = Math.round(POPUP_CREATIVE_SOURCE_MAX_BYTES / (1024 * 1024));

/** 문구 길이(글자 수) */
export const POPUP_TITLE_MAX = 60;
export const POPUP_BODY_MAX = 160;
export const POPUP_CTA_LABEL_MAX = 24;

export type PopupSourceSizeCheck =
  | { ok: true }
  | { ok: false; error: "popup_image_too_small"; minWidth: number; minHeight: number }
  | { ok: false; error: "popup_image_too_many_pixels" };

export function checkPopupCreativeSourceSize(input: {
  creativeMode: "card" | "artwork";
  width: number;
  height: number;
}): PopupSourceSizeCheck {
  if (input.width * input.height > POPUP_SOURCE_MAX_PIXELS) return { ok: false, error: "popup_image_too_many_pixels" };
  if (input.creativeMode === "card") {
    // 36:25 로 자른 뒤에도 최소 크기 — 가로·세로 각각 확인(자르기는 긴 쪽을 줄인다)
    const cropW = Math.min(input.width, Math.floor((input.height * 36) / 25));
    const cropH = Math.min(input.height, Math.floor((input.width * 25) / 36));
    if (cropW < POPUP_CARD_MIN_SOURCE.width || cropH < POPUP_CARD_MIN_SOURCE.height) {
      return {
        ok: false,
        error: "popup_image_too_small",
        minWidth: POPUP_CARD_MIN_SOURCE.width,
        minHeight: POPUP_CARD_MIN_SOURCE.height,
      };
    }
    return { ok: true };
  }
  if (Math.max(input.width, input.height) < POPUP_ARTWORK_MIN_LONG_EDGE) {
    return { ok: false, error: "popup_image_too_small", minWidth: POPUP_ARTWORK_MIN_LONG_EDGE, minHeight: 0 };
  }
  return { ok: true };
}

/** 문구 길이 검사 — 넘으면 오류 코드(조용히 자르지 않음) */
export function checkPopupCopyLengths(input: {
  title?: string | null;
  body?: string | null;
  ctaLabel?: string | null;
}): { ok: true } | { ok: false; error: "title_too_long" | "body_too_long" | "cta_label_too_long" } {
  const len = (v: string | null | undefined) => [...(v ?? "").trim()].length;
  if (len(input.title) > POPUP_TITLE_MAX) return { ok: false, error: "title_too_long" };
  if (len(input.body) > POPUP_BODY_MAX) return { ok: false, error: "body_too_long" };
  if (len(input.ctaLabel) > POPUP_CTA_LABEL_MAX) return { ok: false, error: "cta_label_too_long" };
  return { ok: true };
}

/** 어드민 안내용 — 형태별 그림 규격 */
export type PopupCreativeSpec = {
  kind: "card" | "artwork";
  /** 비율 표기 · null = 그림 비율 그대로 */
  ratio: string | null;
  recommended: string;
  minimum: string;
  output: string;
  transparent: boolean;
};

export function popupCreativeSpecForComposition(kind: PlatformPopupComposition): PopupCreativeSpec {
  const card =
    kind === "promotion_card_modal" || kind === "bottom_promotion_sheet" || kind === "benefit_dialog";
  if (card) {
    return {
      kind: "card",
      ratio: "36:25",
      recommended: `${POPUP_CARD_OUTPUT.width}×${POPUP_CARD_OUTPUT.height}`,
      minimum: `${POPUP_CARD_MIN_SOURCE.width}×${POPUP_CARD_MIN_SOURCE.height}`,
      output: `${POPUP_CARD_OUTPUT.width}×${POPUP_CARD_OUTPUT.height} WebP`,
      transparent: false,
    };
  }
  const recommended =
    kind === "artwork_full" ? "1080×1440" : kind === "tooltip" ? "720×720" : kind === "list_sheet" ? "1080×480" : "1080×1080";
  return {
    kind: "artwork",
    ratio: null,
    recommended,
    /** 긴 변 최소(px) */
    minimum: `${POPUP_ARTWORK_MIN_LONG_EDGE}`,
    output: `≤${POPUP_ARTWORK_OUTPUT_MAX_EDGE} WebP`,
    transparent: true,
  };
}
