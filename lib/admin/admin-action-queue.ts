/**
 * ADMIN ACTION QUEUE SSOT — “관리자가 지금 처리해야 하는 것”.
 *
 * Bell count and CP Overview Action Queue MUST derive from this definition.
 * RT = wake-up only. Durable COUNT = these head counts.
 *
 * HARD LOCK (P0-A):
 *   ADMIN_Q = actionable business pending workload SUM
 *   ADMIN_Q ≠ Member notification_events unread
 *   ADMIN_Q ≠ Admin “notification unread inbox”
 * Opening / viewing a pending row MUST NOT decrement Q (status unchanged).
 * Terminal statuses (approved / rejected / cancelled) leave Q.
 * on_hold remains actionable — Admin still must decide.
 *
 * DO NOT: invent queues · use /api/me/notifications as Admin ops inbox ·
 *         invent admin_ops_events table inside point CUT · merge A/B/OwnerC/AdminQ.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { projectFeedAdOpsProductStatus } from "@/lib/ads/feed-ad-ops-presentation";

/** Member D-Point charge rows that still need Admin action. */
export const USER_CHARGE_ACTIONABLE_STATUSES = [
  "pending",
  "waiting_confirm",
  "on_hold",
] as const;

/**
 * Owner/store Business Credit charge rows that still need Admin action.
 * Must stay aligned with PENDING_CHARGE_STATUSES (owner deposit UI).
 */
export const STORE_CHARGE_ACTIONABLE_STATUSES = [
  "pending",
  "waiting_confirm",
  "on_hold",
] as const;

export type AdminActionQueueCategory =
  | "store_charges"
  | "user_charges"
  | "feed_ad_requests"
  | "trade_promo_pending"
  | "reports"
  | "store_reports"
  | "delivery_alerts"
  | "member_inquiry_open"
  | "store_inquiry_open"
  | "platform_inquiry_open"
  | "community_reports";

export type AdminActionQueuePriority = "P0_CRITICAL" | "P1_ACTION_REQUIRED" | "P2_INFORMATIONAL" | "P3_SILENT";

export type AdminActionQueueRtPolicy = "RT_REQUIRED" | "RT_OPTIONAL" | "POLL_SUFFICIENT";

export const ADMIN_ACTION_QUEUE_META: Record<
  AdminActionQueueCategory,
  {
    priority: AdminActionQueuePriority;
    rt: AdminActionQueueRtPolicy;
    soundEligible: boolean;
  }
> = {
  delivery_alerts: { priority: "P0_CRITICAL", rt: "RT_REQUIRED", soundEligible: true },
  store_charges: { priority: "P1_ACTION_REQUIRED", rt: "RT_REQUIRED", soundEligible: true },
  user_charges: { priority: "P1_ACTION_REQUIRED", rt: "RT_REQUIRED", soundEligible: true },
  feed_ad_requests: { priority: "P1_ACTION_REQUIRED", rt: "RT_REQUIRED", soundEligible: true },
  /** TRADE_PROMO_PENDING — point_promotion_orders domain=trade · pending_review */
  trade_promo_pending: { priority: "P1_ACTION_REQUIRED", rt: "POLL_SUFFICIENT", soundEligible: false },
  reports: { priority: "P1_ACTION_REQUIRED", rt: "RT_OPTIONAL", soundEligible: true },
  store_reports: { priority: "P1_ACTION_REQUIRED", rt: "RT_OPTIONAL", soundEligible: true },
  member_inquiry_open: { priority: "P1_ACTION_REQUIRED", rt: "POLL_SUFFICIENT", soundEligible: false },
  store_inquiry_open: { priority: "P1_ACTION_REQUIRED", rt: "POLL_SUFFICIENT", soundEligible: false },
  platform_inquiry_open: { priority: "P1_ACTION_REQUIRED", rt: "POLL_SUFFICIENT", soundEligible: false },
  community_reports: { priority: "P1_ACTION_REQUIRED", rt: "RT_OPTIONAL", soundEligible: true },
};

export type AdminActionQueueCounts = {
  store_charges: number;
  user_charges: number;
  feed_ad_requests: number;
  /** TRADE_PROMO_PENDING semantic */
  trade_promo_pending: number;
  reports: number;
  store_reports: number;
  delivery_alerts: number;
  member_inquiry_open: number;
  store_inquiry_open: number;
  platform_inquiry_open: number;
  community_reports: number;
  /** Sum of all actionable categories */
  total: number;
  /** Legacy admin-bell shape (charges = store+user; reports = reports+store_reports) */
  by_category: {
    charges: number;
    store_charges: number;
    user_charges: number;
    reports: number;
    alerts: number;
    feed_ad_requests: number;
    trade_promo_pending: number;
    member_inquiry_open: number;
    store_inquiry_open: number;
    platform_inquiry_open: number;
    community_reports: number;
  };
};

function safeCount(res: { count?: number | null; error?: { message?: string } | null }): number {
  if (res.error) return 0;
  return Math.max(0, Math.floor(Number(res.count) || 0));
}

/**
 * Durable ADMIN ACTION QUEUE counts — shared by /api/admin/admin-bell and CP overview.
 */
