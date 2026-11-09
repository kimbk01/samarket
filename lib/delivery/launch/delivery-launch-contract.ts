/**
 * 배달 오픈 관리 — 단일 계약 (Owner 「배달 on/off·매장 모집 배너」 2026-11-10).
 * 설계: docs/design/delivery-launch-recruiting-mode.html (v2 §4-1·4-2·4-3).
 *
 * - mode `open`(정식 운영, 기본값) = 지금 배달 화면 그대로.
 * - mode `recruiting`(매장 모집) = 배달 첫 화면에 큰 모집 배너 + 목록 흐림·터치 막음 + 기존 고객센터 FAB(입점 문의),
 *   고객 주문은 서버에서 거부. 매장 신청·사장님 화면·본인 매장 보기는 모드와 무관하게 항상 동작.
 * - 오픈 기념 무료는 모드가 아니라 `freeUntil`(필리핀 날짜)로 끝난다.
 *
 * 이 파일은 클라이언트·서버 공용 (서버 전용 모듈 import 금지).
 */

export type DeliveryLaunchMode = "open" | "recruiting";

export const DELIVERY_LAUNCH_LOCALES = ["ko", "en"] as const;
export type DeliveryLaunchLocale = (typeof DELIVERY_LAUNCH_LOCALES)[number];

/** 화면 글자 — 이미지에 글자를 넣지 않고 화면이 그린다 (기기·언어별로 잘리지 않게, 설계 §4-2) */
export type DeliveryLaunchTexts = {
  badge: string;
  title: string;
  body: string;
  /** 오픈 일정 문구 (예: 「오픈 예정 · 2027년 1월」) — 빈 문자열이면 줄을 그리지 않음 */
  schedule: string;
  applyLabel: string;
  inquiryLabel: string;
};

export type DeliveryLaunchContent = {
  /** 폰 이미지 4:3 (필수 — 없으면 브랜드 바탕만) */
  mobileImageUrl: string;
  /** 태블릿·PC·Windows·폰 가로 이미지 2:1 (선택 — 없으면 폰 이미지를 가운데 기준으로 잘라 씀) */
  wideImageUrl: string;
  texts: Record<DeliveryLaunchLocale, DeliveryLaunchTexts>;
};

export type DeliveryLaunchSettings = {
  mode: DeliveryLaunchMode;
  /** YYYY-MM-DD (필리핀 날짜) 또는 null */
  freeUntil: string | null;
  fabEnabled: boolean;
  content: DeliveryLaunchContent;
  revision: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

/** 공개 API(`/api/stores/launch-state`)가 내보내는 값 — 저장자·revision 등 내부 값 제외 */
export type DeliveryLaunchPublicState = {
  mode: DeliveryLaunchMode;
  freeUntil: string | null;
  /** 오늘(필리핀) ≤ freeUntil */
  freePromoActive: boolean;
  fabEnabled: boolean;
  content: DeliveryLaunchContent;
};

export const EMPTY_DELIVERY_LAUNCH_TEXTS: DeliveryLaunchTexts = {
  badge: "",
  title: "",
  body: "",
  schedule: "",
  applyLabel: "",
  inquiryLabel: "",
};

export const DEFAULT_DELIVERY_LAUNCH_CONTENT: DeliveryLaunchContent = {
  mobileImageUrl: "",
  wideImageUrl: "",
  texts: { ko: { ...EMPTY_DELIVERY_LAUNCH_TEXTS }, en: { ...EMPTY_DELIVERY_LAUNCH_TEXTS } },
};

/** 테이블이 없거나(운영 미적용) 읽기 실패 시 = 정식 운영 (지금 화면 그대로) */
export const DEFAULT_DELIVERY_LAUNCH_SETTINGS: DeliveryLaunchSettings = {
  mode: "open",
  freeUntil: null,
  fabEnabled: true,
  content: DEFAULT_DELIVERY_LAUNCH_CONTENT,
  revision: 0,
  updatedAt: null,
  updatedBy: null,
};

/** 기기별 이미지 규격 (설계 §4-2). 비율 허용 ±8%. */
export const DELIVERY_LAUNCH_IMAGE_SPECS = {
  mobile: { ratioW: 4, ratioH: 3, ratioLabel: "4:3", recommendedWidth: 1200, recommendedHeight: 900, minWidth: 900, minHeight: 675 },
  wide: { ratioW: 2, ratioH: 1, ratioLabel: "2:1", recommendedWidth: 1536, recommendedHeight: 768, minWidth: 1200, minHeight: 600 },
} as const;
export type DeliveryLaunchImageKind = keyof typeof DELIVERY_LAUNCH_IMAGE_SPECS;
export const DELIVERY_LAUNCH_IMAGE_RATIO_TOLERANCE = 0.08;

/** 배달 본문 폭이 이 값 이상이면 와이드 배치 (태블릿·폴더블 펼침·폰 가로·PC·Windows) */
export const DELIVERY_LAUNCH_WIDE_MIN_CONTENT_PX = 600;

const TEXT_MAX: Record<keyof DeliveryLaunchTexts, number> = {
  badge: 40,
  title: 60,
  body: 300,
  schedule: 80,
  applyLabel: 24,
  inquiryLabel: 24,
};

export function isDeliveryLaunchImageKind(v: unknown): v is DeliveryLaunchImageKind {
  return v === "mobile" || v === "wide";
}

export function validateDeliveryLaunchImageGeometry(
  kind: DeliveryLaunchImageKind,
  width: number,
  height: number
): { ok: true } | { ok: false; error: "image_too_small" | "image_ratio_mismatch" } {
  const spec = DELIVERY_LAUNCH_IMAGE_SPECS[kind];
  if (!(width >= spec.minWidth && height >= spec.minHeight)) return { ok: false, error: "image_too_small" };
  const want = spec.ratioW / spec.ratioH;
  const got = width / height;
  if (Math.abs(got - want) / want > DELIVERY_LAUNCH_IMAGE_RATIO_TOLERANCE) {
    return { ok: false, error: "image_ratio_mismatch" };
  }
  return { ok: true };
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** 이미지 URL — https 만 (javascript:·data: 등 거부) */
function httpsUrl(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || s.length > 2048) return "";
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
}

function normalizeTexts(raw: unknown): DeliveryLaunchTexts {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...EMPTY_DELIVERY_LAUNCH_TEXTS };
  (Object.keys(TEXT_MAX) as (keyof DeliveryLaunchTexts)[]).forEach((k) => {
    out[k] = str(o[k], TEXT_MAX[k]);
  });
  return out;
}

