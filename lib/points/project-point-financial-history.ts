/**
 * Load + project Point financial history from point_ledger SSOT.
 * DO NOT: invent balances, recompute promotion prices from catalog, or touch archived store-credit schema.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingPointsTable } from "@/lib/points/admin-user-points-shared";
import { POINT_LEDGER_ROW_SELECT } from "@/lib/points/point-query-select";
import {
  decodePointFinancialCursor,
  encodePointFinancialCursor,
  matchesPointFinancialFilter,
  normalizePointFinancialCategory,
  normalizePointFinancialDirection,
  pointFinancialCategoryTitle,
  promotionProductDisplayLabel,
  type PointFinancialDepositFact,
  type PointFinancialFilter,
  type PointFinancialHistoryItem,
  type PointFinancialHistoryPage,
  type PointFinancialPromotionFact,
  type PointFinancialSummary,
} from "@/lib/points/point-financial-history";
import { mapPointPromotionOrderRow } from "@/lib/points/point-promotion-orders-db";
import { readUserPointBalance, sumUserPointLedger } from "@/lib/points/user-point-ledger";
import type { PointPromotionOrder } from "@/lib/types/point";

const DELETED_POST_KO = "삭제된 게시물";
const DELETED_POST_EN = "Deleted post";

type LedgerRow = Record<string, unknown>;

function communityFinancialTitles(
  relatedType: string,
  entryType: string,
  description: string
): { titleKey: string; fallbackTitleKo: string; fallbackTitleEn: string } | null {
  const rt = relatedType.trim().toLowerCase();
  if (rt === "community_reward") {
    const isComment = description.includes("댓글");
    const isQna = description.includes("질문");
    if (isComment) {
      return {
        titleKey: "point_fin_community_comment",
        fallbackTitleKo: "커뮤니티 댓글 작성",
        fallbackTitleEn: "Community comment",
      };
    }
    if (isQna) {
      return {
        titleKey: "point_fin_community_question",
        fallbackTitleKo: "커뮤니티 질문 작성",
        fallbackTitleEn: "Community question",
      };
    }
    return {
      titleKey: "point_fin_community_post",
      fallbackTitleKo: "커뮤니티 게시글 작성",
      fallbackTitleEn: "Community post",
    };
  }
  if (rt === "community_reclaim" || (entryType === "reverse" && rt === "community_reclaim")) {
    return {
      titleKey: "point_fin_community_reclaim",
      fallbackTitleKo: "커뮤니티 포인트 회수",
      fallbackTitleEn: "Community point reversal",
    };
  }
  return null;
}

function asLedgerItemBase(row: LedgerRow): PointFinancialHistoryItem {
  const amount = Math.trunc(Number(row.amount ?? 0));
  const entryType = String(row.entry_type ?? "");
  const relatedType = String(row.related_type ?? "");
  const relatedId = String(row.related_id ?? "");
  const description = String(row.description ?? "");
  const category = normalizePointFinancialCategory(entryType, relatedType);
  const titles = communityFinancialTitles(relatedType, entryType, description) ?? pointFinancialCategoryTitle(category);
  const direction = normalizePointFinancialDirection(amount);
  // admin_adjust with signed amount
  let resolvedCategory = category;
  let resolvedTitles = titles;
  if (entryType === "admin_adjust") {
    if (amount >= 0) {
      resolvedCategory = "ADMIN_CREDIT";
      resolvedTitles = pointFinancialCategoryTitle("ADMIN_CREDIT");
    } else {
      resolvedCategory = "ADMIN_DEBIT";
      resolvedTitles = pointFinancialCategoryTitle("ADMIN_DEBIT");
    }
  }

  return {
    ledgerId: String(row.id ?? ""),
    userId: String(row.user_id ?? ""),
    occurredAt: String(row.created_at ?? ""),
    direction,
    amount: Math.abs(amount),
    signedAmount: amount,
    balanceAfter: Math.trunc(Number(row.balance_after ?? 0)),
    category: resolvedCategory,
    titleKey: resolvedTitles.titleKey,
    fallbackTitleKo: resolvedTitles.fallbackTitleKo,
    fallbackTitleEn: resolvedTitles.fallbackTitleEn,
    subtitle: description,
    relatedType,
    relatedId,
    entryType,
    description,
    actorType: String(row.actor_type ?? "system"),
    relatedObject: null,
    promotion: null,
    deposit: null,
    adjustment:
      resolvedCategory === "ADMIN_CREDIT" || resolvedCategory === "ADMIN_DEBIT"
        ? {
            reason: description,
            actorType: (String(row.actor_type ?? "admin") as "user" | "admin" | "system"),
          }
        : null,
    status: null,
  };
}

async function loadPromotionMap(
  sb: SupabaseClient,
  orderIds: string[]
): Promise<Map<string, PointPromotionOrder>> {
  const map = new Map<string, PointPromotionOrder>();
  const ids = [...new Set(orderIds.map((x) => x.trim()).filter(Boolean))];
  if (!ids.length) return map;
  const { data, error } = await sb.from("point_promotion_orders").select("*").in("id", ids);
  if (error) {
    if (isMissingPointsTable(error.message ?? "", "point_promotion_orders")) return map;
    return map;
  }
  for (const row of data ?? []) {
    const order = mapPointPromotionOrderRow(row as Record<string, unknown>);
    map.set(order.id, order);
  }
  return map;
}

async function loadChargeMap(
  sb: SupabaseClient,
  chargeIds: string[]
): Promise<Map<string, PointFinancialDepositFact>> {
  const map = new Map<string, PointFinancialDepositFact>();
  const ids = [...new Set(chargeIds.map((x) => x.trim()).filter(Boolean))];
  if (!ids.length) return map;
  const { data, error } = await sb
    .from("point_charge_requests")
    .select(
      "id, plan_name, point_amount, request_status, approved_at, processed_at"
    )
    .in("id", ids);
  if (error) {
    if (isMissingPointsTable(error.message ?? "", "point_charge_requests")) return map;
    return map;
  }
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const id = String(r.id ?? "");
    map.set(id, {
      chargeRequestId: id,
      planName: String(r.plan_name ?? ""),
      pointAmount: Math.trunc(Number(r.point_amount ?? 0)),
      requestStatus: String(r.request_status ?? ""),
      approvedAt: r.approved_at ? String(r.approved_at) : null,
      processedAt: r.processed_at ? String(r.processed_at) : null,
    });
  }
  return map;
}

const DELETED_COMMUNITY_KO = "삭제된 게시글";

async function loadCommunityPostTitleMap(
  sb: SupabaseClient,
  postIds: string[]
): Promise<Map<string, { title: string; missing: boolean }>> {
  const map = new Map<string, { title: string; missing: boolean }>();
  const ids = [...new Set(postIds.map((x) => x.trim()).filter(Boolean))];
  if (!ids.length) return map;
  const { data, error } = await sb
    .from("community_posts")
    .select("id, title, status")
    .in("id", ids);
  if (error) {
    for (const id of ids) map.set(id, { title: "", missing: true });
    return map;
  }
  const found = new Set<string>();
  for (const row of data ?? []) {
    const r = row as { id?: string; title?: string; status?: string };
    const id = String(r.id ?? "");
    found.add(id);
    const status = String(r.status ?? "").toLowerCase();
    const deleted = status === "deleted" || status === "hidden";
    map.set(id, {
      title: deleted ? "" : String(r.title ?? "").trim(),
      missing: deleted || !String(r.title ?? "").trim(),
    });
  }
  for (const id of ids) {
    if (!found.has(id)) map.set(id, { title: "", missing: true });
  }
  return map;
}

function enrichCommunityItem(
  item: PointFinancialHistoryItem,
  communityPosts: Map<string, { title: string; missing: boolean }>
): PointFinancialHistoryItem {
  if (item.relatedType !== "community_reward" || !item.relatedId) return item;
  const meta = communityPosts.get(item.relatedId);
  if (!meta) return item;
  if (meta.missing) {
    return {
      ...item,
      relatedObject: {
        kind: "post",
        id: item.relatedId,
        label: DELETED_COMMUNITY_KO,
        missing: true,
      },
      subtitle: item.subtitle || DELETED_COMMUNITY_KO,
    };
  }
  return {
    ...item,
    relatedObject: {
      kind: "post",
      id: item.relatedId,
      label: meta.title,
      missing: false,
    },
  };
}

async function loadPostTitleMap(
  sb: SupabaseClient,
  postIds: string[]
): Promise<Map<string, { title: string; missing: boolean }>> {
  const map = new Map<string, { title: string; missing: boolean }>();
  const ids = [...new Set(postIds.map((x) => x.trim()).filter(Boolean))];
  if (!ids.length) return map;
  const { data, error } = await sb.from("posts").select("id, title, status").in("id", ids);
  if (error) {
    for (const id of ids) map.set(id, { title: "", missing: true });
    return map;
  }
  const found = new Set<string>();
  for (const row of data ?? []) {
    const r = row as { id?: string; title?: string; status?: string };
    const id = String(r.id ?? "");
    found.add(id);
    const status = String(r.status ?? "").toLowerCase();
    const deleted = status === "deleted" || status === "hidden";
    map.set(id, {
      title: deleted ? "" : String(r.title ?? "").trim(),
      missing: deleted || !String(r.title ?? "").trim(),
    });
  }
  for (const id of ids) {
    if (!found.has(id)) map.set(id, { title: "", missing: true });
  }
  return map;
}

function enrichItem(
  base: PointFinancialHistoryItem,
  promotions: Map<string, PointPromotionOrder>,
  charges: Map<string, PointFinancialDepositFact>,
  posts: Map<string, { title: string; missing: boolean }>
): PointFinancialHistoryItem {
  const item = { ...base };

  if (item.relatedType === "promotion_order" && item.relatedId) {
    const order = promotions.get(item.relatedId);
    if (order) {
      const postMeta = posts.get(order.targetId);
      const targetMissing = !order.targetTitle.trim() && (postMeta?.missing ?? true);
      const targetTitle =
        order.targetTitle.trim() ||
        postMeta?.title ||
        (targetMissing ? DELETED_POST_KO : "");
      const labels = promotionProductDisplayLabel(order.productId, order.durationDays);
      const promo: PointFinancialPromotionFact = {
        orderId: order.id,
        productId: order.productId ?? null,
        productLabelKo: labels.ko,
        productLabelEn: labels.en,
        durationDays: order.durationDays,
        pointCost: order.pointCost,
        startAt: order.startAt,
        endAt: order.endAt,
        orderStatus: order.orderStatus,
        targetType: order.targetType,
        targetId: order.targetId,
        targetTitle: targetTitle || DELETED_POST_KO,
        targetMissing,
      };
      item.promotion = promo;
      item.relatedObject = {
        kind: "post",
        id: order.targetId,
        label: targetTitle || DELETED_POST_KO,
        missing: targetMissing,
      };
      item.subtitle = targetTitle || DELETED_POST_KO;
      item.status = order.orderStatus;
    } else {
      item.relatedObject = {
        kind: "promotion",
        id: item.relatedId,
        label: DELETED_POST_KO,
        missing: true,
      };
      item.subtitle = DELETED_POST_KO;
    }
  }

  if (item.relatedType === "point_charge" && item.relatedId) {
    const dep = charges.get(item.relatedId) ?? null;
    item.deposit = dep;
    if (dep) {
      item.relatedObject = {
        kind: "charge",
        id: dep.chargeRequestId,
        label: dep.planName || "포인트 충전",
        missing: false,
      };
      item.subtitle =
        dep.requestStatus === "approved" || dep.requestStatus === "completed"
          ? "입금 확인 완료"
          : dep.planName || item.description;
      item.status = dep.requestStatus;
    } else if (item.description) {
      item.subtitle = item.description;
    }
  }

  if (!item.subtitle && item.description) item.subtitle = item.description;
  return item;
}

/** After CAPTURE, the original hold debit becomes confirmed FEED_BANNER usage. */
function applyFeedAdHoldCaptureProjection(
  item: PointFinancialHistoryItem,
  holdStatusByRequestId: Map<string, string>
): PointFinancialHistoryItem | null {
  const et = item.entryType.trim().toLowerCase();
  const rt = item.relatedType.trim().toLowerCase();
  if (rt !== "feed_ad_request") return item;

  // Capture audit is amount=0 — hide duplicate; hold row carries the usage amount.
  if (et === "ad_purchase" && item.relatedId.startsWith("capture:")) {
    return null;
  }

  if (et === "ad_hold") {
    const reqId = item.relatedId.replace(/^hold:/, "").trim();
    const st = (holdStatusByRequestId.get(reqId) ?? "").toLowerCase();
    if (st === "captured") {
      const titles = pointFinancialCategoryTitle("FEED_BANNER");
      return {
        ...item,
        category: "FEED_BANNER",
        titleKey: titles.titleKey,
        fallbackTitleKo: titles.fallbackTitleKo,
        fallbackTitleEn: titles.fallbackTitleEn,
        status: "captured",
      };
    }
    if (st === "released") {
      return {
        ...item,
        status: "released",
        subtitle: item.subtitle || "보류 해제됨",
      };
    }
    return { ...item, status: st || "held" };
  }

  return item;
}