export async function loadAdminActionQueueCounts(input: {
  storesSb: SupabaseClient<any> | null;
  notesSb: SupabaseClient<any> | null;
}): Promise<AdminActionQueueCounts> {
  const { storesSb, notesSb } = input;
  const empty = (): AdminActionQueueCounts => ({
    store_charges: 0,
    user_charges: 0,
    feed_ad_requests: 0,
    trade_promo_pending: 0,
    reports: 0,
    store_reports: 0,
    delivery_alerts: 0,
    member_inquiry_open: 0,
    store_inquiry_open: 0,
    platform_inquiry_open: 0,
    community_reports: 0,
    total: 0,
    by_category: {
      charges: 0,
      store_charges: 0,
      user_charges: 0,
      reports: 0,
      alerts: 0,
      feed_ad_requests: 0,
      trade_promo_pending: 0,
      member_inquiry_open: 0,
      store_inquiry_open: 0,
      platform_inquiry_open: 0,
      community_reports: 0,
    },
  });

  if (!storesSb && !notesSb) return empty();

  const [
    storeChargesRes,
    userChargesRes,
    reportsRes,
    storeReportsRes,
    alertsRes,
    feedAdRes,
    tradePromoRes,
    memberInquiryRes,
    storeInquiryRes,
    platformInquiryRes,
    communityReportsRes,
  ] = await Promise.all([
    storesSb
      ? storesSb
          .from("store_point_charge_requests")
          .select("id", { count: "exact", head: true })
          .in("request_status", [...STORE_CHARGE_ACTIONABLE_STATUSES])
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb
          .from("point_charge_requests")
          .select("id", { count: "exact", head: true })
          .in("request_status", [...USER_CHARGE_ACTIONABLE_STATUSES])
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb.from("reports").select("id", { count: "exact", head: true }).eq("status", "pending")
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb.from("store_reports").select("id", { count: "exact", head: true }).eq("status", "open")
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb
          .from("delivery_operation_alert_events")
          .select("id", { count: "exact", head: true })
          .in("event_status", ["open", "acknowledged"])
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb
          .from("feed_ad_requests")
          .select("id, status, start_at, end_at")
          .eq("status", "pending_review")
          .limit(500)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    storesSb
      ? storesSb
          .from("point_promotion_orders")
          .select("id", { count: "exact", head: true })
          .eq("domain", "trade")
          .eq("order_status", "pending_review")
      : Promise.resolve({ count: 0, error: null }),
    notesSb
      ? notesSb
          .from("member_admin_note_threads")
          .select("id", { count: "exact", head: true })
          .eq("started_by", "member")
          .eq("status", "open")
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb.from("store_inquiries").select("id", { count: "exact", head: true }).eq("status", "open")
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb
          .from("platform_admin_inquiries")
          .select("id", { count: "exact", head: true })
          .eq("status", "open")
      : Promise.resolve({ count: 0, error: null }),
    notesSb
      ? notesSb
          .from("community_reports")
          .select("id", { count: "exact", head: true })
          .in("status", ["open", "reviewing"])
      : Promise.resolve({ count: 0, error: null }),
  ]);

  const store_charges =
    storeChargesRes.error &&
    /store_point_charge_requests|schema cache|does not exist/i.test(storeChargesRes.error.message ?? "")
      ? 0
      : safeCount(storeChargesRes);
  const user_charges =
    userChargesRes.error &&
    /point_charge_requests|schema cache|does not exist/i.test(userChargesRes.error.message ?? "")
      ? 0
      : safeCount(userChargesRes);
  const feed_ad_requests = (() => {
    if (
      feedAdRes.error &&
      /feed_ad_requests|schema cache|does not exist/i.test(feedAdRes.error.message ?? "")
    ) {
      return 0;
    }
    const rows = Array.isArray(feedAdRes.data) ? feedAdRes.data : [];
    return rows.filter((row) => {
      const rec = row as { status?: unknown; start_at?: unknown; end_at?: unknown };
      return (
        projectFeedAdOpsProductStatus({
          requestStatus: String(rec.status ?? ""),
          startAt: typeof rec.start_at === "string" ? rec.start_at : null,
          endAt: typeof rec.end_at === "string" ? rec.end_at : null,
        }) === "pending_review"
      );
    }).length;
  })();
  const trade_promo_pending =
    tradePromoRes.error &&
    /point_promotion_orders|schema cache|does not exist/i.test(tradePromoRes.error.message ?? "")
      ? 0
      : safeCount(tradePromoRes);
  const reports = safeCount(reportsRes);
  const store_reports = safeCount(storeReportsRes);
  const delivery_alerts = safeCount(alertsRes);
  const member_inquiry_open = safeCount(memberInquiryRes);
  const store_inquiry_open = safeCount(storeInquiryRes);
  const platform_inquiry_open = safeCount(platformInquiryRes);
  const community_reports =
    communityReportsRes.error &&
    /community_reports|schema cache|does not exist/i.test(communityReportsRes.error.message ?? "")
      ? 0
      : safeCount(communityReportsRes);

  const charges = store_charges + user_charges;
  const reportsCombined = reports + store_reports;
  const total =
    charges +
    feed_ad_requests +
    trade_promo_pending +
    reportsCombined +
    delivery_alerts +
    member_inquiry_open +
    store_inquiry_open +
    platform_inquiry_open +
    community_reports;

  return {
    store_charges,
    user_charges,
    feed_ad_requests,
    trade_promo_pending,
    reports,
    store_reports,
    delivery_alerts,
    member_inquiry_open,
    store_inquiry_open,
    platform_inquiry_open,
    community_reports,
    total,
    by_category: {
      charges,
      store_charges,
      user_charges,
      reports: reportsCombined,
      alerts: delivery_alerts,
      feed_ad_requests,
      trade_promo_pending,
      member_inquiry_open,
      store_inquiry_open,
      platform_inquiry_open,
      community_reports,
    },
  };
}
