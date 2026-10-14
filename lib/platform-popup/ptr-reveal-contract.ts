/**
 * PTR Reveal Banner SSOT — 당겨서 새로고침 슬롯 뒤에 드러나는 띠(band) 광고.
 *
 * 프레젠테이션: Platform Popup 비간섭 타입 `ptr_reveal` (승인·기간·우선순위·CTA·감사로그·이벤트 재사용).
 * 소재: creative_mode `ptr_band`, 변형 `default`(휴대폰 띠, 필수) · `tablet`(태블릿 띠, 선택) · `logo`(선택).
 *
 * 렌더 규칙 (실제 슬롯 높이·기기 폭 대조 — 설계 문서 §5, 잠정·Owner 확정 대상)
 * - 슬롯 높이: 당김 0~106px, 새로고침 유지 58~106px(놓은 위치에 따라).
 * - 띠 렌더 박스 높이 = 슬롯 최대 106px, 세로 중앙 정렬 → 슬롯이 낮으면 위·아래가 대칭으로 가려짐.
 * - 휴대폰(폭 < 600): 4:1 띠를 폭에 맞춰 cover — 360~424px 은 좌우 일부 잘림, 424px 초과는 세로 소폭 확대.
 * - 태블릿(폭 ≥ 600): 8:1 띠를 높이 106px 고정 — 848px 보다 좁으면 좌우 잘림, 넓으면 좌우는 슬롯 배경색.
 * - 태블릿 띠가 없으면 태블릿 폭에서는 광고 미노출(휴대폰 띠 확대 금지 — 화질·세로 잘림).
 */

import { DIBAY_PTR_MAX_PX, DIBAY_PTR_THRESHOLD_PX } from "@/lib/ui/ptr/dibay-ptr-ssot";

export const PTR_REVEAL_PRESENTATION = "ptr_reveal" as const;
export const PTR_BAND_CREATIVE_MODE = "ptr_band" as const;

export const PTR_BAND_VARIANTS = ["default", "tablet", "logo"] as const;
export type PtrBandVariant = (typeof PTR_BAND_VARIANTS)[number];
export type PtrBandDeviceVariant = Exclude<PtrBandVariant, "logo">;

export function isPtrBandVariant(value: string): value is PtrBandVariant {
  return (PTR_BAND_VARIANTS as readonly string[]).includes(value);
}

export function normalizePtrBandVariant(value: string | null | undefined): PtrBandVariant {
  const v = String(value ?? "").trim().toLowerCase();
  return isPtrBandVariant(v) ? v : "default";
}

export type PtrBandZone = { x0: number; x1: number; y0: number; y1: number };

export type PtrBandSpec = {
  variant: PtrBandVariant;
  /** 서버 재인코딩 결과 표준 픽셀 */
  width: number;
  height: number;
  /** DB aspect 토큰 */
  aspectW: number;
  aspectH: number;
  /** 업로드 최소 원본 해상도 (이보다 작으면 거부 — 업스케일 흐림 방지) */
  minSourceWidth: number;
  minSourceHeight: number;
  labelKo: string;
  labelEn: string;
  /** 핵심 문구 안전영역(원본 비율 0~1) — 모든 대상 기기에서 보이고 앱 표시물이 덮지 않는 영역 */
  safeZones: readonly PtrBandZone[];
  /** 새로고침 상태(스피너·문구) 가 덮는 영역 — 핵심 콘텐츠 배치 금지 */
  statusZone: PtrBandZone | null;
  /** 앱 표시물(「광고」 표기·광고주 로고·CTA 버튼) 영역 — 소재는 배경만, 핵심 문구 배치 금지 */
  chromeZone: PtrBandZone | null;
};

