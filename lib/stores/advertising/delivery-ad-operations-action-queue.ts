/**
 * PRODUCT CUT 3-D — Admin Action Queue read model for Delivery Ads ops Cases.
 * Derived from delivery_ad_operations_cases.status = WAITING_ADMIN.
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
import { loadDeliveryAdFundingStatusByCampaignIds } from "@/lib/stores/advertising/load-delivery-ad-campaign-funding-status";
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
  updatedAt: string;
  destination: string;
};

export type ListDeliveryAdAdminActionQueueResult =
  | { ok: true; items: DeliveryAdAdminActionQueueItem[]; total: number }
  | { ok: false; error: "forbidden" | "db_error" };

/**
 * Admin funded-review intake gate — same funding authority as customer go-live.
 * First-party: always allowed. Owner-paid: FUNDED only (canonical BC SECURED → FUNDED,
 * or legacy Store Cash FUNDED for history).
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

export async function listDeliveryAdAdminActionQueue(
  sb: SupabaseClient,
  input?: { limit?: number; productKind?: unknown }
): Promise<ListDeliveryAdAdminActionQueueResult> {
  let limit: number = DELIVERY_AD_ADMIN_ACTION_QUEUE_DEFAULT_LIMIT;
  if (typeof input?.limit === "number" && Number.isFinite(input.limit)) {
    limit = Math.max(
      1,
      Math.min(DELIVERY_AD_ADMIN_ACTION_QUEUE_MAX_LIMIT, Math.floor(input.limit))
    );
  }

  let q = sb
    .from(DELIVERY_AD_OPERATIONS_CASE_TABLE)
    .select(
      "id, product_kind, store_sponsored_campaign_id, banner_campaign_id, owner_user_id, status, updated_at"
    )
    .eq("status", "WAITING_ADMIN")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (isDeliveryAdProductKind(input?.productKind)) {
    q = q.eq("product_kind", input.productKind);
  }

  const { data, error } = await q;
  if (error) return { ok: false, error: "db_error" };

  const rows = (data ?? []) as Record<string, unknown>[];
  type Pending = {
    caseId: string;
    productKind: DeliveryAdProductKind;
    campaignId: string;
    ownerUserId: string;
    updatedAt: string;
  };
  const pending: Pending[] = [];

  for (const row of rows) {
    const productKind = row.product_kind;
    if (!isDeliveryAdProductKind(productKind)) continue;
    const campaignId =
      productKind === "store_sponsored"
        ? row.store_sponsored_campaign_id == null
          ? ""
          : String(row.store_sponsored_campaign_id)
        : row.banner_campaign_id == null
          ? ""
          : String(row.banner_campaign_id);
    if (!campaignId) continue;
    const caseId = String(row.id ?? "");
    if (!caseId) continue;
    pending.push({
      caseId,
      productKind,
      campaignId,
      ownerUserId: String(row.owner_user_id ?? ""),
      updatedAt: String(row.updated_at ?? ""),
    });
  }

  const sponsoredIds = [
    ...new Set(
      pending.filter((p) => p.productKind === "store_sponsored").map((p) => p.campaignId)
    ),
  ];
  const bannerIds = [
    ...new Set(pending.filter((p) => p.productKind === "banner").map((p) => p.campaignId)),
  ];

  const [sponsoredFunding, bannerFunding] = await Promise.all([
    loadDeliveryAdFundingStatusByCampaignIds(sb, {
      productKind: "store_sponsored",
      campaignIds: sponsoredIds,
    }),
    loadDeliveryAdFundingStatusByCampaignIds(sb, {
      productKind: "banner",
      campaignIds: bannerIds,
    }),
  ]);

  const items: DeliveryAdAdminActionQueueItem[] = [];

  for (const row of pending) {
    const table =
      row.productKind === "store_sponsored"
        ? STORE_SPONSORED_CAMPAIGN_TABLE
        : BANNER_AD_CAMPAIGN_TABLE;
    const { data: camp } = await sb
      .from(table)
      .select("id, title, lifecycle_status, image_url, review_notes, campaign_source, store_id")
      .eq("id", row.campaignId)
      .maybeSingle();

    const campRow = camp as {
      title?: string;
      lifecycle_status?: string;
      image_url?: string | null;
      review_notes?: string | null;
      campaign_source?: string | null;
      store_id?: string | null;
    } | null;

    const fundingMap =
      row.productKind === "store_sponsored" ? sponsoredFunding : bannerFunding;
    const fundingStatus = fundingMap.get(row.campaignId) ?? "UNFUNDED";
    if (
      !deliveryAdAdminQueueFundingAllowsIntake({
        campaignSource: campRow?.campaign_source,
        fundingStatus,
      })
    ) {
      continue;
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
      updatedAt: row.updatedAt,
      destination: DELIVERY_AD_ADMIN_ROUTES.detail(row.campaignId),
    });
  }

  return { ok: true, items, total: items.length };
}
