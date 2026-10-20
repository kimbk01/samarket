/**
 * PRODUCT CUT 3-D — Admin Action Queue read model for Delivery Ads ops Cases.
 * Derived from delivery_ad_operations_cases.status = WAITING_ADMIN (R7: DB RPC 페이지 + 정확한 total).
 * Owner-paid intake also requires canonical funding readiness (Stage 1 AST-005),
 * using the same FUNDED / first-party authority as customer go-live.
 * No queue table · no lifecycle mutation · no UI.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DELIVERY_AD_OPERATIONS_CASE_TABLE,
  type DeliveryAdOperationsCaseStatus,
} from "@/lib/stores/advertising/delivery-ad-operations-case";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import {
  BANNER_AD_CAMPAIGN_TABLE,
  STORE_SPONSORED_CAMPAIGN_TABLE,
  isDeliveryAdProductKind,
  type DeliveryAdProductKind,
} from "@/lib/stores/advertising/delivery-ad-domain";
import { isDeliveryAdFundingReadyForGoLive } from "@/lib/stores/advertising/delivery-ad-business-cash-contract";
import { DELIVERY_BANNER_CREATIVE_READINESS } from "@/lib/stores/advertising/delivery-ad-banner-creative-readiness";
import type { DeliveryAdFundingStatus } from "@/lib/stores/advertising/delivery-ad-business-cash-contract";

export const DELIVERY_AD_ADMIN_ACTION_QUEUE_DEFAULT_LIMIT = 50 as const;
export const DELIVERY_AD_ADMIN_ACTION_QUEUE_MAX_LIMIT = 100 as const;

export type DeliveryAdAdminActionQueueItem = {
  caseId: string;
  threadId: string | null;
  productKind: DeliveryAdProductKind;
  campaignId: string;
  caseStatus: DeliveryAdOperationsCaseStatus;
  ownerUserId: string;
  campaignTitle: string | null;
  campaignLifecycle: string | null;
  /** Banner image_url / creative path for 제작 필요 presentation (null for Store Promotion). */
  creativeAssetPath: string | null;
  /** Soft resubmit signal: prior Admin review notes present. */
  hadChangesRequested: boolean;
  /** Store context for B3 Statement deeplink (null when campaign has no store). */
  storeId: string | null;
  /** Human store name when available (presentation). */
  storeName: string | null;
  startAt: string | null;
  endAt: string | null;
  fundingStatus: DeliveryAdFundingStatus | null;
  updatedAt: string;
  destination: string;
};

export type ListDeliveryAdAdminActionQueueResult =
  | { ok: true; items: DeliveryAdAdminActionQueueItem[]; total: number }
  | { ok: false; error: "forbidden" | "db_error" };

/**
 * Admin funded-review intake gate — same funding authority as customer go-live.
 * First-party: always allowed. Owner-paid: FUNDED only (canonical Cash SECURED → FUNDED,
 * or a migrated historical funding record).
 */
export function deliveryAdAdminQueueFundingAllowsIntake(input: {
  campaignSource: string | null | undefined;
  fundingStatus: DeliveryAdFundingStatus | null | undefined;
}): boolean {
  return isDeliveryAdFundingReadyForGoLive(input);
}

/**
 * Count WAITING_ADMIN Delivery Ads ops cases (Admin Action Queue SSOT fragment).
 * Note: badge count is status-only; list filters unfunded Owner-paid rows at read time.
 */
