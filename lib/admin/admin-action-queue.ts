/**
 * ADMIN ACTION QUEUE SSOT — “관리자가 지금 처리해야 하는 것”.
 *
 * Category contract (ownership · next actor · total membership · permission · hrefs)
 * = `lib/admin/admin-action-queue-registry.ts`. This file owns the COUNT predicates only.
 *
 * HARD LOCK (P0-A):
 *   ADMIN_Q = actionable business pending workload SUM (registry total categories)
 *   ADMIN_Q ≠ Member notification_events unread
 *   ADMIN_Q ≠ Admin “notification unread inbox”
 * Opening / viewing a pending row MUST NOT decrement Q (status unchanged).
 * Terminal statuses (approved / rejected / cancelled) leave Q.
 * on_hold remains actionable — Admin still must decide.
 *
 * Failure contract (R9): a category that could not be counted is `status: "unavailable"`
 * with `count: null` and `total_complete: false`. It is NEVER reported as 0.
 * Only an explicitly missing relation (42P01 / PGRST205 naming the source table) is
 * treated as "feature not deployed" → ok/0.
 *
 * DO NOT: invent queues · use /api/me/notifications as Admin ops inbox ·
 *         invent admin_ops_events table inside point CUT · merge A/B/OwnerC/AdminQ.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { projectFeedAdOpsProductStatus } from "@/lib/ads/feed-ad-ops-presentation";
import {
  ADMIN_ACTIONABLE_STORE_APPROVAL,
  COMMUNITY_REPORT_ADMIN_ACTIONABLE,
  SETTLEMENT_ADMIN_ACTIONABLE_STATUSES,
  STORE_ORDER_ADMIN_DECISION_STATUSES,
  STORE_ORDER_CLOSED_STATUSES,
  TRADE_REPORT_ADMIN_ACTIONABLE,
} from "@/lib/admin/admin-ops-actionable-status";
import {
  ADMIN_ACTION_QUEUE_REGISTRY,
  isAdminActionQueueTotalCategory,
  type AdminActionQueueCategory,
  type AdminActionQueueCategoryResult,
} from "@/lib/admin/admin-action-queue-registry";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";

export {
  ADMIN_ACTION_QUEUE_META,
  type AdminActionQueueCategory,
  type AdminActionQueuePriority,
  type AdminActionQueueRtPolicy,
} from "@/lib/admin/admin-action-queue-registry";

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

/**
 * Store orders the ADMIN must act on:
 *   - admin decision statuses (cancel_requested / refund_requested), regardless of SLA flag;
 *   - SLA attention flag on a non-closed order.
 * Closed orders never count, even with a stale flag.
 */
export const STORE_ORDER_ADMIN_QUEUE_OR_FILTER =
  `order_status.in.(${STORE_ORDER_ADMIN_DECISION_STATUSES.join(",")}),` +
  `and(needs_admin_attention.eq.true,order_status.not.in.(${STORE_ORDER_CLOSED_STATUSES.join(",")}))`;

/** feed_ad_requests are projected in JS; cap guards the scan and is surfaced when hit. */
const FEED_AD_SCAN_LIMIT = 2000;

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
  /** Trade reports (`reports`, all target_type incl. chat_room). */
  reports: number;
  store_reports: number;
  delivery_alerts: number;
  member_inquiry_open: number;
  /** A2-2 support_cases actionable (OPEN|WAITING_ADMIN) */
  support_actionable: number;
  /** Owner workload (monitoring) — not in total. */
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
  /** community_messenger_reports received|reviewing (trade chat_room reports are owned by `reports`). */
  messenger_actionable: number;
  /** Σ ok counts of registry total categories visible to the caller. */
  total: number;
  /** false when any total category the caller may see is unavailable. */
  total_complete: boolean;
  /** Registry-ordered per-category results (status-aware). */
  categories: AdminActionQueueCategoryResult[];
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

/** Caller visibility — mirrors requireAdminPermission (super admin sees everything). */
export type AdminActionQueuePermissionScope = {
  isSuperAdmin: boolean;
  permissions: readonly AdminPermissionKey[];
};

type QueryError = { message?: string; code?: string } | null | undefined;
type CountRes = { count?: number | null; error?: QueryError };

