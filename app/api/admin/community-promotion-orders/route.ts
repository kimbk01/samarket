import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { NextRequest, NextResponse } from "next/server";
import { normalizeAdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import { ADMIN_LIST_MAX_OFFSET } from "@/lib/admin/pagination/parse-admin-list-page";
import { mapPointPromotionOrderRow } from "@/lib/points/point-promotion-orders-db";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TAB_STATUSES: Record<string, string[] | null> = {
  active: ["active"],
  paused: ["paused"],
  ended: ["ended", "expired", "cancelled"],
  rejected: ["rejected"],
  pending: ["pending_review", "pending"],
  all: null,
};

/**
 * GET /api/admin/community-promotion-orders?status=active|paused|ended|rejected|pending|all&page=1&pageSize=30
 * (domain=community 고정) · R7 목록 표준: `limit`(20/50/100, 그 외 20) + `offset` 을 주면 page/pageSize 대신 그것을 쓴다.
 * → { ok, status, page, pageSize, total, orders: [{ ...PointPromotionOrder, reviewReason,
 *      buyerNickname, buyerLabel, paidPoints, refundPoints, refundLedgerId, fault, endReasonCode, endedAt, endedBy,
 *      pausedAt, pausedSecondsTotal, post: { id, title, status, authorId, authorLabel } | null }] }
 */
export async function GET(req: NextRequest) {
  const admin = await requireCommunityAdmin("read");
  if (!admin.ok) return admin.response;
  const { sb } = admin;

  const sp = req.nextUrl.searchParams;
  const statusRaw = (sp.get("status") || "all").trim();
  // 탭 이름 또는 기존 화면이 보내는 원래 상태값(pending_review, expired …) 둘 다 받는다.
  const RAW_STATUSES = ["pending", "pending_review", "active", "paused", "expired", "ended", "rejected", "cancelled"];
  const status = statusRaw in TAB_STATUSES || RAW_STATUSES.includes(statusRaw) ? statusRaw : "all";
  let page: number;
  let pageSize: number;
  let from: number;
  if (sp.has("limit")) {
    pageSize = normalizeAdminListPageSize(sp.get("limit"));
    const offRaw = Math.floor(Number(sp.get("offset") ?? 0));
    from = Number.isFinite(offRaw) && offRaw > 0 ? Math.min(offRaw, ADMIN_LIST_MAX_OFFSET) : 0;
    page = Math.floor(from / pageSize) + 1;
  } else {
    // 기존 계약 (page/pageSize) — 그대로
    const pageRaw = Number(sp.get("page") ?? 1);
    const sizeRaw = Number(sp.get("pageSize") ?? 30);
    page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
    pageSize = Number.isFinite(sizeRaw) ? Math.min(100, Math.max(1, Math.floor(sizeRaw))) : 30;
    from = (page - 1) * pageSize;
  }

  let q = sb
    .from("point_promotion_orders")
    .select("*", { count: "exact" })
    .eq("domain", "community")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + pageSize - 1);
  const statuses = status in TAB_STATUSES ? TAB_STATUSES[status] : [status];
  if (statuses) q = q.in("order_status", statuses);

  const { data, error, count } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const orderIds = rows.map((r) => String(r.id ?? "")).filter(Boolean);
  const postIds = [...new Set(rows.map((r) => String(r.target_id ?? "")).filter(Boolean))];

  const [postsRes, ledgerRes] = await Promise.all([
    postIds.length
      ? sb.from("community_posts").select("id, title, status, user_id, origin_kind, display_author_name").in("id", postIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    orderIds.length
      ? sb
          .from("point_ledger")
          .select("related_id, amount, entry_type")
          .eq("related_type", "promotion_order")
          .eq("entry_type", "spend")
          .in("related_id", orderIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);

  const postById = new Map<string, Record<string, unknown>>();
  for (const p of (postsRes.data ?? []) as Array<Record<string, unknown>>) postById.set(String(p.id), p);
  const paidByOrder = new Map<string, number>();
  for (const l of (ledgerRes.data ?? []) as Array<Record<string, unknown>>) {
    const k = String(l.related_id ?? "");
    if (!k || paidByOrder.has(k)) continue;
    paidByOrder.set(k, Math.abs(Number(l.amount ?? 0)) || 0);
  }

  const identityMap = await loadAdminMemberIdentityMap(sb, [
    ...rows.map((r) => String(r.user_id ?? "")),
    ...[...postById.values()].map((p) => String(p.user_id ?? "")),
  ]);

  const orders = rows.map((r) => {
    const mapped = mapPointPromotionOrderRow(r);
    const buyer = identityMap.get(mapped.userId);
    const post = postById.get(mapped.targetId);
    const authorId = post ? String(post.user_id ?? "") : "";
    const id = mapped.id;
    return {
      ...mapped,
      reviewReason: r.review_reason != null ? String(r.review_reason) : null,
      buyerNickname: buyer?.nickname ?? null,
      buyerLabel: formatAdminMemberLabel(buyer ?? null),
      paidPoints: paidByOrder.has(id) ? paidByOrder.get(id)! : null,
      refundPoints: r.refund_points != null ? Number(r.refund_points) : null,
      refundLedgerId: r.refund_ledger_id != null ? String(r.refund_ledger_id) : null,
      fault: r.fault != null ? String(r.fault) : null,
      endReasonCode: r.end_reason_code != null ? String(r.end_reason_code) : null,
      endedAt: r.ended_at != null ? String(r.ended_at) : null,
      endedBy: r.ended_by != null ? String(r.ended_by) : null,
      pausedAt: r.paused_at != null ? String(r.paused_at) : null,
      pausedSecondsTotal: Number(r.paused_seconds_total ?? 0) || 0,
      post: post
        ? {
            id: String(post.id),
            title: String(post.title ?? ""),
            status: String(post.status ?? ""),
            authorId: authorId || null,
            authorLabel:
              post.origin_kind === "imported" || post.origin_kind === "admin"
                ? String(post.display_author_name ?? "") || formatAdminMemberLabel(identityMap.get(authorId) ?? null)
                : formatAdminMemberLabel(identityMap.get(authorId) ?? null),
          }
        : null,
    };
  });

  return NextResponse.json({
    ok: true,
    status,
    page,
    pageSize,
    limit: pageSize,
    offset: from,
    total: count ?? orders.length,
    orders,
  });
}
