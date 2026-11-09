/**
 * 매장 입점·수수료 계약(서약) — 단일 계약 (Owner 승인 설계 v2 §4-5, 2026-11-10).
 * 설계: docs/design/delivery-launch-recruiting-mode.html (v2 §4-5) · 마이그레이션 20271110150000_store_partner_agreements.sql
 *
 * - 약관 원문 = app_legal_documents kind `store_partner_terms` (회원 동의·재동의와 무관).
 * - 동의 기록 = store_partner_agreements (추가만). 서명 당시 무료 종료일·업종·무료 후 요율·본문 해시를 서버가 다시 계산해 남긴다.
 * - 무료 후 요율 = SQL `store_partner_fee_percent_for_taxonomy` (수수료 해석 규칙과 같은 함수) — TS 는 계산하지 않는다.
 * - 입점 승인: 게시된 약관이 있으면 동의 기록 필수 → 무료 종료일(어드민 수정값 우선, 없으면 최신 동의)이 오늘 이후면
 *   승인 상태 변경보다 먼저 `admin_upsert_store_launch_free_policy` 로 0% 매장 정책을 만든다.
 *
 * 클라이언트·서버 공용 (서버 전용 모듈 import 금지).
 */
import { manilaTodayYmd, normalizeFreeUntil } from "@/lib/delivery/launch/delivery-launch-contract";

export const STORE_PARTNER_TERMS_KIND = "store_partner_terms" as const;

/** 오픈 기념 무료 매장 정책 표시 (store_fee_policies.memo) — SQL 함수와 같은 값 */
export const STORE_LAUNCH_FREE_POLICY_MEMO = "launch_free" as const;

export const STORE_PARTNER_AGREEMENT_SOURCES = ["application", "reconsent"] as const;
export type StorePartnerAgreementSource = (typeof STORE_PARTNER_AGREEMENT_SOURCES)[number];

/** 서버 오류 코드 (화면 문구는 클라이언트 카탈로그) */
export const PARTNER_AGREEMENT_REQUIRED_ERROR = "partner_agreement_required" as const;
export const PARTNER_TERMS_VERSION_MISMATCH_ERROR = "partner_terms_version_mismatch" as const;
export const LAUNCH_FREE_POLICY_FAILED_ERROR = "launch_free_policy_failed" as const;
export const LAUNCH_FREE_UNTIL_INVALID_ERROR = "launch_free_until_invalid" as const;
export const LAUNCH_FREE_UNTIL_PAST_ERROR = "launch_free_until_past" as const;
export const PARTNER_AGREEMENT_NOT_REAL_STORE_ERROR = "partner_agreement_not_real_store" as const;

export type StorePartnerFeeScope = "store" | "topic" | "category" | "default";

/** 신청서·재동의 화면에 보여 주는 약관 + 조건 (서버가 계산) */
export type StorePartnerTermsDocument = {
  id: string;
  version: string;
  locale: "ko" | "en";
  title: string;
  body: string;
};

export type StorePartnerTermsOffer = {
  /** null = 게시된 약관 없음 → 서약 없이 신청 가능 (약관 준비 중 안내) */
  terms: StorePartnerTermsDocument | null;
  /** 서명 시 기록할 무료 종료일 (필리핀 날짜) — 무료가 진행 중일 때만 값 */
  freeUntil: string | null;
  freePromoActive: boolean;
  /** 무료 기간 후 요율(%) — null = 적용 정책 없음 */
  feePercentAfter: number | null;
  feeScope: StorePartnerFeeScope | null;
};

/** 신청서·재동의 요청 본문 */
export type StorePartnerAgreementInput = {
  documentId: string;
  version: string;
  locale: "ko" | "en";
  agreeTerms: boolean;
  agreeFee: boolean;
};

export type StorePartnerAgreementRow = {
  id: string;
  storeId: string;
  ownerUserId: string;
  legalDocumentId: string;
  documentVersion: string;
  bodySha256: string;
  locale: "ko" | "en";
  freeUntil: string | null;
  storeCategoryId: string | null;
  storeTopicId: string | null;
  feePercentAfter: number | null;
  source: StorePartnerAgreementSource;
  agreedAt: string;
};

export const STORE_PARTNER_AGREEMENT_SELECT =
  "id, store_id, owner_user_id, legal_document_id, document_version, body_sha256, locale, free_until, store_category_id, store_topic_id, fee_percent_after, source, agreed_at";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function finiteOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizePartnerLocale(v: unknown): "ko" | "en" {
  return v === "en" ? "en" : "ko";
}

/** 요청 본문 `partner_agreement` → 입력 (형식이 틀리면 null) */
export function parseStorePartnerAgreementInput(raw: unknown): StorePartnerAgreementInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const documentId = str(o.documentId);
  const version = str(o.version);
  if (!documentId || !version) return null;
  return {
    documentId,
    version,
    locale: normalizePartnerLocale(o.locale),
    agreeTerms: o.agreeTerms === true,
    agreeFee: o.agreeFee === true,
  };
}