async function loadFeedAdHoldStatusMap(
  sb: SupabaseClient,
  requestIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(requestIds.map((x) => x.trim()).filter(Boolean))];
  if (!ids.length) return map;
  const { data, error } = await sb
    .from("feed_ad_point_holds")
    .select("request_id, status")
    .in("request_id", ids);
  if (error) return map;
  for (const row of data ?? []) {
    const r = row as { request_id?: string; status?: string };
    const id = String(r.request_id ?? "");
    if (id) map.set(id, String(r.status ?? ""));
  }
  return map;
}

export type LoadPointFinancialHistoryInput = {
  userId?: string;
  filter?: PointFinancialFilter;
  limit?: number;
  cursor?: string | null;
  /** ISO date lower bound inclusive */
  dateFrom?: string | null;
  dateTo?: string | null;
};

export async function loadPointFinancialHistory(
  sb: SupabaseClient,
  input: LoadPointFinancialHistoryInput
): Promise<
  | { ok: true; page: PointFinancialHistoryPage }
  | { ok: false; error: string; code?: "table_missing" }
> {
  const filter = input.filter ?? "all";
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(input.limit ?? 30) || 30)));
  const cursor = decodePointFinancialCursor(input.cursor);
  const userId = input.userId?.trim() || "";

  let query = sb
    .from("point_ledger")
    .select(POINT_LEDGER_ROW_SELECT)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (userId) query = query.eq("user_id", userId);
  if (input.dateFrom?.trim()) query = query.gte("created_at", input.dateFrom.trim());
  if (input.dateTo?.trim()) query = query.lte("created_at", input.dateTo.trim());
  if (cursor) {
    const ca = cursor.createdAt.replace(/"/g, "");
    const cid = cursor.id.replace(/"/g, "");
    // DESC page: (created_at, id) strictly before cursor
    query = query.or(`created_at.lt."${ca}",and(created_at.eq."${ca}",id.lt."${cid}")`);
  }
  if (filter === "credit") query = query.gt("amount", 0);
  if (filter === "debit") query = query.lt("amount", 0);

  const { data, error } = await query;
  if (error) {
    if (isMissingPointsTable(error.message ?? "", "point_ledger")) {
      return { ok: false, error: "table_missing", code: "table_missing" };
    }
    return { ok: false, error: error.message };
  }

  const rows = (data ?? []) as LedgerRow[];
  const pageRows = rows.slice(0, limit);
  const hasMore = rows.length > limit;

  const promoIds = pageRows
    .filter((r) => String(r.related_type ?? "") === "promotion_order")
    .map((r) => String(r.related_id ?? ""));
  const chargeIds = pageRows
    .filter((r) => String(r.related_type ?? "") === "point_charge")
    .map((r) => String(r.related_id ?? ""));

  const promotions = await loadPromotionMap(sb, promoIds);
  const charges = await loadChargeMap(sb, chargeIds);
  const postIds = [...promotions.values()]
    .filter((o) => o.targetType === "product")
    .map((o) => o.targetId);
  const posts = await loadPostTitleMap(sb, postIds);
  const communityIds = pageRows
    .filter((r) => String(r.related_type ?? "") === "community_reward")
    .map((r) => String(r.related_id ?? ""));
  const communityPosts = await loadCommunityPostTitleMap(sb, communityIds);

  const feedRequestIds = pageRows
    .filter((r) => String(r.related_type ?? "") === "feed_ad_request")
    .map((r) => {
      const rid = String(r.related_id ?? "");
      return rid.replace(/^(hold:|release:|capture:)/, "").trim();
    })
    .filter(Boolean);
  const holdStatus = await loadFeedAdHoldStatusMap(sb, feedRequestIds);

  const items = pageRows
    .map((row) =>
      enrichCommunityItem(
        enrichItem(asLedgerItemBase(row), promotions, charges, posts),
        communityPosts
      )
    )
    .map((item) => applyFeedAdHoldCaptureProjection(item, holdStatus))
    .filter((item): item is PointFinancialHistoryItem => item != null)
    .filter((item) => matchesPointFinancialFilter(item, filter));

  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last
      ? {
          createdAt: String(last.created_at ?? ""),
          id: String(last.id ?? ""),
        }
      : null;

  return {
    ok: true,
    page: {
      items,
      nextCursor,
      hasMore: Boolean(nextCursor),
    },
  };
}

export function serializePointFinancialPage(page: PointFinancialHistoryPage) {
  return {
    items: page.items,
    hasMore: page.hasMore,
    nextCursor: page.nextCursor ? encodePointFinancialCursor(page.nextCursor) : null,
  };
}

export async function loadPointFinancialSummary(
  sb: SupabaseClient,
  userId: string
): Promise<PointFinancialSummary> {
  const uid = userId.trim();
  const balance = await readUserPointBalance(sb, uid);
  const summed = await sumUserPointLedger(sb, uid);
  const ledgerSum = summed.ok ? summed.sum : null;

  let totalCredit = 0;
  let totalDebit = 0;
  let lastOccurredAt: string | null = null;

  const { data } = await sb
    .from("point_ledger")
    .select("amount, created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(5000);

  for (const row of data ?? []) {
    const amount = Math.trunc(Number((row as { amount?: number }).amount ?? 0));
    if (amount > 0) totalCredit += amount;
    else if (amount < 0) totalDebit += Math.abs(amount);
    if (!lastOccurredAt) {
      lastOccurredAt = String((row as { created_at?: string }).created_at ?? "") || null;
    }
  }

  return {
    balance,
    ledgerSum,
    cacheMatchesLedger: ledgerSum === null ? null : balance === ledgerSum,
    totalCredit,
    totalDebit,
    lastOccurredAt,
  };
}