/**
 * True only when PostgREST/Postgres says the SOURCE RELATION itself is missing
 * (feature not deployed). Column errors, permission errors, timeouts → false.
 */
export function isMissingRelationError(error: QueryError, relation: string): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const msg = String(error.message ?? "");
  const namesRelation = new RegExp(`(^|[^a-z_])(public\\.)?${relation}([^a-z_]|$)`, "i").test(msg);
  if (!namesRelation) return false;
  if (code === "42P01" || code === "PGRST205") return true;
  return (
    new RegExp(`relation "(public\\.)?${relation}" does not exist`, "i").test(msg) ||
    new RegExp(`could not find the table '(public\\.)?${relation}'`, "i").test(msg)
  );
}

type Outcome = { status: "ok"; count: number } | { status: "unavailable" };

function countOutcome(res: CountRes, relation: string): Outcome {
  if (res.error) {
    if (isMissingRelationError(res.error, relation)) return { status: "ok", count: 0 };
    return { status: "unavailable" };
  }
  return { status: "ok", count: Math.max(0, Math.floor(Number(res.count) || 0)) };
}

const NOT_CONFIGURED: CountRes = { count: null, error: { message: "supabase_client_unavailable" } };

function permitted(
  required: AdminPermissionKey | null,
  scope: AdminActionQueuePermissionScope | undefined
): boolean {
  if (!required || !scope || scope.isSuperAdmin) return true;
  if (scope.permissions.includes(required)) return true;
  return false;
}

/**
 * Durable ADMIN ACTION QUEUE counts — shared by /api/admin/admin-bell, CP overview,
 * and domain dashboards. Pass `permissionScope` for caller-scoped surfaces (Bell/CP).
 */
