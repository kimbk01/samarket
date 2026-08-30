/**
 * PRODUCT CUT 3-D — Admin Action Queue read model for Delivery Ads ops Cases.
 * Derived from delivery_ad_operations_cases.status = WAITING_ADMIN.
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
  updatedAt: string;
  destination: string;
};

export type ListDeliveryAdAdminActionQueueResult =
  | { ok: true; items: DeliveryAdAdminActionQueueItem[]; total: number }
  | { ok: false; error: "forbidden" | "db_error" };

/**
 * Count WAITING_ADMIN Delivery Ads ops cases (Admin Action Queue SSOT fragment).
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

  let totalQ = sb
    .from(DELIVERY_AD_OPERATIONS_CASE_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("status", "WAITING_ADMIN");
  if (isDeliveryAdProductKind(input?.productKind)) {
    totalQ = totalQ.eq("product_kind", input.productKind);
  }
  const totalRes = await totalQ;
  const total = Math.max(0, Math.floor(Number(totalRes.count) || 0));

  const rows = (data ?? []) as Record<string, unknown>[];
  const items: DeliveryAdAdminActionQueueItem[] = [];

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

    const table =
      productKind === "store_sponsored"
        ? STORE_SPONSORED_CAMPAIGN_TABLE
        : BANNER_AD_CAMPAIGN_TABLE;
    const { data: camp } = await sb
      .from(table)
      .select("id, title, lifecycle_status")
      .eq("id", campaignId)
      .maybeSingle();

    const { data: thread } = await sb
      .from("delivery_ad_operations_threads")
      .select("id")
      .eq("case_id", caseId)
      .maybeSingle();

    items.push({
      caseId,
      threadId: thread?.id == null ? null : String(thread.id),
      productKind,
      campaignId,
      caseStatus: "WAITING_ADMIN",
      ownerUserId: String(row.owner_user_id ?? ""),
      campaignTitle:
        camp && typeof (camp as { title?: string }).title === "string"
          ? String((camp as { title: string }).title)
          : null,
      campaignLifecycle:
        camp && typeof (camp as { lifecycle_status?: string }).lifecycle_status === "string"
          ? String((camp as { lifecycle_status: string }).lifecycle_status)
          : null,
      updatedAt: String(row.updated_at ?? ""),
      destination: DELIVERY_AD_ADMIN_ROUTES.detail(campaignId),
    });
  }

  return { ok: true, items, total };
}