export async function countDeliveryAdAdminActionQueue(
  sb: SupabaseClient
): Promise<number> {
  const { count, error } = await sb
    .from(DELIVERY_AD_OPERATIONS_CASE_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("status", "WAITING_ADMIN");
  if (error) return 0;
  return Math.max(0, Math.floor(Number(count) || 0));
}

export const DELIVERY_AD_ADMIN_ACTION_QUEUE_RPC = "admin_delivery_ad_action_queue_page";

/**
 * R7 — 처리 Case 목록 서버 페이지. 결제 확인(FUNDED·디바이 직접) 필터·정렬·페이지·전체 건수는
 * DB RPC(`admin_delivery_ad_action_queue_page`) 한 번 — 페이지를 자른 뒤 결제 필터로 줄이지 않는다.
 * `total` = 결제 확인된 WAITING_ADMIN Case 전체 건수.
 */
export async function listDeliveryAdAdminActionQueue(
  sb: SupabaseClient,
  input?: { limit?: number; offset?: number; productKind?: unknown }
): Promise<ListDeliveryAdAdminActionQueueResult> {
  let limit: number = DELIVERY_AD_ADMIN_ACTION_QUEUE_DEFAULT_LIMIT;
  if (typeof input?.limit === "number" && Number.isFinite(input.limit)) {
    limit = Math.max(
      1,
      Math.min(DELIVERY_AD_ADMIN_ACTION_QUEUE_MAX_LIMIT, Math.floor(input.limit))
    );
  }
  const offset =
    typeof input?.offset === "number" && Number.isFinite(input.offset) && input.offset > 0
      ? Math.min(100_000, Math.floor(input.offset))
      : 0;

  const { data, error } = await sb.rpc(DELIVERY_AD_ADMIN_ACTION_QUEUE_RPC, {
    p_product_kind: isDeliveryAdProductKind(input?.productKind) ? input.productKind : null,
    p_pending_asset: DELIVERY_BANNER_CREATIVE_READINESS.pendingAssetPath,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) return { ok: false, error: "db_error" };
  const payload = (data ?? {}) as { total?: unknown; rows?: unknown };
  const rows = (Array.isArray(payload.rows) ? payload.rows : []) as Record<string, unknown>[];
  const totalRaw = Number(payload.total);

  type Pending = {
    caseId: string;
    productKind: DeliveryAdProductKind;
    campaignId: string;
    ownerUserId: string;
    updatedAt: string;
    fundingStatus: DeliveryAdFundingStatus;
  };
  const pending: Pending[] = [];
  for (const row of rows) {
    const productKind = row.product_kind;
    if (!isDeliveryAdProductKind(productKind)) continue;
    const campaignId = String(row.campaign_id ?? "");
    const caseId = String(row.case_id ?? "");
    if (!campaignId || !caseId) continue;
    const funding = String(row.funding_status ?? "");
    pending.push({
      caseId,
      productKind,
      campaignId,
      ownerUserId: String(row.owner_user_id ?? ""),
      updatedAt: String(row.updated_at ?? ""),
      fundingStatus: funding === "FUNDED" || funding === "REFUNDED" ? funding : "UNFUNDED",
    });
  }

  const items: DeliveryAdAdminActionQueueItem[] = [];

  for (const row of pending) {
    const table =
      row.productKind === "store_sponsored"
        ? STORE_SPONSORED_CAMPAIGN_TABLE
        : BANNER_AD_CAMPAIGN_TABLE;
    const { data: camp } = await sb
      .from(table)
      .select(
        "id, title, lifecycle_status, image_url, review_notes, campaign_source, store_id, start_at, end_at"
      )
      .eq("id", row.campaignId)
      .maybeSingle();

    const campRow = camp as {
      title?: string;
      lifecycle_status?: string;
      image_url?: string | null;
      review_notes?: string | null;
      campaign_source?: string | null;
      store_id?: string | null;
      start_at?: string | null;
      end_at?: string | null;
    } | null;

    // 결제 확인 필터는 RPC 가 이미 적용했다 (`deliveryAdAdminQueueFundingAllowsIntake` 와 같은 규칙).
    const fundingStatus = row.fundingStatus;

    const storeId =
      campRow?.store_id == null || !String(campRow.store_id).trim()
        ? null
        : String(campRow.store_id);
    let storeName: string | null = null;
    if (storeId) {
      const { data: store } = await sb
        .from("stores")
        .select("store_name")
        .eq("id", storeId)
        .maybeSingle();
      storeName =
        store && typeof (store as { store_name?: string }).store_name === "string"
          ? String((store as { store_name: string }).store_name)
          : null;
    }

    const { data: thread } = await sb
      .from("delivery_ad_operations_threads")
      .select("id")
      .eq("case_id", row.caseId)
      .maybeSingle();

    const reviewNotes =
      campRow?.review_notes == null ? "" : String(campRow.review_notes).trim();

    items.push({
      caseId: row.caseId,
      threadId: thread?.id == null ? null : String(thread.id),
      productKind: row.productKind,
      campaignId: row.campaignId,
      caseStatus: "WAITING_ADMIN",
      ownerUserId: row.ownerUserId,
      campaignTitle:
        campRow && typeof campRow.title === "string" ? String(campRow.title) : null,
      campaignLifecycle:
        campRow && typeof campRow.lifecycle_status === "string"
          ? String(campRow.lifecycle_status)
          : null,
      creativeAssetPath:
        row.productKind === "banner" && campRow?.image_url != null
          ? String(campRow.image_url)
          : null,
      hadChangesRequested: reviewNotes.length > 0,
      storeId,
      storeName,
      startAt:
        campRow?.start_at == null ? null : String(campRow.start_at),
      endAt: campRow?.end_at == null ? null : String(campRow.end_at),
      fundingStatus,
      updatedAt: row.updatedAt,
      destination: DELIVERY_AD_ADMIN_ROUTES.detail(row.campaignId),
    });
  }

  return {
    ok: true,
    items,
    total: Number.isFinite(totalRaw) && totalRaw >= 0 ? totalRaw : items.length,
  };
}
