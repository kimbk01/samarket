/**
 * 모임 신고 사유·금지 모임 유형 — 운영 정책 데이터(`moim_policies.report_reasons`·`prohibited_types` · R4 설계 §3).
 *
 * - 목록의 원본은 운영 정책이다. 아래 상수는 정책 값이 없을 때(옛 DB·읽기 실패)만 쓰는 기본값이며, DB 기본값과 같다.
 * - 표시 이름: 정책 데이터의 그 언어 이름(`resolveLocalizedAdminLabel`) → 기본 코드면 기존 문구 키 → 코드.
 * - 「목록 안」 판정은 서버 RPC 가 한다(신고 생성·직접 제재). 라우트는 코드 형식만 본다.
 * 클라이언트 안전 (서버 모듈 import 없음).
 */
import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import { resolveLocalizedAdminLabel } from "@/lib/i18n/resolve-localized-admin-label";

/** 신고 사유 기본 코드 (설계 §6 P13 · FAQ 3730/27663/20399 기반). 화면 문구 키 = moim_report_reason_<code> */
export const MOIM_REPORT_REASON_CODES = [
  "commercial",
  "religion",
  "politics",
  "dating",
  "mlm_investment",
  "personal_info",
  "external_messenger",
  "abuse_hate",
  "sexual",
  "fraud",
  "noshow_fee",
  "other",
] as const;
export type MoimReportReasonCode = (typeof MOIM_REPORT_REASON_CODES)[number];

/** 금지 모임 유형 기본 코드 (설계 §2.5 · D10 — 27663 목록). 화면 문구 키 = moim_rule_<code> */
export const MOIM_PROHIBITED_TYPE_CODES = [
  "commercial",
  "religion",
  "politics",
  "dating",
  "mlm",
  "personal_info",
  "external_messenger",
  "illegal",
] as const;

/** 정책 코드 형식 (SQL `moim_admin_policies_save` 와 같음) */
export const MOIM_POLICY_CODE_RE = /^[a-z_]{2,40}$/;

export function isMoimPolicyCode(v: unknown): v is string {
  return typeof v === "string" && MOIM_POLICY_CODE_RE.test(v);
}

/** 화면에 보내는 모양 (camelCase) */
export type MoimPolicyLabelItem = { code: string; labelKo: string; labelEn: string };
export type MoimReportReasonItem = MoimPolicyLabelItem & { isActive: boolean };

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * DB jsonb(`[{code,label_ko,label_en,is_active?}]`) → 항목 목록. 배열이 아니면 null(정책 값 없음 → 호출부 기본값).
 * 형식이 틀린 항목·겹치는 코드는 건너뛴다. is_active 가 false 가 아니면 켜진 것으로 본다.
 */
export function parseMoimReportReasons(raw: unknown): MoimReportReasonItem[] | null {
  if (!Array.isArray(raw)) return null;
  const out: MoimReportReasonItem[] = [];
  const seen = new Set<string>();
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const code = str(o.code);
    if (!isMoimPolicyCode(code) || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, labelKo: str(o.label_ko), labelEn: str(o.label_en), isActive: o.is_active !== false });
  }
  return out;
}

export function parseMoimPolicyLabelItems(raw: unknown): MoimPolicyLabelItem[] | null {
  const items = parseMoimReportReasons(raw);
  return items ? items.map(({ code, labelKo, labelEn }) => ({ code, labelKo, labelEn })) : null;
}

/** 신고 시트·직접 제재에 보일 사유 — 정책 데이터의 켜진 사유, 데이터가 없으면 기본 12개 */
export function activeMoimReportReasons(
  items: readonly (MoimPolicyLabelItem & { isActive?: boolean })[] | null | undefined
): MoimPolicyLabelItem[] {
  if (!items) return MOIM_REPORT_REASON_CODES.map((code) => ({ code, labelKo: "", labelEn: "" }));
  return items.filter((i) => i.isActive !== false).map(({ code, labelKo, labelEn }) => ({ code, labelKo, labelEn }));
}

/** 만들기 화면 금지 유형 — 정책 데이터, 없으면 기본 8개 */
export function moimProhibitedTypesOrDefault(items: readonly MoimPolicyLabelItem[] | null | undefined): MoimPolicyLabelItem[] {
  if (items) return [...items];
  return MOIM_PROHIBITED_TYPE_CODES.map((code) => ({ code, labelKo: "", labelEn: "" }));
}

type T = (key: MessageKey) => string;

/**
 * 표시 이름 — ① 정책 데이터의 앱 언어 이름 ② 기본 코드면 기존 문구 키(`<keyPrefix><code>`) ③ 코드.
 * 기본 목록 밖 코드는 문구 키를 찾지 않는다(없는 키 경고를 내지 않게).
 */
export function moimPolicyItemLabel(
  lang: AppLanguageCode,
  t: T,
  code: string,
  item: Pick<MoimPolicyLabelItem, "labelKo" | "labelEn"> | null | undefined,
  fallback: { keyPrefix: "moim_report_reason_" | "moim_rule_"; codes: readonly string[] }
): string {
  if (item) {
    const data = resolveLocalizedAdminLabel(lang, item.labelKo ?? "", item.labelEn).trim();
    if (data) return data;
  }
  if (fallback.codes.includes(code)) {
    const key = `${fallback.keyPrefix}${code}` as MessageKey;
    const label = t(key);
    if (label && label !== key) return label;
  }
  return code;
}

/** 신고 사유 표시 이름 (사용자·어드민 공용) */
export function moimReportReasonLabel(
  lang: AppLanguageCode,
  t: T,
  code: string,
  items?: readonly MoimPolicyLabelItem[] | null
): string {
  const item = items?.find((i) => i.code === code) ?? null;
  return moimPolicyItemLabel(lang, t, code, item, { keyPrefix: "moim_report_reason_", codes: MOIM_REPORT_REASON_CODES });
}

/** 금지 모임 유형 표시 이름 */
export function moimProhibitedTypeLabel(lang: AppLanguageCode, t: T, item: MoimPolicyLabelItem): string {
  return moimPolicyItemLabel(lang, t, item.code, item, { keyPrefix: "moim_rule_", codes: MOIM_PROHIBITED_TYPE_CODES });
}