/** 최소 유지 높이(58)/렌더 높이(106) — 새로고침 중 항상 보이는 세로 중앙 띠 */
const HOLD_Y0 = round3((1 - DIBAY_PTR_THRESHOLD_PX / DIBAY_PTR_MAX_PX) / 2);
const HOLD_Y1 = round3(1 - HOLD_Y0);

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export const PTR_BAND_SPECS: Record<PtrBandVariant, PtrBandSpec> = {
  default: {
    variant: "default",
    width: 1280,
    height: 320,
    aspectW: 4,
    aspectH: 1,
    minSourceWidth: 960,
    minSourceHeight: 240,
    labelKo: "휴대폰 띠",
    labelEn: "Phone band",
    // 360px 폭에서 좌우 각 7.5% 잘림 → 바깥 10% 비움 / 가운데 36% 상태 표시 / 오른쪽은 광고 표기·로고·CTA
    safeZones: [{ x0: 0.1, x1: 0.32, y0: HOLD_Y0, y1: HOLD_Y1 }],
    statusZone: { x0: 0.32, x1: 0.68, y0: HOLD_Y0, y1: HOLD_Y1 },
    chromeZone: { x0: 0.68, x1: 0.9, y0: HOLD_Y0, y1: HOLD_Y1 },
  },
  tablet: {
    variant: "tablet",
    width: 2560,
    height: 320,
    aspectW: 8,
    aspectH: 1,
    minSourceWidth: 1920,
    minSourceHeight: 240,
    labelKo: "태블릿 띠",
    labelEn: "Tablet band",
    // 600px 폭에서 좌우 각 14.6% 잘림 → 바깥 16% 비움 / 오른쪽은 광고 표기·로고·CTA
    safeZones: [{ x0: 0.16, x1: 0.4, y0: HOLD_Y0, y1: HOLD_Y1 }],
    statusZone: { x0: 0.4, x1: 0.6, y0: HOLD_Y0, y1: HOLD_Y1 },
    chromeZone: { x0: 0.6, x1: 0.84, y0: HOLD_Y0, y1: HOLD_Y1 },
  },
  logo: {
    variant: "logo",
    width: 256,
    height: 256,
    aspectW: 1,
    aspectH: 1,
    minSourceWidth: 96,
    minSourceHeight: 96,
    labelKo: "로고",
    labelEn: "Logo",
    safeZones: [{ x0: 0.1, x1: 0.9, y0: 0.1, y1: 0.9 }],
    statusZone: null,
    chromeZone: null,
  },
};

/** 기기 구분 — 이 폭 이상이면 태블릿 띠 (잠정: Android 7" 세로 600dp 기준) */
export const PTR_BAND_TABLET_MIN_VIEWPORT_PX = 600;

export function resolvePtrBandVariantForViewport(viewportWidth: number): PtrBandDeviceVariant {
  return viewportWidth >= PTR_BAND_TABLET_MIN_VIEWPORT_PX ? "tablet" : "default";
}

/** 띠 렌더 박스 높이 (= 슬롯 최대) */
export const PTR_BAND_RENDER_HEIGHT_PX = DIBAY_PTR_MAX_PX;

/** 소스 업로드 최대(재인코딩 전) — 팝업 소재와 동일 */
export const PTR_BAND_SOURCE_MAX_BYTES = 8 * 1024 * 1024;
export const PTR_BAND_ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

export const PTR_BAND_RATIO_TOLERANCE = 0.01;

/** DB 토큰이 ptr_band 변형 중 하나와 일치 */
export function isPtrBandAspectTokenKnown(aspectW: number, aspectH: number): boolean {
  return PTR_BAND_VARIANTS.some(
    (v) => PTR_BAND_SPECS[v].aspectW === aspectW && PTR_BAND_SPECS[v].aspectH === aspectH
  );
}

export function isPtrBandAspectValidForVariant(
  aspectW: number,
  aspectH: number,
  variant: string | null | undefined
): boolean {
  const spec = PTR_BAND_SPECS[normalizePtrBandVariant(variant)];
  return aspectW === spec.aspectW && aspectH === spec.aspectH;
}

export function isPtrBandPixelRatioOk(width: number, height: number, variant: PtrBandVariant): boolean {
  if (!(width > 0) || !(height > 0)) return false;
  const spec = PTR_BAND_SPECS[variant];
  const target = spec.aspectW / spec.aspectH;
  return Math.abs(width / height - target) <= PTR_BAND_RATIO_TOLERANCE * target;
}

