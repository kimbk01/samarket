/**
 * AL-01 · 보완 설계 §4-3 — 배달 광고 관리자 「초안 삭제」 단일 함수 (공통 광고 화면 · 배달 도메인 상세 공용).
 *
 * 삭제 가능 = 운영자 직접 등록(DIBAY_FIRST_PARTY) · 초안(DRAFT) · 노출·클릭·주문 귀속 0 · 돈(원장·결제) 0 · 문의 건 0
 *            · 막는 감사 행 0 (생성·초안 편집 감사 행은 막지 않는다 — 사장님 경로 `deleteOwnerSponsoredDraft` 와 같은 규칙).
 * 서버가 **삭제 전에** 위 표를 센다(호출하는 쪽이 이력 값을 넘기지 않는다). 연쇄 삭제되는 문의 건(`delivery_ad_operations_cases`
 * ON DELETE CASCADE)이 있으면 삭제하지 않는다. 지면 연결·소재(`delivery_ad_creatives`)도 함께 정리하고 감사 1행을 남긴다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BANNER_AD_CAMPAIGN_TABLE,
  STORE_SPONSORED_CAMPAIGN_TABLE,
} from "@/lib/stores/advertising/delivery-ad-domain";
import { DELIVERY_AD_AUDIT_LOG_TABLE } from "@/lib/stores/advertising/delivery-ad-audit";
import { DELIVERY_AD_CREATIVE_TABLE } from "@/lib/stores/advertising/delivery-ad-creative";
import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import { hasCanonicalBcFundingSecured } from "@/lib/stores/advertising/canonical-business-cash-writer";

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
  db_error: 500,
};

function fail(error: AdminDeliveryAdDeleteError): { ok: false; error: string; httpStatus: number } {
  return { ok: false, error, httpStatus: HTTP_STATUS[error] };
}

/** 운영자 직접 등록 값 (`campaign_source` · P0-A 마이그레이션 `..._p0a_commercial_package_partner.sql`). */
export const ADMIN_DIRECT_CAMPAIGN_SOURCE = "DIBAY_FIRST_PARTY" as const;

const JUNCTION_TABLE: Record<AdminDeliveryAdDeleteProduct, string> = {
  banner: "delivery_banner_campaign_inventories",
  store_sponsored: "delivery_store_sponsored_campaign_inventories",
};

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

