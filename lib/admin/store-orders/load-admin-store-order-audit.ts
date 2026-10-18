/**
 * 감사 로그 화면 — `audit_logs` (target_type = store_order) page with order number, actor label and
 * category filter. QA records (`fin_ssot_*`, `phase_d_*`) are excluded unless asked for (D8) — never deleted.
 * Read-only; rows are returned as stored.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STORE_ORDER_AUDIT_KNOWN_ACTIONS,
  storeOrderAuditCategoryActions,
  type AdminAuditCategory,
} from "@/lib/admin/store-orders/admin-store-order-audit-labels";
import {
  ADMIN_ORDER_OPS_PAGE_SIZE,
  ADMIN_ORDER_OPS_PERIODS,
  resolveAdminOrderOpsPeriod,
  type AdminOrderOpsPeriod,
} from "@/lib/admin/store-orders/admin-store-order-ops-contract";
import { loadAdminUserLabels } from "@/lib/admin/store-orders/load-admin-store-order-detail";

export const ADMIN_AUDIT_FILTER_CATEGORIES = ["all", "admin", "owner", "buyer", "system", "other", "qa"] as const;
export type AdminAuditFilterCategory = (typeof ADMIN_AUDIT_FILTER_CATEGORIES)[number];

export type AdminOrderAuditQuery = {
  category: AdminAuditFilterCategory;
  /** Order number (partial) or order uuid. */
  q: string;
  period: AdminOrderOpsPeriod;
  fromDay: string | null;
  toDay: string | null;
  page: number;
  pageSize: number;
};

export const ADMIN_ORDER_AUDIT_PAGE_SIZE = ADMIN_ORDER_OPS_PAGE_SIZE;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseAdminOrderAuditQuery(sp: URLSearchParams): AdminOrderAuditQuery {
  const cat = String(sp.get("category") ?? "");
  const period = String(sp.get("period") ?? "");
  const day = (v: string | null) => (v && DAY_RE.test(v) ? v : null);
  return {
    category: (ADMIN_AUDIT_FILTER_CATEGORIES as readonly string[]).includes(cat) ? (cat as AdminAuditFilterCategory) : "all",
    q: String(sp.get("q") ?? sp.get("order_no") ?? "").trim().slice(0, 80),
    period: (ADMIN_ORDER_OPS_PERIODS as readonly string[]).includes(period) ? (period as AdminOrderOpsPeriod) : "all",
    fromDay: day(sp.get("from")),
    toDay: day(sp.get("to")),
    page: Math.max(1, Math.floor(Number(sp.get("page")) || 1)),
    pageSize: ADMIN_ORDER_AUDIT_PAGE_SIZE,
  };
}

export function adminOrderAuditQueryToParams(q: AdminOrderAuditQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.category !== "all") p.set("category", q.category);
  if (q.q) p.set("q", q.q);
  if (q.period !== "all") p.set("period", q.period);
  if (q.period === "custom") {
    if (q.fromDay) p.set("from", q.fromDay);
    if (q.toDay) p.set("to", q.toDay);
  }
  if (q.page > 1) p.set("page", String(q.page));
  return p;
}

export type AdminOrderAuditPageRow = {
  id: string;
  created_at: string;
  action: string;
  actor_type: string;
  actor_id: string | null;
  actor_label: string | null;
  before_json: unknown;
  after_json: unknown;
  order_id: string | null;
  order_no: string | null;
};

export type LoadAdminOrderAuditOutcome =
  | { ok: true; total: number; rows: AdminOrderAuditPageRow[] }
  | { ok: false; error: "query_failed"; message: string };

const QA_LIKE = ["fin_ssot_%", "phase_d_%"];
const inList = (xs: readonly string[]) => `(${xs.map((x) => `"${x}"`).join(",")})`;

export async function loadAdminOrderAuditPage(sb: SupabaseClient, q: AdminOrderAuditQuery): Promise<LoadAdminOrderAuditOutcome> {
  let orderIds: string[] | null = null;
  if (q.q) {
    if (UUID_RE.test(q.q)) orderIds = [q.q.toLowerCase()];
    else {
      const { data, error } = await sb.from("store_orders").select("id").ilike("order_no", `%${q.q.replace(/[%_]/g, "")}%`).limit(200);
      if (error) return { ok: false, error: "query_failed", message: error.message };
      orderIds = (data ?? []).map((r) => String((r as { id: string }).id));
      if (orderIds.length === 0) return { ok: true, total: 0, rows: [] };
    }
  }

  const { fromIso, toIso } = resolveAdminOrderOpsPeriod(q.period, q.fromDay, q.toDay);
  let query = sb
    .from("audit_logs")
    .select("id, created_at, action, actor_type, actor_id, target_id, before_json, after_json", { count: "exact" })
    .eq("target_type", "store_order");
  if (orderIds) query = query.in("target_id", orderIds);
  if (fromIso) query = query.gte("created_at", fromIso);
  if (toIso) query = query.lt("created_at", toIso);

  const cat = q.category;
  if (cat === "qa") {
    query = query.or(QA_LIKE.map((p) => `action.like.${p}`).join(","));
  } else {
    for (const p of QA_LIKE) query = query.not("action", "like", p);
    if (cat === "other") query = query.not("action", "in", inList(STORE_ORDER_AUDIT_KNOWN_ACTIONS));
    else if (cat !== "all") query = query.in("action", storeOrderAuditCategoryActions(cat as Exclude<AdminAuditCategory, "qa" | "other">));
  }

  const from = (q.page - 1) * q.pageSize;
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + q.pageSize - 1);
  if (error) return { ok: false, error: "query_failed", message: error.message };

  const raw = (data ?? []) as Record<string, unknown>[];
  const ids = [...new Set(raw.map((r) => String(r.target_id ?? "")).filter((v) => UUID_RE.test(v)))];
  const [ordersRes, labels] = await Promise.all([
    ids.length ? sb.from("store_orders").select("id, order_no").in("id", ids) : Promise.resolve({ data: [], error: null }),
    loadAdminUserLabels(sb, raw.map((r) => String(r.actor_id ?? ""))),
  ]);
  if (ordersRes.error) return { ok: false, error: "query_failed", message: ordersRes.error.message };
  const orderNo = new Map((ordersRes.data ?? []).map((o) => [String((o as { id: string }).id), String((o as { order_no: string }).order_no ?? "")]));

  return {
    ok: true,
    total: count ?? raw.length,
    rows: raw.map((r) => {
      const target = String(r.target_id ?? "");
      const actorId = r.actor_id ? String(r.actor_id) : null;
      return {
        id: String(r.id),
        created_at: String(r.created_at ?? ""),
        action: String(r.action ?? ""),
        actor_type: String(r.actor_type ?? ""),
        actor_id: actorId,
        actor_label: actorId ? labels.get(actorId) ?? null : null,
        before_json: r.before_json ?? null,
        after_json: r.after_json ?? null,
        order_id: orderNo.has(target) ? target : null,
        order_no: orderNo.get(target) || null,
      };
    }),
  };
}
