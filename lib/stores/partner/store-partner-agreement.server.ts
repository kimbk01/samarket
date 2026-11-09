import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  APP_LEGAL_DOCUMENT_SELECT,
  isMissingAppLegalDocumentsTableError,
  normalizeAppLegalDocumentRow,
  pickCurrentPublishedLegalDoc,
  type AppLegalDocumentRow,
} from "@/lib/legal/app-legal-documents";
import { legalBodySha256 } from "@/lib/legal/app-legal-document-edit-policy";
import { loadDeliveryLaunchSettingsCached } from "@/lib/delivery/launch/delivery-launch-settings.server";
import { normalizeFreeUntil } from "@/lib/delivery/launch/delivery-launch-contract";
import {
  activeFreeUntilOrNull,
  LAUNCH_FREE_POLICY_FAILED_ERROR,
  normalizeStorePartnerAgreementRow,
  PARTNER_AGREEMENT_REQUIRED_ERROR,
  parsePartnerFeeResult,
  pickStorePartnerTermsForLocale,
  resolveLaunchFreeUntilForApproval,
  shouldCreateLaunchFreePolicy,
  STORE_LAUNCH_FREE_POLICY_MEMO,
  STORE_PARTNER_AGREEMENT_SELECT,
  STORE_PARTNER_TERMS_KIND,
  type StorePartnerAgreementRow,
  type StorePartnerAgreementSource,
  type StorePartnerFeeScope,
  type StorePartnerTermsDocument,
  type StorePartnerTermsOffer,
} from "@/lib/stores/partner/store-partner-agreement-contract";

/**
 * 매장 입점·수수료 계약 — 서버 읽기·기록 (계약: `store-partner-agreement-contract.ts`).
 * 수수료 금액은 계산·기록하지 않는다. 요율은 SQL 함수 결과를 그대로 표시·기록한다.
 */

type AnySb = SupabaseClient<any>;

function isMissingRelationError(message: string | undefined, name: string): boolean {
  const m = String(message ?? "");
  return m.includes(name) && /(does not exist|schema cache|not find)/i.test(m);
}

function toTermsDocument(row: AppLegalDocumentRow | null): StorePartnerTermsDocument | null {
  if (!row || !row.body.trim() || !row.version.trim()) return null;
  return { id: row.id, version: row.version, locale: row.locale, title: row.title, body: row.body };
}

async function loadPublishedRows(sb: AnySb, locale: "ko" | "en"): Promise<AppLegalDocumentRow[] | null> {
  const { data, error } = await sb
    .from("app_legal_documents")
    .select(APP_LEGAL_DOCUMENT_SELECT)
    .eq("kind", STORE_PARTNER_TERMS_KIND)
    .eq("locale", locale)
    .eq("status", "published")
    .order("effective_at", { ascending: false, nullsFirst: false })
    .limit(20);
  if (error) {
    if (isMissingAppLegalDocumentsTableError(error.message ?? "")) return [];
    return null;
  }
  return (data ?? [])
    .map((r) => normalizeAppLegalDocumentRow(r as Record<string, unknown>))
    .filter((r): r is AppLegalDocumentRow => Boolean(r));
}

export type CurrentPartnerTermsResult =
  | { ok: true; terms: StorePartnerTermsDocument | null }
  | { ok: false; error: "terms_read_failed" };

/**
 * 지금 게시된 매장 입점 약관 (요청 언어 → ko 기준, `pickStorePartnerTermsForLocale`).
 * 읽기 실패는 「게시본 없음」으로 접지 않는다 (서약 없이 통과시키는 fail-open 방지).
 * kind CHECK 미적용(마이그레이션 전) 환경은 행이 없으므로 null = 기존 흐름.
 */
export async function loadCurrentStorePartnerTerms(
  sb: AnySb,
  locale: "ko" | "en"
): Promise<CurrentPartnerTermsResult> {
  const koRows = await loadPublishedRows(sb, "ko");
  if (koRows == null) return { ok: false, error: "terms_read_failed" };
  const ko = toTermsDocument(pickCurrentPublishedLegalDoc(koRows));
  let localized: StorePartnerTermsDocument | null = null;
  if (locale !== "ko") {
    const rows = await loadPublishedRows(sb, locale);
    if (rows == null) return { ok: false, error: "terms_read_failed" };
    localized = toTermsDocument(pickCurrentPublishedLegalDoc(rows));
  }
  return { ok: true, terms: pickStorePartnerTermsForLocale(ko, localized) };
}