export type PartnerAgreementCheck =
  | { ok: true; required: false }
  | { ok: true; required: true; terms: StorePartnerTermsDocument }
  | {
      ok: false;
      error: typeof PARTNER_AGREEMENT_REQUIRED_ERROR | typeof PARTNER_TERMS_VERSION_MISMATCH_ERROR;
    };

/**
 * 신청·재동의 서약 검사 — 게시된 약관이 없으면 서약 없이 통과(기존 흐름 유지).
 * 있으면: 체크 2개 모두 true + 화면이 본 문서 id·버전이 지금 게시본과 같아야 한다.
 */
export function checkStorePartnerAgreementInput(
  current: StorePartnerTermsDocument | null,
  input: StorePartnerAgreementInput | null
): PartnerAgreementCheck {
  if (!current) return { ok: true, required: false };
  if (!input || input.agreeTerms !== true || input.agreeFee !== true) {
    return { ok: false, error: PARTNER_AGREEMENT_REQUIRED_ERROR };
  }
  if (input.documentId !== current.id || input.version !== current.version) {
    return { ok: false, error: PARTNER_TERMS_VERSION_MISMATCH_ERROR };
  }
  return { ok: true, required: true, terms: current };
}

/**
 * 약관 언어 선택 — 요청 언어 게시본이 ko 게시본과 같은 버전이면 그 언어, 아니면 ko (없으면 있는 쪽).
 * 「현재 게시 버전」 = 돌려준 문서의 버전 (재동의 판정·서명 검사가 같은 함수를 쓴다).
 */
export function pickStorePartnerTermsForLocale<T extends { version: string }>(
  ko: T | null,
  localized: T | null
): T | null {
  if (localized && ko && localized.version === ko.version) return localized;
  return ko ?? localized;
}

/** 서명 시 기록·표시할 무료 종료일 — 오늘(필리핀) ≤ 종료일 일 때만 값, 아니면 null */
export function activeFreeUntilOrNull(freeUntil: string | null | undefined, now: Date = new Date()): string | null {
  const fu = normalizeFreeUntil(freeUntil);
  return fu && manilaTodayYmd(now) <= fu ? fu : null;
}

/**
 * 입점 승인 때 쓸 무료 종료일 — 어드민 수정값(override) 우선, 없으면 최신 동의 기록의 free_until.
 */
export function resolveLaunchFreeUntilForApproval(input: {
  overrideFreeUntil: string | null | undefined;
  latestAgreementFreeUntil: string | null | undefined;
}): string | null {
  return normalizeFreeUntil(input.overrideFreeUntil) ?? normalizeFreeUntil(input.latestAgreementFreeUntil);
}

/** 오픈 기념 무료 정책을 만들지 — 무료 종료일이 오늘(필리핀) 이후(오늘 포함) */
export function shouldCreateLaunchFreePolicy(freeUntil: string | null | undefined, now: Date = new Date()): boolean {
  return activeFreeUntilOrNull(freeUntil, now) != null;
}

/** 이 매장이 현재 게시 버전에 동의했는지 (재동의 필요 판정) */
export function storeHasAgreedToVersion(
  agreements: readonly Pick<StorePartnerAgreementRow, "documentVersion">[],
  currentVersion: string | null | undefined
): boolean {
  const v = str(currentVersion);
  if (!v) return true;
  return agreements.some((a) => a.documentVersion === v);
}

export function normalizeStorePartnerAgreementRow(row: Record<string, unknown>): StorePartnerAgreementRow | null {
  const id = str(row.id);
  const storeId = str(row.store_id);
  const legalDocumentId = str(row.legal_document_id);
  if (!id || !storeId || !legalDocumentId) return null;
  return {
    id,
    storeId,
    ownerUserId: str(row.owner_user_id),
    legalDocumentId,
    documentVersion: str(row.document_version),
    bodySha256: str(row.body_sha256),
    locale: normalizePartnerLocale(row.locale),
    freeUntil: normalizeFreeUntil(row.free_until),
    storeCategoryId: str(row.store_category_id) || null,
    storeTopicId: str(row.store_topic_id) || null,
    feePercentAfter: finiteOrNull(row.fee_percent_after),
    source: row.source === "reconsent" ? "reconsent" : "application",
    agreedAt: str(row.agreed_at),
  };
}

/** SQL `store_partner_fee_percent_for_taxonomy` 결과 jsonb → 요율·범위 */
export function parsePartnerFeeResult(raw: unknown): { feePercent: number | null; scope: StorePartnerFeeScope | null } {
  if (!raw || typeof raw !== "object") return { feePercent: null, scope: null };
  const o = raw as Record<string, unknown>;
  const scope = o.scope === "store" || o.scope === "topic" || o.scope === "category" || o.scope === "default" ? o.scope : null;
  return { feePercent: finiteOrNull(o.fee_percent), scope };
}

/** 화면 표시용 요율 문자열 (예: 7 → "7", 7.5 → "7.5") */
export function formatPartnerFeePercent(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "";
  return String(Math.round(v * 100) / 100);
}
