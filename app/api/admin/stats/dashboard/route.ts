import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import type {
  ChatStatusSummary,
  DashboardStats,
  DashboardTrendItem,
  ProductStatusSummary,
  RecentChat,
  RecentProduct,
  RecentReport,
  RecentReview,
  RecentUser,
  ReportStatusSummary,
  UserStatusSummary,
} from "@/lib/types/admin-dashboard";

const PRODUCT_STATUSES: (keyof ProductStatusSummary)[] = [
  "active",
  "reserved",
  "sold",
  "hidden",
  "blinded",
  "deleted",
];

const REPORT_REASON_LABELS: Record<string, string> = {
  spam: "스팸",
  inappropriate: "부적절한 내용",
  scam: "사기",
  harassment: "괴롭힘",
  other: "기타",
};

function todayStartISO(now = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function utcDayStartIsoStrings(days: number, now: Date): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push(d.toISOString());
  }
  return out;
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

async function countAuthUsersSince(sb: any, sinceMs: number): Promise<number> {
  let n = 0;
  let page = 1;
  try {
    while (page <= 40) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !data?.users?.length) break;
      for (const u of data.users) {
        const c = u.created_at ? new Date(u.created_at).getTime() : NaN;
        if (Number.isFinite(c) && c >= sinceMs) n++;
      }
      if (data.users.length < 1000) break;
      page++;
    }
  } catch {
    return 0;
  }
  return n;
}

async function authUsersCreatedPerUtcDay(sb: any, dayStartsIso: string[]): Promise<number[]> {
  const counts = new Array(dayStartsIso.length).fill(0);
  const bounds = dayStartsIso.map((s) => {
    const start = new Date(s).getTime();
    return { start, end: start + 86400000 };
  });
  let page = 1;
  try {
    while (page <= 40) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !data?.users?.length) break;
      for (const u of data.users) {
        const c = u.created_at ? new Date(u.created_at).getTime() : NaN;
        if (!Number.isFinite(c)) continue;
        for (let i = 0; i < bounds.length; i++) {
          if (c >= bounds[i].start && c < bounds[i].end) {
            counts[i]++;
            break;
          }
        }
      }
      if (data.users.length < 1000) break;
      page++;
    }
  } catch {
    /* ignore */
  }
  return counts;
}

