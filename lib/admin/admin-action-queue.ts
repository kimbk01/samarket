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
import {
  ADMIN_ACTIONABLE_STORE_APPROVAL,
  COMMUNITY_REPORT_ADMIN_ACTIONABLE,
  TRADE_REPORT_ADMIN_ACTIONABLE,
} from "@/lib/admin/admin-ops-actionable-status";
import { countDeliveryAdAdminActionQueue } from "@/lib/stores/advertising/delivery-ad-operations-action-queue";

/** Member Point charge rows that still need Admin action. */
export const USER_CHARGE_ACTIONABLE_STATUSES = [
  "pending",
  "waiting_confirm",
  "on_hold",
] as const;

/**
 * Archived store-credit charge rows that still need Admin action.
 * Must stay aligned with PENDING_CHARGE_STATUSES (owner deposit UI).
 */
export const STORE_CHARGE_ACTIONABLE_STATUSES = [
  "pending",
  "waiting_confirm",
  "on_hold",
] as const;

export type AdminActionQueueCategory =
  | "store_charges"
  | "cash_charges"
  | "user_charges"
  | "feed_ad_requests"
  | "delivery_ad_ops"
  | "trade_promo_pending"
  | "reports"
  | "store_reports"
  | "delivery_alerts"
  | "member_inquiry_open"
  | "support_actionable"
  | "store_inquiry_open"
  | "platform_inquiry_open"
  | "community_reports"
  | "store_applications"
  /** ARO-AC-001 */
  | "meeting_reports"
  | "orders_attention"
  | "settlements_actionable"
  | "coin_withdrawals"
  | "platform_popup_pending"
  | "partner_pending"
  /** Messenger Action Required — CM reports + trade chat_room reports (dashboard SSOT). */
  | "messenger_actionable";

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
  /**
   * AST-002 archived store-credit requests — NOT Cash.
   * CUT E: demoted from actionable Bell/Action Center total (mutations 410).
   */
  store_charges: { priority: "P3_SILENT", rt: "POLL_SUFFICIENT", soundEligible: false },
  /** AST-005 Cash top-up pending — canonical Finance queue for store Cash. */
  cash_charges: { priority: "P1_ACTION_REQUIRED", rt: "RT_REQUIRED", soundEligible: true },
  user_charges: { priority: "P1_ACTION_REQUIRED", rt: "RT_REQUIRED", soundEligible: true },
  feed_ad_requests: { priority: "P1_ACTION_REQUIRED", rt: "RT_REQUIRED", soundEligible: true },
  /** Delivery Ads ops Case WAITING_ADMIN — CUT 3-D */
  delivery_ad_ops: { priority: "P1_ACTION_REQUIRED", rt: "POLL_SUFFICIENT", soundEligible: false },
  /** TRADE_PROMO_PENDING — point_promotion_orders domain=trade · pending_review */
  trade_promo_pending: { priority: "P1_ACTION_REQUIRED", rt: "POLL_SUFFICIENT", soundEligible: false },
  reports: { priority: "P1_ACTION_REQUIRED", rt: "RT_REQUIRED", soundEligible: true },
  store_reports: { priority: "P1_ACTION_REQUIRED", rt: "RT_REQUIRED", soundEligible: true },
  member_inquiry_open: { priority: "P1_ACTION_REQUIRED", rt: "RT_REQUIRED", soundEligible: true },
  /** A2-2: support_cases OPEN|WAITING_ADMIN — canonical Admin Support workload */
  support_actionable: { priority: "P1_ACTION_REQUIRED", rt: "RT_REQUIRED", soundEligible: true },
  store_inquiry_open: { priority: "P1_ACTION_REQUIRED", rt: "POLL_SUFFICIENT", soundEligible: false },
  /** Legacy platform inbox — archive only (A2-2); not ops workload */
  platform_inquiry_open: { priority: "P3_SILENT", rt: "POLL_SUFFICIENT", soundEligible: false },
  community_reports: { priority: "P1_ACTION_REQUIRED", rt: "RT_REQUIRED", soundEligible: true },
  /** stores.approval_status — Admin next-action only (pending|under_review; not revision_requested). */
  store_applications: { priority: "P1_ACTION_REQUIRED", rt: "RT_REQUIRED", soundEligible: true },
  meeting_reports: { priority: "P1_ACTION_REQUIRED", rt: "POLL_SUFFICIENT", soundEligible: false },
  orders_attention: { priority: "P0_CRITICAL", rt: "POLL_SUFFICIENT", soundEligible: false },
  settlements_actionable: { priority: "P1_ACTION_REQUIRED", rt: "POLL_SUFFICIENT", soundEligible: false },
  coin_withdrawals: { priority: "P1_ACTION_REQUIRED", rt: "POLL_SUFFICIENT", soundEligible: false },
  platform_popup_pending: { priority: "P1_ACTION_REQUIRED", rt: "POLL_SUFFICIENT", soundEligible: false },
  partner_pending: { priority: "P1_ACTION_REQUIRED", rt: "POLL_SUFFICIENT", soundEligible: false },
  messenger_actionable: { priority: "P1_ACTION_REQUIRED", rt: "POLL_SUFFICIENT", soundEligible: false },
};