/** 게시된(게시 상태) store_partner_terms 가 한 행이라도 있는지 — 입점 승인 게이트 */
export async function hasAnyPublishedStorePartnerTerms(sb: AnySb): Promise<{ ok: true; published: boolean } | { ok: false }> {
  const { data, error } = await sb
    .from("app_legal_documents")
    .select("id")
    .eq("kind", STORE_PARTNER_TERMS_KIND)
    .eq("status", "published")
    .limit(1);
  if (error) {
    if (isMissingAppLegalDocumentsTableError(error.message ?? "")) return { ok: true, published: false };
    return { ok: false };
  }
  return { ok: true, published: Array.isArray(data) && data.length > 0 };
}

/** 법률 문서 원문 (id 목록) — 동의한 버전 원문 보기 */
export async function loadLegalDocumentsByIds(
  sb: AnySb,
  ids: readonly string[]
): Promise<Record<string, StorePartnerTermsDocument>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return {};
  const { data, error } = await sb.from("app_legal_documents").select(APP_LEGAL_DOCUMENT_SELECT).in("id", uniq);
  if (error || !Array.isArray(data)) return {};
  const out: Record<string, StorePartnerTermsDocument> = {};
  for (const raw of data) {
    const row = normalizeAppLegalDocumentRow(raw as Record<string, unknown>);
    if (row) out[row.id] = { id: row.id, version: row.version, locale: row.locale, title: row.title, body: row.body };
  }
  return out;
}

/** 업종(슬러그) → id — `POST /api/me/stores` 와 같은 조회 (활성 1차 업종 + 그 하위 활성 2차 업종) */
export async function resolveStoreTaxonomyIdsBySlug(
  sb: AnySb,
  primarySlug: string,
  subSlug: string
): Promise<{ categoryId: string | null; topicId: string | null }> {
  const p = primarySlug.trim().toLowerCase();
  const s = subSlug.trim().toLowerCase();
  if (!p || !s) return { categoryId: null, topicId: null };
  const { data: cat } = await sb
    .from("store_categories")
    .select("id")
    .eq("slug", p)
    .eq("is_active", true)
    .maybeSingle();
  const categoryId = cat?.id ? String(cat.id) : null;
  if (!categoryId) return { categoryId: null, topicId: null };
  const { data: topic } = await sb
    .from("store_topics")
    .select("id")
    .eq("slug", s)
    .eq("store_category_id", categoryId)
    .eq("is_active", true)
    .maybeSingle();
  const topicId = topic?.id ? String(topic.id) : null;
  // 신청 API 와 같게 — 2차 업종을 못 찾으면 업종 id 를 저장하지 않는다
  return topicId ? { categoryId, topicId } : { categoryId: null, topicId: null };
}

/** 무료 후 요율 — SQL `store_partner_fee_percent_for_taxonomy` (수수료 해석 규칙과 같은 함수) */
export async function resolveStorePartnerFeeAfter(
  sb: AnySb,
  input: { categoryId: string | null; topicId: string | null; storeId?: string | null }
): Promise<{ ok: true; feePercent: number | null; scope: StorePartnerFeeScope | null } | { ok: false }> {
  const { data, error } = await sb.rpc("store_partner_fee_percent_for_taxonomy", {
    p_category_id: input.categoryId,
    p_topic_id: input.topicId,
    p_store_id: input.storeId ?? null,
  });
  if (error) {
    console.error("[store-partner] fee rate read failed", error.message);
    return { ok: false };
  }
  const parsed = parsePartnerFeeResult(data);
  return { ok: true, feePercent: parsed.feePercent, scope: parsed.scope };
}