export function normalizeDeliveryLaunchContent(raw: unknown): DeliveryLaunchContent {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const textsRaw = o.texts && typeof o.texts === "object" ? (o.texts as Record<string, unknown>) : {};
  return {
    mobileImageUrl: httpsUrl(o.mobileImageUrl),
    wideImageUrl: httpsUrl(o.wideImageUrl),
    texts: { ko: normalizeTexts(textsRaw.ko), en: normalizeTexts(textsRaw.en) },
  };
}

export function normalizeDeliveryLaunchMode(v: unknown): DeliveryLaunchMode {
  return v === "recruiting" ? "recruiting" : "open";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeFreeUntil(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().slice(0, 10) : "";
  if (!DATE_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

/** DB 행(snake_case) → 설정. 알 수 없는 값은 기본값으로. */
export function deliveryLaunchSettingsFromRow(row: Record<string, unknown> | null | undefined): DeliveryLaunchSettings {
  if (!row) return DEFAULT_DELIVERY_LAUNCH_SETTINGS;
  const rev = Number(row.revision);
  return {
    mode: normalizeDeliveryLaunchMode(row.mode),
    freeUntil: normalizeFreeUntil(row.free_until),
    fabEnabled: row.fab_enabled !== false,
    content: normalizeDeliveryLaunchContent(row.content),
    revision: Number.isFinite(rev) && rev >= 0 ? Math.floor(rev) : 0,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    updatedBy: typeof row.updated_by === "string" ? row.updated_by : null,
  };
}

/** 오늘 필리핀(Asia/Manila) 날짜 YYYY-MM-DD */
export function manilaTodayYmd(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function isDeliveryFreePromoActive(freeUntil: string | null, now: Date = new Date()): boolean {
  const fu = normalizeFreeUntil(freeUntil);
  return !!fu && manilaTodayYmd(now) <= fu;
}

export function toDeliveryLaunchPublicState(s: DeliveryLaunchSettings, now: Date = new Date()): DeliveryLaunchPublicState {
  return {
    mode: s.mode,
    freeUntil: s.freeUntil,
    freePromoActive: isDeliveryFreePromoActive(s.freeUntil, now),
    fabEnabled: s.fabEnabled,
    content: s.content,
  };
}

export const DEFAULT_DELIVERY_LAUNCH_PUBLIC_STATE: DeliveryLaunchPublicState = toDeliveryLaunchPublicState(
  DEFAULT_DELIVERY_LAUNCH_SETTINGS
);

/** 언어별 문구 — 빈 칸은 한국어로 (설계 §6-1 「빈 칸이면 한국어로 표시」) */
export function resolveDeliveryLaunchTexts(content: DeliveryLaunchContent, lang: string): DeliveryLaunchTexts {
  const ko = content.texts.ko;
  if (lang !== "en") return ko;
  const en = content.texts.en;
  const out = { ...ko };
  (Object.keys(out) as (keyof DeliveryLaunchTexts)[]).forEach((k) => {
    if (en[k]) out[k] = en[k];
  });
  return out;
}

/** 매장 모집 중 서버 주문 거부 코드 */
export const DELIVERY_RECRUITING_ORDER_ERROR = "delivery_recruiting" as const;
