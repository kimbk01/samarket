export const ADMIN_COUPON_CONTROL_ROLES = ["dashboard", "list", "detail", "create"] as const;
export type AdminCouponControlRole = (typeof ADMIN_COUPON_CONTROL_ROLES)[number];

export const ADMIN_COUPON_CONTROL_VIEW_PARAM = "view";
export const ADMIN_COUPON_CONTROL_CAMPAIGN_PARAM = "campaign";

export function parseAdminCouponControlCampaignId(raw: string | null | undefined): string {
  return String(raw ?? "").trim();
}

export function parseAdminCouponControlRole(raw: string | null | undefined): AdminCouponControlRole {
  const v = String(raw ?? "").trim();
  if (v === "list" || v === "detail" || v === "create") return v;
  return "dashboard";
}

export type AdminCouponDashboardKpi = {
  total: number;
  active: number;
  waiting: number;
  ended: number;
};

export function classifyAdminCouponDashboardBucket(lifecycleState: string): "active" | "waiting" | "ended" {
  const s = String(lifecycleState ?? "").trim();
  if (s === "requested" || s === "draft") return "waiting";
  if (s === "ended" || s === "revoked" || s === "rejected") return "ended";
  return "active";
}

export function summarizeAdminCouponDashboardKpi(
  rows: Array<{ lifecycle_state?: string | null }>
): AdminCouponDashboardKpi {
  const kpi: AdminCouponDashboardKpi = { total: rows.length, active: 0, waiting: 0, ended: 0 };
  for (const row of rows) {
    kpi[classifyAdminCouponDashboardBucket(String(row.lifecycle_state ?? ""))] += 1;
  }
  return kpi;
}

export type AdminCouponRecentActivity = {
  created_at: string;
  title: string;
  actor_label: string | null;
  action: string;
};

export function collectAdminCouponRecentActivity(
  rows: Array<{
    title?: string | null;
    audits?: Array<{ created_at?: string | null; actor_label?: string | null; action?: string | null }>;
  }>,
  limit = 8
): AdminCouponRecentActivity[] {
  const out: AdminCouponRecentActivity[] = [];
  for (const row of rows) {
    const title = String(row.title ?? "").trim();
    for (const a of row.audits ?? []) {
      const created_at = String(a.created_at ?? "").trim();
      if (!created_at) continue;
      out.push({
        created_at,
        title,
        actor_label: a.actor_label ? String(a.actor_label) : null,
        action: String(a.action ?? "").trim(),
      });
    }
  }
  out.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return out.slice(0, Math.max(0, limit));
}