export type AdminActionQueueCounts = {
  /** @deprecated AST-002 archive — not Cash; excluded from Action Center total (CUT E). */
  store_charges: number;
  /** Canonical Cash top-up pending (business_cash_charge_requests). */
  cash_charges: number;
  user_charges: number;
  feed_ad_requests: number;
  delivery_ad_ops: number;
  /** TRADE_PROMO_PENDING semantic */
  trade_promo_pending: number;
  reports: number;
  store_reports: number;
  delivery_alerts: number;
  member_inquiry_open: number;
  /** A2-2 support_cases actionable (OPEN|WAITING_ADMIN) */
  support_actionable: number;
  store_inquiry_open: number;
  platform_inquiry_open: number;
  community_reports: number;
  store_applications: number;
  /** ARO-AC-001 extensions */
  meeting_reports: number;
  orders_attention: number;
  settlements_actionable: number;
  coin_withdrawals: number;
  platform_popup_pending: number;
  partner_pending: number;
  /** CM reports (received|reviewing) + trade chat_room reports (pending|reviewing). */
  messenger_actionable: number;
  /** Sum of actionable categories (excludes AST-002 store_charges + legacy platform). */
  total: number;
  /**
   * Categories that failed to load (real error) — UI must not treat as “0 pending”.
   * Schema-missing optional tables stay quiet (count 0).
   */
  unavailable: string[];
  /** Legacy admin-bell shape (charges = cash+user; reports = reports+store_reports) */
  by_category: {
    charges: number;
    store_charges: number;
    cash_charges: number;
    user_charges: number;
    /** Legacy combined trade + store delivery reports */
    reports: number;
    trade_reports: number;
    store_reports: number;
    community_reports: number;
    /** /admin/reports unified queue (trade + community sources) */
    global_reports: number;
    store_applications: number;
    alerts: number;
    feed_ad_requests: number;
    delivery_ad_ops: number;
    trade_promo_pending: number;
    member_inquiry_open: number;
    support_actionable: number;
    store_inquiry_open: number;
    platform_inquiry_open: number;
    meeting_reports: number;
    orders_attention: number;
    settlements_actionable: number;
    coin_withdrawals: number;
    platform_popup_pending: number;
    partner_pending: number;
    messenger_actionable: number;
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
    cash_charges: 0,
    user_charges: 0,
    feed_ad_requests: 0,
    delivery_ad_ops: 0,
    trade_promo_pending: 0,
    reports: 0,
    store_reports: 0,
    delivery_alerts: 0,
    member_inquiry_open: 0,
    support_actionable: 0,
    store_inquiry_open: 0,
    platform_inquiry_open: 0,
    community_reports: 0,
    store_applications: 0,
    meeting_reports: 0,
    orders_attention: 0,
    settlements_actionable: 0,
    coin_withdrawals: 0,
    platform_popup_pending: 0,
    partner_pending: 0,
    messenger_actionable: 0,
    total: 0,
    unavailable: [],
    by_category: {
      charges: 0,
      store_charges: 0,
      cash_charges: 0,
      user_charges: 0,
      reports: 0,
      trade_reports: 0,
      store_reports: 0,
      community_reports: 0,
      global_reports: 0,
      store_applications: 0,
      alerts: 0,
      feed_ad_requests: 0,
      delivery_ad_ops: 0,
      trade_promo_pending: 0,
      member_inquiry_open: 0,
      support_actionable: 0,
      store_inquiry_open: 0,
      platform_inquiry_open: 0,
      meeting_reports: 0,
      orders_attention: 0,
      settlements_actionable: 0,
      coin_withdrawals: 0,
      platform_popup_pending: 0,
      partner_pending: 0,
      messenger_actionable: 0,
    },
  });

  if (!storesSb && !notesSb) return empty();

  const [
    storeChargesRes,
    cashChargesRes,
    userChargesRes,
    reportsRes,
    storeReportsRes,
    alertsRes,
    feedAdRes,
    tradePromoRes,
    storeInquiryRes,
    supportActionableRes,
    communityReportsRes,
    storeApplicationsRes,
    deliveryAdOpsRes,
    meetingReportsRes,
    ordersAttentionRes,
    settlementsRes,
    coinWithdrawRes,
    popupPendingRes,
    partnerPendingRes,
    cmMessengerReportsRes,
    tradeChatReportsRes,
  ] = await Promise.all([
    storesSb
      ? storesSb
          .from("store_point_charge_requests")
          .select("id", { count: "exact", head: true })
          .in("request_status", [...STORE_CHARGE_ACTIONABLE_STATUSES])
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb
          .from("business_cash_charge_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "PENDING")
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb
          .from("point_charge_requests")
          .select("id", { count: "exact", head: true })
          .in("request_status", [...USER_CHARGE_ACTIONABLE_STATUSES])
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb
          .from("reports")
          .select("id", { count: "exact", head: true })
          .in("status", [...TRADE_REPORT_ADMIN_ACTIONABLE])
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
          .in("domain", ["trade", "community"])
          .eq("order_status", "pending_review")
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb.from("store_inquiries").select("id", { count: "exact", head: true }).eq("status", "open")
      : Promise.resolve({ count: 0, error: null }),
    notesSb
      ? notesSb
          .from("support_cases")
          .select("id", { count: "exact", head: true })
          .in("status", ["OPEN", "WAITING_ADMIN"])
      : Promise.resolve({ count: 0, error: null }),
    notesSb
      ? notesSb
          .from("community_reports")
          .select("id", { count: "exact", head: true })
          .in("status", [...COMMUNITY_REPORT_ADMIN_ACTIONABLE])
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb
          .from("stores")
          .select("id", { count: "exact", head: true })
          .in("approval_status", [...ADMIN_ACTIONABLE_STORE_APPROVAL])
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? countDeliveryAdAdminActionQueue(storesSb).then((count) => ({
          count,
          error: null as { message?: string } | null,
        }))
      : Promise.resolve({ count: 0, error: null }),
    notesSb
      ? notesSb
          .from("meeting_reports")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending", "reviewing"])
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb
          .from("store_orders")
          .select("id", { count: "exact", head: true })
          .or("needs_admin_attention.eq.true,order_status.eq.refund_requested")
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb
          .from("store_settlements")
          .select("id", { count: "exact", head: true })
          .in("settlement_status", ["scheduled", "held"])
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb
          .from("coin_withdrawal_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "REQUESTED")
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb
          .from("platform_popup_owner_requests")
          .select("id", { count: "exact", head: true })
          .in("request_status", ["submitted", "under_review"])
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb
          .from("delivery_ad_partner_memberships")
          .select("id", { count: "exact", head: true })
          .eq("status", "PENDING_REVIEW")
      : Promise.resolve({ count: 0, error: null }),
    notesSb
      ? notesSb
          .from("community_messenger_reports")
          .select("id", { count: "exact", head: true })
          .in("status", ["received", "reviewing"])
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb
          .from("reports")
          .select("id", { count: "exact", head: true })
          .eq("target_type", "chat_room")
          .in("status", ["pending", "reviewing"])
      : Promise.resolve({ count: 0, error: null }),
  ]);

  const unavailable: string[] = [];
  const markUnavailable = (
    key: string,
    res: { count?: number | null; error?: { message?: string } | null },
    missingRe: RegExp
  ): number => {
    if (!res.error) return safeCount(res);
    if (missingRe.test(res.error.message ?? "")) return 0;
    unavailable.push(key);
    return 0;
  };

  const store_charges = markUnavailable(
    "store_charges",
    storeChargesRes,
    /store_point_charge_requests|schema cache|does not exist/i
  );
  const cash_charges = markUnavailable(
    "cash_charges",
    cashChargesRes,
    /business_cash_charge_requests|schema cache|does not exist/i
  );
  const user_charges = markUnavailable(
    "user_charges",
    userChargesRes,
    /point_charge_requests|schema cache|does not exist/i
  );
  const feed_ad_requests = (() => {
    if (feedAdRes.error) {
      if (/feed_ad_requests|schema cache|does not exist/i.test(feedAdRes.error.message ?? "")) {
        return 0;
      }
      unavailable.push("feed_ad_requests");
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
  const trade_promo_pending = markUnavailable(
    "trade_promo_pending",
    tradePromoRes,
    /point_promotion_orders|schema cache|does not exist/i
  );
  const reports = markUnavailable("reports", reportsRes, /reports|schema cache|does not exist/i);
  const store_reports = markUnavailable(
    "store_reports",
    storeReportsRes,
    /store_reports|schema cache|does not exist/i
  );
  const delivery_alerts = markUnavailable(
    "delivery_alerts",
    alertsRes,
    /delivery_operation_alert_events|schema cache|does not exist/i
  );
  const member_inquiry_open = 0; // A2-2: legacy Care removed from actionable queue
  const store_inquiry_open = markUnavailable(
    "store_inquiry_open",
    storeInquiryRes,
    /store_inquiries|schema cache|does not exist/i
  );
  const platform_inquiry_open = 0; // A2-2: legacy platform inbox archive only
  const support_actionable = markUnavailable(
    "support_actionable",
    supportActionableRes,
    /support_cases|schema cache|does not exist/i
  );
  const community_reports = markUnavailable(
    "community_reports",
    communityReportsRes,
    /community_reports|schema cache|does not exist/i
  );
  const store_applications = markUnavailable(
    "store_applications",
    storeApplicationsRes,
    /stores|schema cache|does not exist/i
  );
  const delivery_ad_ops = markUnavailable(
    "delivery_ad_ops",
    deliveryAdOpsRes,
    /delivery_ad_operations_cases|schema cache|does not exist/i
  );
  const meeting_reports = markUnavailable(
    "meeting_reports",
    meetingReportsRes,
    /meeting_reports|schema cache|does not exist/i
  );
  const orders_attention = markUnavailable(
    "orders_attention",
    ordersAttentionRes,
    /needs_admin_attention|store_orders|schema cache|does not exist/i
  );
  const settlements_actionable = markUnavailable(
    "settlements_actionable",
    settlementsRes,
    /store_settlements|schema cache|does not exist/i
  );
  const coin_withdrawals = markUnavailable(
    "coin_withdrawals",
    coinWithdrawRes,
    /coin_withdrawal_requests|schema cache|does not exist/i
  );
  const platform_popup_pending = markUnavailable(
    "platform_popup_pending",
    popupPendingRes,
    /platform_popup_owner_requests|schema cache|does not exist/i
  );
  const partner_pending = markUnavailable(
    "partner_pending",
    partnerPendingRes,
    /delivery_ad_partner_memberships|schema cache|does not exist/i
  );
  const cmMessengerReports = markUnavailable(
    "messenger_actionable",
    cmMessengerReportsRes,
    /community_messenger_reports|schema cache|does not exist/i
  );
  const tradeChatReports = markUnavailable(
    "messenger_actionable",
    tradeChatReportsRes,
    /reports|schema cache|does not exist/i
  );
  const messenger_actionable = unavailable.includes("messenger_actionable")
    ? 0
    : cmMessengerReports + tradeChatReports;

  // CUT E: actionable finance = Cash + Member Point (never AST-002 store_charges).
  const charges = cash_charges + user_charges;
  const reportsCombined = reports + store_reports;
  const global_reports = reports + community_reports;
  const total =
    charges +
    feed_ad_requests +
    delivery_ad_ops +
    trade_promo_pending +
    reportsCombined +
    delivery_alerts +
    member_inquiry_open +
    support_actionable +
    store_inquiry_open +
    platform_inquiry_open +
    community_reports +
    store_applications +
    meeting_reports +
    orders_attention +
    settlements_actionable +
    coin_withdrawals +
    platform_popup_pending +
    partner_pending +
    messenger_actionable;

  return {
    store_charges,
    cash_charges,
    user_charges,
    feed_ad_requests,
    delivery_ad_ops,
    trade_promo_pending,
    reports,
    store_reports,
    delivery_alerts,
    member_inquiry_open,
    support_actionable,
    store_inquiry_open,
    platform_inquiry_open,
    community_reports,
    store_applications,
    meeting_reports,
    orders_attention,
    settlements_actionable,
    coin_withdrawals,
    platform_popup_pending,
    partner_pending,
    messenger_actionable,
    total,
    unavailable: [...new Set(unavailable)],
    by_category: {
      charges,
      store_charges,
      cash_charges,
      user_charges,
      reports: reportsCombined,
      trade_reports: reports,
      store_reports,
      community_reports,
      global_reports,
      store_applications,
      alerts: delivery_alerts,
      feed_ad_requests,
      delivery_ad_ops,
      trade_promo_pending,
      member_inquiry_open,
      support_actionable,
      store_inquiry_open,
      platform_inquiry_open,
      meeting_reports,
      orders_attention,
      settlements_actionable,
      coin_withdrawals,
      platform_popup_pending,
      partner_pending,
      messenger_actionable,
    },
  };
}
