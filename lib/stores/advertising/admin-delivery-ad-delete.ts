/**
 * AL-01 · 보완 설계 §4-3 — 배달 광고 관리자 「초안 삭제」 단일 함수 (공통 광고 화면 · 배달 도메인 상세 공용).
 *
 * 삭제 가능 = 운영자 직접 등록(DIBAY_FIRST_PARTY) · 초안(DRAFT) · 노출·클릭·주문 귀속 0 · 돈(원장·결제) 0 · 문의 건 0
 *            · 막는 감사 행 0 (생성·초안 편집 감사 행은 막지 않는다 — 사장님 경로 `deleteOwnerSponsoredDraft` 와 같은 규칙).
 *
 * AD2-10 · AD2-11 (2026-11-07) — 사유(2자 이상) 필수 · 이력 검사·삭제·감사 1행은 DB 함수
 * `admin_delivery_ad_delete_draft(p_campaign, p_admin, p_reason)` 한 트랜잭션에서만 한다
 * (예전: TS 가 여러 요청으로 세고 지우고 감사 insert 오류를 확인하지 않았다 → 감사 실패여도 삭제가 남았다).
 * TS 는 같은 판(상태·updated_at) 확인과 오류 코드 정리만 한다. 함수가 없는 DB 에서는 삭제하지 않는다(2단계 폴백 없음).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BANNER_AD_CAMPAIGN_TABLE,
  STORE_SPONSORED_CAMPAIGN_TABLE,
} from "@/lib/stores/advertising/delivery-ad-domain";
import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import { parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";

export type AdminDeliveryAdDeleteProduct = "banner" | "store_sponsored";

export type AdminDeliveryAdDeleteError =
  | "invalid_product"
  | "campaign_not_found"
  | "not_admin_direct"
  | "not_draft"
  | "stale_lifecycle"
  | "stale_updated_at"
  | "delete_blocked_funding_secured"
  | "delete_not_allowed"
  /** AD2-10 — 삭제 사유(2자 이상) 없음. */
  | "reason_required"
  | "forbidden"
  /** AD2-11 — DB 함수가 없음(삭제하지 않음). */
  | "rpc_missing"
  | "delete_failed"
  | "db_error";

const HTTP_STATUS: Record<AdminDeliveryAdDeleteError, number> = {
  invalid_product: 400,
  campaign_not_found: 404,
  not_admin_direct: 422,
  not_draft: 422,
  stale_lifecycle: 409,
  stale_updated_at: 409,
  delete_blocked_funding_secured: 409,
  delete_not_allowed: 422,
  reason_required: 400,
  forbidden: 403,
  rpc_missing: 503,
  delete_failed: 500,
  db_error: 500,
};

function fail(error: AdminDeliveryAdDeleteError): { ok: false; error: string; httpStatus: number } {
  return { ok: false, error, httpStatus: HTTP_STATUS[error] };
}

/** 운영자 직접 등록 값 (`campaign_source` · P0-A 마이그레이션 `..._p0a_commercial_package_partner.sql`). */
export const ADMIN_DIRECT_CAMPAIGN_SOURCE = "DIBAY_FIRST_PARTY" as const;

/**
 * 삭제를 막지 않는 감사 이름 — 초안을 만들고 고치는 기록뿐이다.
 * (초안으로 되돌아가는 전이는 없으므로 지금 DRAFT 인 캠페인의 편집 기록은 모두 초안 단계 기록이다.)
 * 그 밖의 이름(제출·심사·승인·노출·정지·종료·환불 등)은 모두 막는다.
 */
const NON_BLOCKING_AUDIT_ACTIONS = new Set<string>([
  // 사장님 생성·초안 편집 (cut_e / cut_j RPC)
  "owner_sponsored_create_draft",
  "owner_sponsored_update_draft",
  "owner_banner_create_draft",
  "owner_banner_update_draft",
  // 운영자 직접 등록 생성 (delivery-ad-admin-first-party-writer)
  "admin_first_party_banner_create",
  // 관리자 초안 편집 (admin-delivery-ad-writer)
  "updated",
  "inventory_changed",
  "creative_replaced",
  "destination_changed",
  "creative_removed",
]);

export function isBlockingDeliveryAdDeleteAudit(action: string): boolean {
  const a = action.trim();
  if (!a) return false;
  if (a.startsWith("draft_")) return false;
  return !NON_BLOCKING_AUDIT_ACTIONS.has(a);
}