export type PtrBandSourceCheck =
  | { ok: true; ratioOk: boolean }
  | { ok: false; error: "type_invalid" | "too_large" | "too_small" };

/** 업로드 전 검증 (클라이언트·서버 공용) — 비율 불일치는 가운데 자르기 확인 대상(ok:true, ratioOk:false) */
export function checkPtrBandSource(input: {
  variant: PtrBandVariant;
  mime: string;
  bytes: number;
  width: number;
  height: number;
}): PtrBandSourceCheck {
  if (!(PTR_BAND_ALLOWED_MIME as readonly string[]).includes(input.mime)) {
    return { ok: false, error: "type_invalid" };
  }
  if (input.bytes > PTR_BAND_SOURCE_MAX_BYTES) return { ok: false, error: "too_large" };
  const spec = PTR_BAND_SPECS[input.variant];
  const crop = centerCropBoxToPtrBand(input.width, input.height, input.variant);
  if (crop.width < spec.minSourceWidth || crop.height < spec.minSourceHeight) {
    return { ok: false, error: "too_small" };
  }
  return { ok: true, ratioOk: isPtrBandPixelRatioOk(input.width, input.height, input.variant) };
}

export function centerCropBoxToPtrBand(
  width: number,
  height: number,
  variant: PtrBandVariant
): { left: number; top: number; width: number; height: number } {
  const spec = PTR_BAND_SPECS[variant];
  const target = spec.aspectW / spec.aspectH;
  const current = width / height;
  if (current > target) {
    const cropW = Math.round(height * target);
    return { left: Math.floor((width - cropW) / 2), top: 0, width: cropW, height };
  }
  const cropH = Math.round(width / target);
  return { left: 0, top: Math.floor((height - cropH) / 2), width, height: cropH };
}

export type PtrBandLayout = {
  /** 렌더된 띠 이미지 크기(px) */
  imageWidthPx: number;
  imageHeightPx: number;
  /** 슬롯 기준 이미지 좌상단 오프셋(px) — 음수면 잘림 */
  offsetLeftPx: number;
  offsetTopPx: number;
  /** 원본 기준 보이는 영역(0~1) */
  visible: PtrBandZone;
  /** 좌우 배경색 채움(px, 한쪽) */
  sideFillPx: number;
};

/**
 * 프레임 폭·슬롯 높이에서 띠의 실제 배치 — 앱 런타임과 관리자 미리보기가 같은 함수를 쓴다.
 */
export function computePtrBandLayout(input: {
  variant: PtrBandDeviceVariant;
  frameWidthPx: number;
  slotHeightPx: number;
}): PtrBandLayout {
  const spec = PTR_BAND_SPECS[input.variant];
  const ratio = spec.aspectW / spec.aspectH;
  const boxH = PTR_BAND_RENDER_HEIGHT_PX;
  let imageHeight = boxH;
  let imageWidth = boxH * ratio;
  if (input.variant === "default" && imageWidth < input.frameWidthPx) {
    // 휴대폰 cover — 폭 우선
    imageWidth = input.frameWidthPx;
    imageHeight = imageWidth / ratio;
  }
  const slotH = Math.max(0, Math.min(boxH, input.slotHeightPx));
  const offsetLeft = (input.frameWidthPx - imageWidth) / 2;
  const offsetTop = (slotH - imageHeight) / 2;
  const visX0 = Math.max(0, -offsetLeft) / imageWidth;
  const visY0 = Math.max(0, -offsetTop) / imageHeight;
  return {
    imageWidthPx: imageWidth,
    imageHeightPx: imageHeight,
    offsetLeftPx: offsetLeft,
    offsetTopPx: offsetTop,
    visible: { x0: visX0, x1: 1 - visX0, y0: visY0, y1: 1 - visY0 },
    sideFillPx: Math.max(0, offsetLeft),
  };
}
