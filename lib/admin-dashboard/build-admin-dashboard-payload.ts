/**
 * Admin dashboard payload — GET /api/admin/stats/dashboard and RSC.
 * KPIs + trend: admin_dashboard_aggregate_json, admin_dashboard_trend_utc_json.
 * SQL: supabase/migrations/20260415150000_admin_dashboard_aggregate_rpc.sql
 */
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  parseAdminDashboardAggregateRpc,
  parseAdminDashboardTrendRpc,
} from "@/lib/admin-dashboard/admin-dashboard-rpc-map";
import { ADMIN_DASHBOARD_REPORT_REASON_LABELS } from "@/lib/admin-dashboard/report-reason-labels";
import type {
  DashboardPayload,
  RecentChat,
  RecentProduct,
  RecentReport,
  RecentReview,
  RecentUser,
} from "@/lib/types/admin-dashboard";

function todayStartISO(now = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function mapNicknamesFromProfiles(sbAny: any, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const { data } = await sbAny.from("profiles").select("id, nickname, username").in("id", ids);
  for (const u of (data ?? []) as { id: string; nickname?: string | null; username?: string | null }[]) {
    const id = String(u.id ?? "");
    const label = String(u.nickname ?? u.username ?? id).trim() || id.slice(0, 8);
    map.set(id, label);
  }
  return map;
}

export async function buildAdminDashboardPayload(): Promise<DashboardPayload> {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    throw new Error("server_config");
  }
  const now = new Date();
  const nowIso = now.toISOString();
  const todayStart = todayStartISO(now);

  const sbAny = sb as any;

  const RECENT_LIMIT = 5;

  const toReportPanelStatus = (s: string): RecentReport["status"] => {
    if (s === "rejected") return "rejected";
    if (s === "pending" || s === "reviewing") return "pending";
    return "reviewed";
  };

  const [
    aggRes,
    trendRes,
    recentProducts,
    recentUsers,
    recentReports,
    recentChats,
    recentReviews,
  ] = await Promise.all([
    sbAny.rpc("admin_dashboard_aggregate_json", { p_today_start: todayStart }),
    sbAny.rpc("admin_dashboard_trend_utc_json"),
    (async (): Promise<RecentProduct[]> => {
      const { data: posts, error } = await sbAny
        .from(POSTS_TABLE_READ)
        .select("id, title, status, user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT);
      if (error || !Array.isArray(posts)) return [];

      const userIds = [...new Set(posts.map((p: any) => p.user_id).filter(Boolean))] as string[];
      const nicknameById = await mapNicknamesFromProfiles(sbAny, userIds);

      return posts.map((p: any) => ({
        id: p.id,
        title: p.title ?? "",
        sellerNickname: (nicknameById.get(String(p.user_id ?? "")) ?? String(p.user_id ?? "").slice(0, 8)) || "-",
        status: p.status ?? "active",
        createdAt: p.created_at,
      }));
    })(),
    (async (): Promise<RecentUser[]> => {
      const { data: users, error } = await sbAny
        .from("profiles")
        .select("id, nickname, username, role, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT);
      if (error || !Array.isArray(users)) return [];

      return users.map((u: Record<string, unknown>) => {
        const role = String(u.role ?? "");
        const memberType: RecentUser["memberType"] =
          role === "admin" || role === "master"
            ? "admin"
            : role === "special" || role === "premium"
              ? "premium"
              : "normal";
        const id = String(u.id ?? "");
        const nickname = String(u.nickname ?? u.username ?? id).trim() || id.slice(0, 8);
        const joinedAt =
          (typeof u.created_at === "string" && u.created_at) ||
          (typeof u.updated_at === "string" && u.updated_at) ||
          nowIso;
        return {
          id,
          nickname,
          memberType,
          joinedAt,
        };
      });
    })(),
    (async (): Promise<RecentReport[]> => {
      const { data: rows, error } = await sbAny
        .from("reports")
        .select("id, target_type, reason_code, status, created_at")
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT);
      if (error || !Array.isArray(rows)) return [];

      const toTargetType = (t: string): RecentReport["targetType"] => {
        if (t === "product" || t === "user") return t;
        if (t === "chat_room" || t === "chat_message") return "chat";
        return "product";
      };

      return rows.map((r: any) => ({
        id: r.id,
        targetType: toTargetType(r.target_type ?? ""),
        reasonLabel: ADMIN_DASHBOARD_REPORT_REASON_LABELS[r.reason_code] ?? r.reason_code ?? "-",
        status: toReportPanelStatus(r.status ?? "pending"),
        createdAt: r.created_at,
      }));
    })(),
    (async (): Promise<RecentChat[]> => {
      const { data: rooms, error } = await sbAny
        .from("product_chats")
        .select("id, post_id, seller_id, buyer_id, last_message_at, last_message_preview, created_at")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(RECENT_LIMIT);
      if (error || !Array.isArray(rooms)) return [];

      const postIds = [...new Set(rooms.map((r: any) => r.post_id).filter(Boolean))] as string[];
      const partnerIds = [...new Set(rooms.flatMap((r: any) => [r.seller_id, r.buyer_id]).filter(Boolean))] as string[];

      const { data: posts } = postIds.length
        ? await sbAny.from(POSTS_TABLE_READ).select("id, title").in("id", postIds)
        : { data: [] };
      const postTitleById = new Map<string, string>(
        (posts ?? []).map((p: any) => [String(p.id ?? ""), String(p.title ?? "")])
      );

      const nicknameById = partnerIds.length ? await mapNicknamesFromProfiles(sbAny, partnerIds) : new Map();

      return rooms.map((r: any) => ({
        id: r.id,
        productTitle: postTitleById.get(String(r.post_id ?? "")) || "(제목 없음)",
        buyerNickname: nicknameById.get(String(r.buyer_id ?? "")) ?? String(r.buyer_id ?? "").slice(0, 8),
        sellerNickname: nicknameById.get(String(r.seller_id ?? "")) ?? String(r.seller_id ?? "").slice(0, 8),
        lastMessageAt: r.last_message_at ?? r.created_at,
      }));
    })(),
    (async (): Promise<RecentReview[]> => {
      const { data: rows, error } = await sbAny
        .from("transaction_reviews")
        .select("id, reviewer_id, reviewee_id, public_review_type, created_at")
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT);
      if (error || !Array.isArray(rows)) return [];

      const userIds = [...new Set(rows.flatMap((r: any) => [r.reviewer_id, r.reviewee_id]).filter(Boolean))] as string[];
      const nicknameById = userIds.length ? await mapNicknamesFromProfiles(sbAny, userIds) : new Map();

      const toRating = (t: string): number => {
        if (t === "good") return 5;
        if (t === "bad") return 1;
        return 3;
      };

      return rows.map((r: any) => ({
        id: r.id,
        reviewerNickname: nicknameById.get(String(r.reviewer_id ?? "")) ?? String(r.reviewer_id ?? "").slice(0, 8),
        targetNickname: nicknameById.get(String(r.reviewee_id ?? "")) ?? String(r.reviewee_id ?? "").slice(0, 8),
        rating: toRating(r.public_review_type ?? ""),
        createdAt: r.created_at,
      }));
    })(),
  ]);

  if (aggRes.error) {
    throw new Error(
      `admin_dashboard_aggregate_json: ${aggRes.error.message ?? "rpc failed"}`
    );
  }
  if (trendRes.error) {
    throw new Error(
      `admin_dashboard_trend_utc_json: ${trendRes.error.message ?? "rpc failed"}`
    );
  }

  const { stats, productSummary, reportSummary, chatSummary, userSummary } = parseAdminDashboardAggregateRpc(
    aggRes.data,
    nowIso
  );
  const trend = parseAdminDashboardTrendRpc(trendRes.data);

  return {
    stats,
    productSummary,
    userSummary,
    reportSummary,
    chatSummary,
    recentProducts,
    recentUsers,
    recentReports,
    recentChats,
    recentReviews,
    trend,
  };
}