export async function GET() {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    // 프론트에서 mock fallback을 쓰지 않도록, 최소한의 구조를 반환.
    return NextResponse.json({ error: "server_config" }, { status: 500 });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const todayStart = todayStartISO(now);
  const todayStartMs = new Date(todayStart).getTime();

  const sbAny = sb as any;

  // 1) KPI 숫자들
  const totalFavorites = await (async () => {
    const { count, error } = await sbAny
      .from("favorites")
      .select("*", { count: "exact", head: true });
    if (error) return 0;
    return typeof count === "number" ? count : 0;
  })();

  const totalUsers = await (async () => {
    const { count, error } = await sbAny.from("profiles").select("*", { count: "exact", head: true });
    if (error) return 0;
    return typeof count === "number" ? count : 0;
  })();

  const newUsersToday = await countAuthUsersSince(sb, todayStartMs);

  const newProductsToday = await (async () => {
    const { count, error } = await sbAny
      .from("posts")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart);
    if (error) return 0;
    return typeof count === "number" ? count : 0;
  })();

  const activeProducts = await (async () => {
    const { count, error } = await sbAny
      .from("posts")
      .select("*", { count: "exact", head: true })
      .in("status", ["active", "reserved"]);
    if (error) return 0;
    return typeof count === "number" ? count : 0;
  })();

  const pendingReports = await (async () => {
    const { count, error } = await sbAny
      .from("reports")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "reviewing"]);
    if (error) return 0;
    return typeof count === "number" ? count : 0;
  })();

  const chatsToday = await (async () => {
    const { count, error } = await sbAny
      .from("product_chats")
      .select("*", { count: "exact", head: true })
      .gte("last_message_at", todayStart);
    if (error) return 0;
    return typeof count === "number" ? count : 0;
  })();

  const completedTransactions = await (async () => {
    const { count, error } = await sbAny
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("status", "sold");
    if (error) return 0;
    return typeof count === "number" ? count : 0;
  })();

  const averageTrustScore = await (async () => {
    const { data, error } = await sbAny.from("profiles").select("trust_score");
    if (error || !Array.isArray(data)) return 50;
    const nums = data
      .map((r: { trust_score?: number | string | null }) => Number(r.trust_score))
      .filter((n: number) => Number.isFinite(n));
    if (nums.length === 0) return 50;
    return Math.round((nums.reduce((a: number, b: number) => a + b, 0) / nums.length) * 10) / 10;
  })();

  const stats: DashboardStats = {
    totalUsers,
    activeProducts,
    newProductsToday,
    newUsersToday,
    pendingReports,
    chatsToday,
    completedTransactions,
    averageTrustScore,
    totalFavorites,
    updatedAt: nowIso,
  };

  // 2) 상품 상태 요약
  const productSummary: ProductStatusSummary = {} as ProductStatusSummary;
  await Promise.all(
    PRODUCT_STATUSES.map(async (statusKey) => {
      const { count, error } = await sbAny
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("status", statusKey);
      if (error) {
        productSummary[statusKey] = 0;
      } else {
        productSummary[statusKey] = typeof count === "number" ? count : 0;
      }
    })
  );

  // 3) 신고 상태 요약
  const reportSummary: ReportStatusSummary = {
    pending: 0,
    reviewed: 0,
    rejected: 0,
  };

  {
    const { count, error } = await sbAny
      .from("reports")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "reviewing"]);
    if (!error) reportSummary.pending = typeof count === "number" ? count : 0;
  }
  {
    const { count, error } = await sbAny
      .from("reports")
      .select("*", { count: "exact", head: true })
      .in("status", ["reviewed", "resolved", "sanctioned"]);
    if (!error) reportSummary.reviewed = typeof count === "number" ? count : 0;
  }
  {
    const { count, error } = await sbAny
      .from("reports")
      .select("*", { count: "exact", head: true })
      .eq("status", "rejected");
    if (!error) reportSummary.rejected = typeof count === "number" ? count : 0;
  }

  // 4) 채팅 상태 요약 (product_chats 기준)
  const chatSummary: ChatStatusSummary = {
    active: 0,
    blocked: 0,
    reported: 0,
    archived: 0,
  };

  const chatStatusMap: Record<keyof ChatStatusSummary, string> = {
    active: "active",
    blocked: "blocked",
    reported: "report_hold",
    archived: "closed",
  };

  await Promise.all(
    (Object.keys(chatStatusMap) as (keyof ChatStatusSummary)[]).map(async (uiKey) => {
      const { count, error } = await sbAny
        .from("product_chats")
        .select("*", { count: "exact", head: true })
        .eq("room_status", chatStatusMap[uiKey]);
      if (error) chatSummary[uiKey] = 0;
      else chatSummary[uiKey] = typeof count === "number" ? count : 0;
    })
  );

  // 5) 회원 상태 요약 (sanctions 기반 moderationStatus + role 기반 premium/admin)
  const moderationCounts = await (async () => {
    const { data: activeSanctions } = await sbAny
      .from("sanctions")
      .select("user_id, sanction_type")
      .or(`end_at.is.null,end_at.gt.${nowIso}`);

    const rows = (activeSanctions ?? []) as { user_id: string; sanction_type: string }[];
    const bannedUsers = new Set(
      rows.filter((r) => r.sanction_type === "permanent_ban").map((r) => r.user_id)
    );
    const suspendedUsers = new Set(
      rows.filter(
        (r) => r.sanction_type === "temp_suspend" || r.sanction_type === "chat_ban"
      ).map((r) => r.user_id)
    );
    const warnedUsers = new Set(
      rows.filter((r) => r.sanction_type === "warning").map((r) => r.user_id)
    );

    const banned = bannedUsers.size;
    const suspended = [...suspendedUsers].filter((id) => !bannedUsers.has(id)).length;
    const warned = [...warnedUsers].filter(
      (id) => !bannedUsers.has(id) && !suspendedUsers.has(id)
    ).length;
    const active = Math.max(0, totalUsers - banned - suspended - warned);

    return { active, warned, suspended, banned };
  })();

  const premiumAndAdminCounts = await (async () => {
    const { count: premiumCount, error: premiumErr } = await sbAny
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .in("role", ["special", "premium"]);
    const { count: adminCount, error: adminErr } = await sbAny
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .in("role", ["admin", "master"]);

    return {
      premium: !premiumErr && typeof premiumCount === "number" ? premiumCount : 0,
      admin: !adminErr && typeof adminCount === "number" ? adminCount : 0,
    };
  })();

  const userSummary: UserStatusSummary = {
    active: moderationCounts.active,
    warned: moderationCounts.warned,
    suspended: moderationCounts.suspended,
    banned: moderationCounts.banned,
    premium: premiumAndAdminCounts.premium,
    admin: premiumAndAdminCounts.admin,
  };

  // 6) 최근 활동 패널 데이터
  const RECENT_LIMIT = 5;

  const recentProducts: RecentProduct[] = await (async () => {
    const { data: posts, error } = await sbAny
      .from("posts")
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
  })();

  const recentUsers: RecentUser[] = await (async () => {
    const { data: users, error } = await sbAny
      .from("profiles")
      .select("id, nickname, username, role, created_at, updated_at")
      .order("id", { ascending: false })
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
  })();

  const toReportPanelStatus = (s: string): RecentReport["status"] => {
    if (s === "rejected") return "rejected";
    if (s === "pending" || s === "reviewing") return "pending";
    return "reviewed";
  };

  const recentReports: RecentReport[] = await (async () => {
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
      reasonLabel: REPORT_REASON_LABELS[r.reason_code] ?? r.reason_code ?? "-",
      status: toReportPanelStatus(r.status ?? "pending"),
      createdAt: r.created_at,
    }));
  })();

  const recentChats: RecentChat[] = await (async () => {
    const { data: rooms, error } = await sbAny
      .from("product_chats")
      .select("id, post_id, seller_id, buyer_id, last_message_at, last_message_preview, created_at")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(RECENT_LIMIT);
    if (error || !Array.isArray(rooms)) return [];

    const postIds = [...new Set(rooms.map((r: any) => r.post_id).filter(Boolean))] as string[];
    const partnerIds = [...new Set(rooms.flatMap((r: any) => [r.seller_id, r.buyer_id]).filter(Boolean))] as string[];

    const { data: posts } = postIds.length
      ? await sbAny.from("posts").select("id, title").in("id", postIds)
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
  })();

  const recentReviews: RecentReview[] = await (async () => {
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
  })();

  const trendDays = 7;
  const dayStarts = utcDayStartIsoStrings(trendDays, now);
  const newUsersByDay = await authUsersCreatedPerUtcDay(sb, dayStarts);
  const trend: DashboardTrendItem[] = [];
  for (let i = 0; i < trendDays; i++) {
    const start = dayStarts[i];
    const end = new Date(new Date(start).getTime() + 86400000).toISOString();
    const dateLabel = start.slice(0, 10);
    const [{ count: np }, { count: rep }, trQ] = await Promise.all([
      sbAny.from("posts").select("*", { count: "exact", head: true }).gte("created_at", start).lt("created_at", end),
      sbAny.from("reports").select("*", { count: "exact", head: true }).gte("created_at", start).lt("created_at", end),
      sbAny
        .from("transaction_reviews")
        .select("*", { count: "exact", head: true })
        .gte("created_at", start)
        .lt("created_at", end),
    ]);
    const trCount = !trQ.error && typeof trQ.count === "number" ? trQ.count : 0;
    trend.push({
      date: dateLabel,
      newUsers: newUsersByDay[i] ?? 0,
      newProducts: typeof np === "number" ? np : 0,
      reports: typeof rep === "number" ? rep : 0,
      completedTransactions: trCount,
    });
  }

  return NextResponse.json({
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
  });
}