/** 신청서용 조건 — 배달 오픈 관리의 무료 종료일(진행 중일 때만) + 업종 요율 */
export async function buildStorePartnerOfferForApplication(
  sb: AnySb,
  input: { locale: "ko" | "en"; categoryId: string | null; topicId: string | null }
): Promise<{ ok: true; offer: StorePartnerTermsOffer } | { ok: false; error: string }> {
  const termsRes = await loadCurrentStorePartnerTerms(sb, input.locale);
  if (!termsRes.ok) return { ok: false, error: termsRes.error };
  const settings = await loadDeliveryLaunchSettingsCached();
  const freeUntil = activeFreeUntilOrNull(settings.freeUntil);
  const fee = await resolveStorePartnerFeeAfter(sb, { categoryId: input.categoryId, topicId: input.topicId });
  if (!fee.ok) return { ok: false, error: "fee_rate_read_failed" };
  return {
    ok: true,
    offer: {
      terms: termsRes.terms,
      freeUntil,
      freePromoActive: freeUntil != null,
      feePercentAfter: fee.feePercent,
      feeScope: fee.scope,
    },
  };
}

/**
 * 이미 있는 매장의 조건 (재동의 화면) — 무료 종료일은 배달 오픈 관리 값이 아니라 그 매장 값
 * (어드민 수정값 우선, 없으면 처음 신청 때 서명한 무료 종료일)이며 아직 진행 중일 때만 보여 준다.
 * 약관 게시 전에 입점한 매장에 새로 무료를 약속하지 않기 위해서다.
 * 무료 후 요율은 그 매장 업종(+ 오픈 기념 무료가 아닌 매장 전용 정책) 기준 SQL 함수 값.
 */
export async function buildStorePartnerOfferForStore(
  sb: AnySb,
  input: {
    locale: "ko" | "en";
    storeId: string;
    categoryId: string | null;
    topicId: string | null;
    agreements: readonly StorePartnerAgreementRow[];
    overrideFreeUntil: string | null;
  }
): Promise<{ ok: true; offer: StorePartnerTermsOffer } | { ok: false; error: string }> {
  const termsRes = await loadCurrentStorePartnerTerms(sb, input.locale);
  if (!termsRes.ok) return { ok: false, error: termsRes.error };
  const firstApplication = [...input.agreements].reverse().find((a) => a.source === "application") ?? null;
  const freeUntil = activeFreeUntilOrNull(input.overrideFreeUntil ?? firstApplication?.freeUntil ?? null);
  const fee = await resolveStorePartnerFeeAfter(sb, {
    categoryId: input.categoryId,
    topicId: input.topicId,
    storeId: input.storeId,
  });
  if (!fee.ok) return { ok: false, error: "fee_rate_read_failed" };
  return {
    ok: true,
    offer: {
      terms: termsRes.terms,
      freeUntil,
      freePromoActive: freeUntil != null,
      feePercentAfter: fee.feePercent,
      feeScope: fee.scope,
    },
  };
}

/** 매장의 동의 기록 (최신순) */
export async function listStorePartnerAgreements(
  sb: AnySb,
  storeId: string
): Promise<{ ok: true; rows: StorePartnerAgreementRow[]; tableMissing: boolean } | { ok: false }> {
  const { data, error } = await sb
    .from("store_partner_agreements")
    .select(STORE_PARTNER_AGREEMENT_SELECT)
    .eq("store_id", storeId)
    .order("agreed_at", { ascending: false })
    .limit(50);
  if (error) {
    if (isMissingRelationError(error.message, "store_partner_agreements")) return { ok: true, rows: [], tableMissing: true };
    return { ok: false };
  }
  const rows = (data ?? [])
    .map((r) => normalizeStorePartnerAgreementRow(r as Record<string, unknown>))
    .filter((r): r is StorePartnerAgreementRow => Boolean(r));
  return { ok: true, rows, tableMissing: false };
}

export type StoreLaunchFreeOverride = {
  storeId: string;
  freeUntil: string;
  reason: string;
  updatedBy: string | null;
  updatedAt: string;
};