/** 이력 표 — 하나라도 행이 있으면 삭제 불가 (DB 함수 `admin_delivery_ad_delete_draft` 가 같은 표를 센다 · 기준 목록). */
export const DELIVERY_AD_DELETE_HISTORY_TABLES: ReadonlyArray<{ table: string; campaignCol: string; hasProductKind: boolean }> = [
  { table: "delivery_ad_impression_events", campaignCol: "campaign_id", hasProductKind: true },
  { table: "delivery_ad_click_events", campaignCol: "campaign_id", hasProductKind: true },
  { table: "delivery_ad_order_attributions", campaignCol: "campaign_id", hasProductKind: true },
  { table: "delivery_ad_charge_ledger", campaignCol: "campaign_id", hasProductKind: true },
  { table: "delivery_ad_refund_ledger", campaignCol: "campaign_id", hasProductKind: false },
  { table: "delivery_ad_business_cash_ledger", campaignCol: "campaign_id", hasProductKind: true },
  { table: "delivery_ad_campaign_fundings", campaignCol: "campaign_id", hasProductKind: true },
  { table: "delivery_ad_store_cash_spends", campaignCol: "campaign_id", hasProductKind: true },
  { table: "delivery_ad_canonical_bc_fundings", campaignCol: "application_id", hasProductKind: true },
];

export const ADMIN_DELIVERY_AD_DELETE_DRAFT_RPC = "admin_delivery_ad_delete_draft" as const;

const RPC_ERROR_CODES = new Set<AdminDeliveryAdDeleteError>([
  "campaign_not_found",
  "not_admin_direct",
  "not_draft",
  "delete_blocked_funding_secured",
  "delete_not_allowed",
  "reason_required",
  "forbidden",
]);

function mapRpcError(raw: unknown): AdminDeliveryAdDeleteError {
  const code = String(raw ?? "").trim();
  if (code === "not_found") return "campaign_not_found";
  if (code === "not_admin") return "forbidden";
  if (code === "funding_secured") return "delete_blocked_funding_secured";
  if (code === "has_history" || code === "history_exists") return "delete_not_allowed";
  return RPC_ERROR_CODES.has(code as AdminDeliveryAdDeleteError)
    ? (code as AdminDeliveryAdDeleteError)
    : "delete_failed";
}

function isMissingRpc(error: { code?: string; message?: string }): boolean {
  const msg = String(error.message ?? "");
  return error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(msg);
}

export async function adminDeleteDeliveryAdDraftGuarded(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    productKind: "banner" | "store_sponsored";
    campaignId: string;
    expectedLifecycle: DeliveryAdLifecycleStatus;
    expectedUpdatedAt: string;
    reason: string | null;
  }
): Promise<{ ok: true; campaignId: string } | { ok: false; error: string; httpStatus: number }> {
  const product = input.productKind;
  if (product !== "banner" && product !== "store_sponsored") return fail("invalid_product");
  const reason = parseAdminReason(input.reason);
  if (!reason) return fail("reason_required");
  const table = product === "banner" ? BANNER_AD_CAMPAIGN_TABLE : STORE_SPONSORED_CAMPAIGN_TABLE;

  const { data: row, error: loadErr } = await sb
    .from(table)
    .select("id, lifecycle_status, updated_at, campaign_source")
    .eq("id", input.campaignId)
    .maybeSingle();
  if (loadErr) return fail("db_error");
  if (!row) return fail("campaign_not_found");
  const r = row as unknown as {
    lifecycle_status?: string;
    updated_at?: string;
    campaign_source?: string | null;
  };

  // 사장님 유료 광고는 이 함수로 완전 삭제하지 않는다(§4-2 · 돈 이력) — DB 기본값 OWNER_PAID.
  if (String(r.campaign_source ?? "OWNER_PAID") !== ADMIN_DIRECT_CAMPAIGN_SOURCE) {
    return fail("not_admin_direct");
  }
  const lifecycle = String(r.lifecycle_status ?? "");
  if (lifecycle !== input.expectedLifecycle) return fail("stale_lifecycle");
  if (String(r.updated_at ?? "") !== input.expectedUpdatedAt) return fail("stale_updated_at");
  if (lifecycle !== "DRAFT") return fail("not_draft");

  const { data, error } = await sb.rpc(ADMIN_DELIVERY_AD_DELETE_DRAFT_RPC, {
    p_campaign: input.campaignId,
    p_admin: input.adminUserId,
    p_reason: reason,
  });
  if (error) {
    // DB 원문은 내보내지 않는다 — 함수 없음만 구분.
    return fail(isMissingRpc(error) ? "rpc_missing" : "db_error");
  }
  const payload = (data ?? null) as { ok?: unknown; error?: unknown } | null;
  if (!payload || payload.ok !== true) return fail(mapRpcError(payload?.error));
  return { ok: true, campaignId: input.campaignId };
}