export async function loadAdminActionQueueCounts(input: {
  storesSb: SupabaseClient<any> | null;
  notesSb: SupabaseClient<any> | null;
  permissionScope?: AdminActionQueuePermissionScope;
}): Promise<AdminActionQueueCounts> {
  const { storesSb, notesSb, permissionScope } = input;
  const head = { count: "exact" as const, head: true };

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
  ] = await Promise.all([
    storesSb
      ? storesSb
          .from("store_point_charge_requests")
          .select("id", head)
          .in("request_status", [...STORE_CHARGE_ACTIONABLE_STATUSES])
      : NOT_CONFIGURED,
    storesSb
      ? storesSb.from("business_cash_charge_requests").select("id", head).eq("status", "PENDING")
      : NOT_CONFIGURED,
    storesSb
      ? storesSb
          .from("point_charge_requests")
          .select("id", head)
          .in("request_status", [...USER_CHARGE_ACTIONABLE_STATUSES])
      : NOT_CONFIGURED,
    storesSb
      ? storesSb.from("reports").select("id", head).in("status", [...TRADE_REPORT_ADMIN_ACTIONABLE])
      : NOT_CONFIGURED,
    storesSb ? storesSb.from("store_reports").select("id", head).eq("status", "open") : NOT_CONFIGURED,
    storesSb
      ? storesSb
          .from("delivery_operation_alert_events")
          .select("id", head)
          .in("event_status", ["open", "acknowledged"])
      : NOT_CONFIGURED,
    storesSb
      ? storesSb
          .from("feed_ad_requests")
          .select("id, status, start_at, end_at")
          .eq("status", "pending_review")
          .limit(FEED_AD_SCAN_LIMIT)
      : Promise.resolve({ data: null as unknown[] | null, error: NOT_CONFIGURED.error }),
    storesSb
      ? storesSb
          .from("point_promotion_orders")
          .select("id", head)
          .eq("domain", "trade")
          .eq("order_status", "pending_review")
      : NOT_CONFIGURED,
    storesSb ? storesSb.from("store_inquiries").select("id", head).eq("status", "open") : NOT_CONFIGURED,
    notesSb
      ? notesSb.from("support_cases").select("id", head).in("status", ["OPEN", "WAITING_ADMIN"])
      : NOT_CONFIGURED,
    notesSb
      ? notesSb
          .from("community_reports")
          .select("id", head)
          .in("status", [...COMMUNITY_REPORT_ADMIN_ACTIONABLE])
      : NOT_CONFIGURED,
    storesSb
      ? storesSb
          .from("stores")
          .select("id", head)
          .in("approval_status", [...ADMIN_ACTIONABLE_STORE_APPROVAL])
      : NOT_CONFIGURED,
    storesSb
      ? storesSb.from("delivery_ad_operations_cases").select("id", head).eq("status", "WAITING_ADMIN")
      : NOT_CONFIGURED,
    notesSb
      ? notesSb.from("meeting_reports").select("id", head).in("status", ["pending", "reviewing"])
      : NOT_CONFIGURED,
    storesSb
      ? storesSb.from("store_orders").select("id", head).or(STORE_ORDER_ADMIN_QUEUE_OR_FILTER)
      : NOT_CONFIGURED,
    storesSb
      ? storesSb
          .from("store_settlements")
          .select("id", head)
          .in("settlement_status", [...SETTLEMENT_ADMIN_ACTIONABLE_STATUSES])
      : NOT_CONFIGURED,
    storesSb
      ? storesSb.from("coin_withdrawal_requests").select("id", head).eq("status", "REQUESTED")
      : NOT_CONFIGURED,
    storesSb
      ? storesSb
          .from("platform_popup_owner_requests")
          .select("id", head)
          .in("request_status", ["submitted", "under_review"])
      : NOT_CONFIGURED,
    storesSb
      ? storesSb
          .from("delivery_ad_partner_memberships")
          .select("id", head)
          .eq("status", "PENDING_REVIEW")
      : NOT_CONFIGURED,
    notesSb
      ? notesSb
          .from("community_messenger_reports")
          .select("id", head)
          .in("status", ["received", "reviewing"])
      : NOT_CONFIGURED,
  ]);

  const feedOutcome = ((): Outcome => {
    if (feedAdRes.error) {
      return isMissingRelationError(feedAdRes.error, "feed_ad_requests")
        ? { status: "ok", count: 0 }
        : { status: "unavailable" };
    }
    const rows = Array.isArray(feedAdRes.data) ? feedAdRes.data : [];
    // A full page means rows were cut off — the count would be a floor, not the truth.
    if (rows.length >= FEED_AD_SCAN_LIMIT) return { status: "unavailable" };
    const count = rows.filter((row) => {
      const rec = row as { status?: unknown; start_at?: unknown; end_at?: unknown };
      return (
        projectFeedAdOpsProductStatus({
          requestStatus: String(rec.status ?? ""),
          startAt: typeof rec.start_at === "string" ? rec.start_at : null,
          endAt: typeof rec.end_at === "string" ? rec.end_at : null,
        }) === "pending_review"
      );
    }).length;
    return { status: "ok", count };
  })();

  const LEGACY_ZERO: Outcome = { status: "ok", count: 0 };

  const outcomes: Record<AdminActionQueueCategory, Outcome> = {
    store_charges: countOutcome(storeChargesRes, "store_point_charge_requests"),
    cash_charges: countOutcome(cashChargesRes, "business_cash_charge_requests"),
    user_charges: countOutcome(userChargesRes, "point_charge_requests"),
    feed_ad_requests: feedOutcome,
    delivery_ad_ops: countOutcome(deliveryAdOpsRes, "delivery_ad_operations_cases"),
    trade_promo_pending: countOutcome(tradePromoRes, "point_promotion_orders"),
    reports: countOutcome(reportsRes, "reports"),
    store_reports: countOutcome(storeReportsRes, "store_reports"),
    delivery_alerts: countOutcome(alertsRes, "delivery_operation_alert_events"),
    member_inquiry_open: LEGACY_ZERO, // A2-2: legacy Care removed from actionable queue
    support_actionable: countOutcome(supportActionableRes, "support_cases"),
    store_inquiry_open: countOutcome(storeInquiryRes, "store_inquiries"),
    platform_inquiry_open: LEGACY_ZERO, // A2-2: legacy platform inbox archive only
    community_reports: countOutcome(communityReportsRes, "community_reports"),
    store_applications: countOutcome(storeApplicationsRes, "stores"),
    meeting_reports: countOutcome(meetingReportsRes, "meeting_reports"),
    orders_attention: countOutcome(ordersAttentionRes, "store_orders"),
    settlements_actionable: countOutcome(settlementsRes, "store_settlements"),
    coin_withdrawals: countOutcome(coinWithdrawRes, "coin_withdrawal_requests"),
    platform_popup_pending: countOutcome(popupPendingRes, "platform_popup_owner_requests"),
    partner_pending: countOutcome(partnerPendingRes, "delivery_ad_partner_memberships"),
    messenger_actionable: countOutcome(cmMessengerReportsRes, "community_messenger_reports"),
  };

  const categories: AdminActionQueueCategoryResult[] = ADMIN_ACTION_QUEUE_REGISTRY.map((def) => {
    const inTotal = isAdminActionQueueTotalCategory(def);
    if (!permitted(def.requiredPermission, permissionScope)) {
      return {
        key: def.key,
        count: null,
        status: "forbidden",
        inTotal,
        nextActor: def.nextActor,
        listHref: def.listHref,
      };
    }
    const o = outcomes[def.key];
    return {
      key: def.key,
      count: o.status === "ok" ? o.count : null,
      status: o.status,
      inTotal,
      nextActor: def.nextActor,
      listHref: def.listHref,
    };
  });

  let total = 0;
  let totalComplete = true;
  for (const c of categories) {
    if (!c.inTotal || c.status === "forbidden") continue;
    if (c.status === "unavailable") {
      totalComplete = false;
      continue;
    }
    total += c.count ?? 0;
  }

  /** Flat legacy fields: visible ok count, else 0 (status lives in `categories`). */
  const n = (key: AdminActionQueueCategory): number => {
    const c = categories.find((x) => x.key === key);
    return c && c.status === "ok" ? c.count ?? 0 : 0;
  };

  const unavailable = categories.filter((c) => c.status === "unavailable").map((c) => c.key);

  const cash_charges = n("cash_charges");
  const user_charges = n("user_charges");
  const reports = n("reports");
  const store_reports = n("store_reports");
  const community_reports = n("community_reports");

  return {
    store_charges: n("store_charges"),
    cash_charges,
    user_charges,
    feed_ad_requests: n("feed_ad_requests"),
    delivery_ad_ops: n("delivery_ad_ops"),
    trade_promo_pending: n("trade_promo_pending"),
    reports,
    store_reports,
    delivery_alerts: n("delivery_alerts"),
    member_inquiry_open: n("member_inquiry_open"),
    support_actionable: n("support_actionable"),
    store_inquiry_open: n("store_inquiry_open"),
    platform_inquiry_open: n("platform_inquiry_open"),
    community_reports,
    store_applications: n("store_applications"),
    meeting_reports: n("meeting_reports"),
    orders_attention: n("orders_attention"),
    settlements_actionable: n("settlements_actionable"),
    coin_withdrawals: n("coin_withdrawals"),
    platform_popup_pending: n("platform_popup_pending"),
    partner_pending: n("partner_pending"),
    messenger_actionable: n("messenger_actionable"),
    total,
    total_complete: totalComplete,
    categories,
    unavailable,
    by_category: {
      charges: cash_charges + user_charges,
      store_charges: n("store_charges"),
      cash_charges,
      user_charges,
      reports: reports + store_reports,
      trade_reports: reports,
      store_reports,
      community_reports,
      global_reports: reports + community_reports,
      store_applications: n("store_applications"),
      alerts: n("delivery_alerts"),
      feed_ad_requests: n("feed_ad_requests"),
      delivery_ad_ops: n("delivery_ad_ops"),
      trade_promo_pending: n("trade_promo_pending"),
      member_inquiry_open: n("member_inquiry_open"),
      support_actionable: n("support_actionable"),
      store_inquiry_open: n("store_inquiry_open"),
      platform_inquiry_open: n("platform_inquiry_open"),
      meeting_reports: n("meeting_reports"),
      orders_attention: n("orders_attention"),
      settlements_actionable: n("settlements_actionable"),
      coin_withdrawals: n("coin_withdrawals"),
      platform_popup_pending: n("platform_popup_pending"),
      partner_pending: n("partner_pending"),
      messenger_actionable: n("messenger_actionable"),
    },
  };
}