export async function loadStoreLaunchFreeOverride(
  sb: AnySb,
  storeId: string
): Promise<{ ok: true; override: StoreLaunchFreeOverride | null } | { ok: false }> {
  const { data, error } = await sb
    .from("store_launch_free_overrides")
    .select("store_id, free_until, reason, updated_by, updated_at")
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) {
    if (isMissingRelationError(error.message, "store_launch_free_overrides")) return { ok: true, override: null };
    return { ok: false };
  }
  const row = data as Record<string, unknown> | null;
  const fu = normalizeFreeUntil(row?.free_until);
  if (!row || !fu) return { ok: true, override: null };
  return {
    ok: true,
    override: {
      storeId,
      freeUntil: fu,
      reason: String(row.reason ?? ""),
      updatedBy: typeof row.updated_by === "string" ? row.updated_by : null,
      updatedAt: String(row.updated_at ?? ""),
    },
  };
}

/** 현재 오픈 기념 무료 정책 (보관 안 된 launch_free 매장 정책) */
export async function loadStoreLaunchFreePolicy(
  sb: AnySb,
  storeId: string
): Promise<{ id: string; endsAt: string | null; isActive: boolean } | null> {
  const { data, error } = await sb
    .from("store_fee_policies")
    .select("id, ends_at, is_active, is_archived, created_at")
    .eq("store_id", storeId)
    .eq("memo", STORE_LAUNCH_FREE_POLICY_MEMO)
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const r = data[0] as Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    endsAt: typeof r.ends_at === "string" ? r.ends_at : null,
    isActive: r.is_active === true,
  };
}

export type RecordStorePartnerAgreementInput = {
  storeId: string;
  ownerUserId: string;
  terms: StorePartnerTermsDocument;
  freeUntil: string | null;
  storeCategoryId: string | null;
  storeTopicId: string | null;
  feePercentAfter: number | null;
  source: StorePartnerAgreementSource;
};

/** 동의 기록 1행 (service role · 추가만). 같은 매장·같은 버전이 이미 있으면 `duplicate`. */
export async function recordStorePartnerAgreement(
  sb: AnySb,
  input: RecordStorePartnerAgreementInput
): Promise<{ ok: true; row: StorePartnerAgreementRow } | { ok: false; error: "duplicate" | "insert_failed" }> {
  const { data, error } = await sb
    .from("store_partner_agreements")
    .insert({
      store_id: input.storeId,
      owner_user_id: input.ownerUserId,
      legal_document_id: input.terms.id,
      document_version: input.terms.version,
      body_sha256: legalBodySha256(input.terms.body),
      locale: input.terms.locale,
      free_until: input.freeUntil,
      store_category_id: input.storeCategoryId,
      store_topic_id: input.storeTopicId,
      fee_percent_after: input.feePercentAfter,
      source: input.source,
    })
    .select(STORE_PARTNER_AGREEMENT_SELECT)
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "duplicate" };
    console.error("[store-partner] agreement insert failed", error.message);
    return { ok: false, error: "insert_failed" };
  }
  const row = normalizeStorePartnerAgreementRow((data ?? {}) as Record<string, unknown>);
  if (!row) return { ok: false, error: "insert_failed" };
  return { ok: true, row };
}

/** SQL `admin_upsert_store_launch_free_policy` 호출 결과 */
export type LaunchFreePolicyRpcResult =
  | { ok: true; result: "created" | "updated" | "skipped"; raw: Record<string, unknown> }
  | { ok: false; error: string };

export async function upsertStoreLaunchFreePolicy(
  sb: AnySb,
  input: { storeId: string; freeUntil: string; actorId: string }
): Promise<LaunchFreePolicyRpcResult> {
  const { data, error } = await sb.rpc("admin_upsert_store_launch_free_policy", {
    p_store_id: input.storeId,
    p_free_until: input.freeUntil,
    p_actor: input.actorId,
  });
  if (error) {
    console.error("[store-partner] launch free policy rpc failed", error.message);
    return { ok: false, error: "rpc_failed" };
  }
  const raw = (data ?? {}) as Record<string, unknown>;
  if (raw.ok !== true) return { ok: false, error: String(raw.error ?? "rpc_failed") };
  const result = raw.result === "updated" ? "updated" : raw.result === "skipped" ? "skipped" : "created";
  return { ok: true, result, raw };
}