/** 이력 표 — 하나라도 행이 있으면 삭제 불가. `product_kind` 칸이 없는 표는 campaign_id 만 본다. */
const HISTORY_TABLES: ReadonlyArray<{ table: string; campaignCol: string; hasProductKind: boolean }> = [
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

async function countRows(
  sb: SupabaseClient,
  table: string,
  filters: Record<string, string>
): Promise<{ ok: true; count: number } | { ok: false }> {
  let q = sb.from(table).select("id", { count: "exact", head: true });
  for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
  const { count, error } = await q;
  if (error) return { ok: false };
  return { ok: true, count: count ?? 0 };
}

/** 소재 이전 판(supersedes 사슬)까지 모은다 — 초안 편집 중 소재 교체로 생긴 이전 판도 같이 정리. */
async function collectCreativeChain(
  sb: SupabaseClient,
  headId: string | null
): Promise<string[]> {
  const ids: string[] = [];
  let cur = headId;
  for (let i = 0; cur && i < 20 && !ids.includes(cur); i += 1) {
    ids.push(cur);
    const { data } = await sb
      .from(DELIVERY_AD_CREATIVE_TABLE)
      .select("id, supersedes_creative_id")
      .eq("id", cur)
      .maybeSingle();
    const prev = (data as { supersedes_creative_id?: string | null } | null)?.supersedes_creative_id;
    cur = prev ? String(prev) : null;
  }
  return ids;
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
  const table = product === "banner" ? BANNER_AD_CAMPAIGN_TABLE : STORE_SPONSORED_CAMPAIGN_TABLE;

  const { data: row, error: loadErr } = await sb
    .from(table)
    .select(
      product === "banner"
        ? "id, lifecycle_status, updated_at, campaign_source, creative_id"
        : "id, lifecycle_status, updated_at, campaign_source"
    )
    .eq("id", input.campaignId)
    .maybeSingle();
  if (loadErr) return fail("db_error");
  if (!row) return fail("campaign_not_found");
  const r = row as unknown as {
    lifecycle_status?: string;
    updated_at?: string;
    campaign_source?: string | null;
    creative_id?: string | null;
  };

  // 사장님 유료 광고는 관리자 삭제 없음(§4-2 · 돈 이력) — DB 기본값 OWNER_PAID.
  if (String(r.campaign_source ?? "OWNER_PAID") !== ADMIN_DIRECT_CAMPAIGN_SOURCE) {
    return fail("not_admin_direct");
  }
  const lifecycle = String(r.lifecycle_status ?? "");
  if (lifecycle !== input.expectedLifecycle) return fail("stale_lifecycle");
  if (String(r.updated_at ?? "") !== input.expectedUpdatedAt) return fail("stale_updated_at");
  if (lifecycle !== "DRAFT") return fail("not_draft");

  // F-09 — 결제된(SECURED) 캐시는 먼저 환불해야 한다.
  if (await hasCanonicalBcFundingSecured(sb, { productKind: product, applicationId: input.campaignId })) {
    return fail("delete_blocked_funding_secured");
  }

  // 노출·클릭·귀속·원장·결제 이력 — 서버가 센다.
  for (const h of HISTORY_TABLES) {
    const filters: Record<string, string> = { [h.campaignCol]: input.campaignId };
    if (h.hasProductKind) filters.product_kind = product;
    const c = await countRows(sb, h.table, filters);
    if (!c.ok) return fail("db_error");
    if (c.count > 0) return fail("delete_not_allowed");
  }

  // 문의 건 — 캠페인 삭제 시 ON DELETE CASCADE 로 같이 지워지므로 1건이라도 있으면 삭제하지 않는다.
  const cases = await countRows(sb, "delivery_ad_operations_cases", {
    product_kind: product,
    [product === "banner" ? "banner_campaign_id" : "store_sponsored_campaign_id"]: input.campaignId,
  });
  if (!cases.ok) return fail("db_error");
  if (cases.count > 0) return fail("delete_not_allowed");

  // 막는 감사 행 (생성·초안 편집 기록은 막지 않음).
  const { data: audits, error: auditErr } = await sb
    .from(DELIVERY_AD_AUDIT_LOG_TABLE)
    .select("action")
    .eq("campaign_id", input.campaignId)
    .eq("product_kind", product);
  if (auditErr) return fail("db_error");
  const blocking = (audits ?? []).some((a) =>
    isBlockingDeliveryAdDeleteAudit(String((a as { action?: string }).action ?? ""))
  );
  if (blocking) return fail("delete_not_allowed");

  const creativeIds =
    product === "banner" ? await collectCreativeChain(sb, r.creative_id ? String(r.creative_id) : null) : [];

  // 캠페인 행 먼저 — 조건(초안·직접 등록·같은 판)이 그대로일 때만 지운다. 0행이면 그 사이 바뀐 것.
  const { data: deletedRows, error: delErr } = await sb
    .from(table)
    .delete()
    .eq("id", input.campaignId)
    .eq("lifecycle_status", "DRAFT")
    .eq("campaign_source", ADMIN_DIRECT_CAMPAIGN_SOURCE)
    .eq("updated_at", input.expectedUpdatedAt)
    .select("id");
  if (delErr) return fail("db_error");
  if (!Array.isArray(deletedRows) || deletedRows.length === 0) return fail("stale_updated_at");

  // 지면 연결 — FK ON DELETE CASCADE 로 이미 지워지지만 남은 행이 없게 한 번 더 정리.
  await sb.from(JUNCTION_TABLE[product]).delete().eq("campaign_id", input.campaignId);

  // 소재 정리 — 다른 캠페인이 같은 소재를 가리키면 남긴다.
  const creativesDeleted: string[] = [];
  for (const cid of creativeIds) {
    const ref = await countRows(sb, BANNER_AD_CAMPAIGN_TABLE, { creative_id: cid });
    if (!ref.ok || ref.count > 0) continue;
    const { error: cErr } = await sb.from(DELIVERY_AD_CREATIVE_TABLE).delete().eq("id", cid);
    if (!cErr) creativesDeleted.push(cid);
  }

  await sb.from(DELIVERY_AD_AUDIT_LOG_TABLE).insert({
    product_kind: product,
    campaign_id: input.campaignId,
    actor_type: "admin",
    actor_user_id: input.adminUserId,
    action: "deleted_safe_draft",
    before_json: {
      lifecycle,
      campaign_source: ADMIN_DIRECT_CAMPAIGN_SOURCE,
      creative_ids: creativeIds,
    },
    after_json: { deleted: true, creatives_deleted: creativesDeleted },
    reason: input.reason?.trim() || null,
  });

  return { ok: true, campaignId: input.campaignId };
}