/**
 * 매장 종류 (`stores.store_kind`, 20270707130000) — 실매장만 계약·무료 정책 대상.
 * 열이 없는 환경(구 스키마)은 실매장으로 본다. 그 밖의 읽기 실패도 실매장(= 검사 적용, 안전 쪽).
 */
export async function loadStoreKindForPartnerGate(sb: AnySb, storeId: string): Promise<string> {
  const { data, error } = await sb.from("stores").select("store_kind").eq("id", storeId).maybeSingle();
  if (error || !data) return "real";
  const k = String((data as { store_kind?: unknown }).store_kind ?? "").trim();
  return k || "real";
}

export type ApprovePartnerGateMeta = {
  /** 게시된 store_partner_terms 가 있어 동의 검사를 했는지 (false = 약관 게시 전 → 검사 건너뜀) */
  partner_terms_published: boolean;
  partner_agreement_count: number;
  /** 샘플·테스트 매장 → 검사·무료 정책 모두 건너뜀 */
  skipped_non_real_store: boolean;
  launch_free_until: string | null;
  launch_free_source: "override" | "agreement" | null;
  launch_free_policy: LaunchFreePolicyRpcResult | null;
};

/**
 * 입점 승인(approve_store) 직전 게이트 — 반드시 승인 상태 변경 **전에** 호출한다.
 * (a) 게시된 약관이 있으면 동의 기록 1건 이상 필수 → 없으면 409 `partner_agreement_required`.
 *     게시된 약관이 아예 없으면 검사를 건너뛰고 meta 로 알린다 (약관 게시 전 기존 흐름 유지).
 * (b) 무료 종료일(어드민 수정값 우선, 없으면 최신 동의)이 오늘 이후면 0% 정책 생성 →
 *     실패하면 500 `launch_free_policy_failed` (승인하지 않는다).
 */
export async function runApproveStorePartnerGate(
  sb: AnySb,
  input: { storeId: string; storeKind: string | null | undefined; actorId: string; now?: Date }
): Promise<{ ok: true; meta: ApprovePartnerGateMeta } | { ok: false; status: 409 | 500; error: string }> {
  const kind = String(input.storeKind ?? "real").trim() || "real";
  const meta: ApprovePartnerGateMeta = {
    partner_terms_published: false,
    partner_agreement_count: 0,
    skipped_non_real_store: kind !== "real",
    launch_free_until: null,
    launch_free_source: null,
    launch_free_policy: null,
  };
  if (kind !== "real") return { ok: true, meta };

  const published = await hasAnyPublishedStorePartnerTerms(sb);
  if (!published.ok) return { ok: false, status: 500, error: "partner_terms_read_failed" };
  meta.partner_terms_published = published.published;

  const agreements = await listStorePartnerAgreements(sb, input.storeId);
  if (!agreements.ok) return { ok: false, status: 500, error: "partner_agreement_read_failed" };
  meta.partner_agreement_count = agreements.rows.length;
  if (published.published && agreements.rows.length === 0) {
    return { ok: false, status: 409, error: PARTNER_AGREEMENT_REQUIRED_ERROR };
  }

  const ov = await loadStoreLaunchFreeOverride(sb, input.storeId);
  if (!ov.ok) return { ok: false, status: 500, error: "launch_free_override_read_failed" };
  const latest = agreements.rows[0] ?? null;
  const freeUntil = resolveLaunchFreeUntilForApproval({
    overrideFreeUntil: ov.override?.freeUntil,
    latestAgreementFreeUntil: latest?.freeUntil,
  });
  meta.launch_free_until = freeUntil;
  meta.launch_free_source = ov.override ? "override" : freeUntil ? "agreement" : null;

  if (freeUntil && shouldCreateLaunchFreePolicy(freeUntil, input.now)) {
    const rpc = await upsertStoreLaunchFreePolicy(sb, {
      storeId: input.storeId,
      freeUntil,
      actorId: input.actorId,
    });
    meta.launch_free_policy = rpc;
    if (!rpc.ok) return { ok: false, status: 500, error: LAUNCH_FREE_POLICY_FAILED_ERROR };
  }
  return { ok: true, meta };
}
