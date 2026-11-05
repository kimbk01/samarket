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
import { orderLedgerChainDesc } from "@/lib/finance/ledger-chain-order";
import {
  isHiddenCaptureAuditRow,
  pointChainView,
  POINT_LEDGER_HIDE_CAPTURE_AUDIT_OR,
  type PointPeriodLedgerRow,
} from "@/lib/points/point-period-history";
import { mapPointPromotionOrderRow } from "@/lib/points/point-promotion-orders-db";
import { readUserPointBalanceResult, sumUserPointLedger } from "@/lib/points/user-point-ledger";
import {
  appleRefundLedgerLabel,
  appleTransactionTail,
  FINANCE_PUBLIC_PROCESSOR,
  pointChargeSubtitle,
} from "@/lib/finance/finance-display-labels";
import type { PointPromotionOrder } from "@/lib/types/point";

const DELETED_POST_KO = "삭제된 게시물";
const DELETED_POST_EN = "Deleted post";

/**
 * 관리자가 입력한 사유 중 회원에게 보여도 되는 것 — 수동 지급·회수(admin_manual) 사유만.
 * 관리자 화면이 「회원 내역에 표시」로 안내하고 받는다. 그 밖의 관리자 원장 설명(Apple 환불 메모·점검 행 등)은 내부 기록.
 */
const MEMBER_PUBLIC_REASON_RELATED_TYPES = new Set(["admin_manual"]);

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

/**
 * 거래 상위노출 결제 내역 문구 → 화면 이름 1곳 `promotionProductDisplayLabel`(Owner R8 「상위노출 N일」 · 언어별).
 * - 예전 `프로모션 구매 (trade_promote_7, 7일)`(내부 상품 ID)
 * - 새 결제 `거래 상위노출 7일`(마이그레이션 20271103190000)
 * DB 원장 문구는 기록이라 고치지 않는다 — 화면 표시만 맞춘다(재감사 B-12).
 */
export function displayPointLedgerDescriptionLabels(description: string): { ko: string; en: string } | null {
  const d = description.trim();
  const legacy = /^프로모션 구매 \((trade_promote_\d+), (\d+)일\)$/.exec(d);
  if (legacy) return promotionProductDisplayLabel(legacy[1], Number(legacy[2]));
  const current = /^거래 상위노출 (\d+)일$/.exec(d);
  if (current) return promotionProductDisplayLabel(null, Number(current[1]));
  return null;
}

export function displayPointLedgerDescription(description: string): string {
  return displayPointLedgerDescriptionLabels(description)?.ko ?? description;
}

function asLedgerItemBase(row: LedgerRow): PointFinancialHistoryItem {
  const amount = Math.trunc(Number(row.amount ?? 0));
  const entryType = String(row.entry_type ?? "");
  const relatedType = String(row.related_type ?? "");
  const relatedId = String(row.related_id ?? "");
  const rawDescription = String(row.description ?? "");
  const promoLabels = displayPointLedgerDescriptionLabels(rawDescription);
  const description = promoLabels?.ko ?? rawDescription;
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
  const appleRefund = appleRefundLedgerLabel(relatedType);
  if (appleRefund) {
    resolvedTitles = { titleKey: appleRefund.key, fallbackTitleKo: appleRefund.ko, fallbackTitleEn: appleRefund.en };
  }
  const isAdminRow = resolvedCategory === "ADMIN_CREDIT" || resolvedCategory === "ADMIN_DEBIT" || Boolean(appleRefund);
  const publicReason =
    isAdminRow && MEMBER_PUBLIC_REASON_RELATED_TYPES.has(relatedType.trim()) ? description.trim() : "";

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
    ...(promoLabels ? { subtitleEn: promoLabels.en } : {}),
    relatedType,
    relatedId,
    entryType,
    description,
    actorType: String(row.actor_type ?? "system"),
    actorId: row.actor_id == null ? null : String(row.actor_id),
    relatedObject: null,
    promotion: null,
    deposit: null,
    adjustment: isAdminRow
      ? {
          reason: description,
          publicReason,
          actorType: (String(row.actor_type ?? "admin") as "user" | "admin" | "system"),
        }
      : null,
    status: null,
  };
}

/**
 * 관리자 수동 지급·회수의 공개 사유 — 감사 기록(audit_logs · user_points)의 `reason`.
 * 예전 원장 설명은 「사유 · 내부 메모」를 합쳐 썼으므로 원장 설명을 회원에게 그대로 보이지 않는다.
 * 조회 실패 = null → 호출부는 공개 사유를 비운다(운영팀만 표시).
 */
async function loadAdminAdjustPublicReasonMap(
  sb: SupabaseClient,
  rows: LedgerRow[]
): Promise<Map<string, string> | null> {
  const map = new Map<string, string>();
  const ids = [...new Set(rows.map((r) => String(r.id ?? "").trim()).filter(Boolean))];
  const userIds = [...new Set(rows.map((r) => String(r.user_id ?? "").trim()).filter(Boolean))];
  if (!ids.length || !userIds.length) return map;
  const { data, error } = await sb
    .from("audit_logs")
    .select("after_json")
    .eq("target_type", "user_points")
    .in("target_id", userIds)
    .in("after_json->>ledger_id", ids);
  if (error) return null;
  for (const row of (data ?? []) as Array<{ after_json?: Record<string, unknown> | null }>) {
    const after = row.after_json ?? {};
    const lid = typeof after.ledger_id === "string" ? after.ledger_id : "";
    const reason = typeof after.reason === "string" ? after.reason.trim() : "";
    if (lid && reason) map.set(lid, reason);
  }
  return map;
}

export function withAdminAdjustPublicReason(
  item: PointFinancialHistoryItem,
  reasons: Map<string, string> | null
): PointFinancialHistoryItem {
  if (!item.adjustment || !MEMBER_PUBLIC_REASON_RELATED_TYPES.has(String(item.relatedType).trim())) return item;
  const publicReason = reasons == null ? "" : (reasons.get(item.ledgerId) ?? item.adjustment.publicReason ?? "");
  return { ...item, adjustment: { ...item.adjustment, publicReason } };
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
      "id, plan_name, point_amount, request_status, approved_at, processed_at, payment_method, idempotency_key"
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
      paymentMethod: r.payment_method ? String(r.payment_method) : null,
      appleTxTail:
        String(r.payment_method ?? "") === "apple_iap" ? appleTransactionTail(String(r.idempotency_key ?? "")) : null,
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
      ...(item.subtitle ? {} : { subtitleEn: DELETED_POST_EN }),
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 상위노출 원장 줄 → 주문 id. 보류 `hold:<주문>`·확정 `capture:<주문>` 은 접두를 떼고, 해제 `release:<보류 행>` 은
 * 보류 행 표(`promotion_point_holds`)로 주문을 찾는다. 접두 붙은 값으로 주문 표를 조회하면 uuid 오류로 페이지 전체
 * 상위노출 줄이 「삭제된 게시물」이 되던 문제를 막는다.
 */
export function promotionOrderIdOfLedger(relatedId: string, holdToOrder?: ReadonlyMap<string, string>): string | null {
  const raw = String(relatedId ?? "").trim();
  const m = /^(hold|capture|release):(.+)$/.exec(raw);
  if (m?.[1] === "release") return holdToOrder?.get(m[2]!) ?? null;
  const id = m ? m[2]! : raw;
  return UUID_RE.test(id) ? id : null;
}

async function loadPromotionHoldOrderMap(sb: SupabaseClient, rows: LedgerRow[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const holdIds = [
    ...new Set(
      rows
        .filter((r) => String(r.related_type ?? "") === "promotion_order")
        .map((r) => /^release:(.+)$/.exec(String(r.related_id ?? ""))?.[1] ?? "")
        .filter((id) => UUID_RE.test(id))
    ),
  ];
  if (!holdIds.length) return map;
  const { data, error } = await sb.from("promotion_point_holds").select("id, promotion_order_id").in("id", holdIds);
  if (error) return map;
  for (const row of data ?? []) {
    const r = row as { id?: string; promotion_order_id?: string };
    if (r.id && r.promotion_order_id) map.set(String(r.id), String(r.promotion_order_id));
  }
  return map;
}

function enrichItem(
  base: PointFinancialHistoryItem,
  promotions: Map<string, PointPromotionOrder>,
  charges: Map<string, PointFinancialDepositFact>,
  posts: Map<string, { title: string; missing: boolean }>,
  holdToOrder?: ReadonlyMap<string, string>
): PointFinancialHistoryItem {
  const item = { ...base };

  if (item.relatedType === "promotion_order" && item.relatedId) {
    const orderId = promotionOrderIdOfLedger(item.relatedId, holdToOrder);
    const order = orderId ? promotions.get(orderId) : undefined;
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
      if (targetTitle) delete item.subtitleEn;
      else item.subtitleEn = DELETED_POST_EN;
      item.status = order.orderStatus;
    } else {
      item.relatedObject = {
        kind: "promotion",
        id: item.relatedId,
        label: DELETED_POST_KO,
        missing: true,
      };
      item.subtitle = DELETED_POST_KO;
      item.subtitleEn = DELETED_POST_EN;
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
      // 결제 수단 · 신청 상태 (Apple 결제를 「입금 확인」으로 쓰지 않는다)
      const sub = pointChargeSubtitle(dep.paymentMethod, dep.requestStatus);
      item.subtitle = sub.ko || dep.planName || item.description;
      if (sub.en) item.subtitleEn = sub.en;
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
  // 커뮤니티·거래 상위노출 승인 확정 0P 줄 — 피드 광고와 같은 규칙으로 숨김 (재감사 R8-c)
  if (rt === "promotion_order" || rt === "trade_post_ad") {
    return isHiddenCaptureAuditRow({ entry_type: et, related_type: rt, related_id: item.relatedId, amount: item.signedAmount })
      ? null
      : item;
  }
  if (rt !== "feed_ad_request") return item;

  // Capture audit is amount=0 — hide duplicate; hold row carries the usage amount.
  if (
    isHiddenCaptureAuditRow({
      entry_type: et,
      related_type: rt,
      related_id: item.relatedId,
      amount: item.signedAmount,
    })
  ) {
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
        ...(item.subtitle ? {} : { subtitleEn: "Hold released" }),
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
  /** 기간(PHT → UTC) 포함 시작 — `resolvePointHistoryPeriod` */
  fromIso?: string | null;
  /** 기간 제외 끝 */
  toIso?: string | null;
  /** true 면 같은 기간·필터의 정확한 전체 건수(`page.total`)도 센다 — capture 감사 행(화면에서 숨김) 제외 */
  withTotal?: boolean;
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
  if (input.fromIso) query = query.gte("created_at", input.fromIso);
  if (input.toIso) query = query.lt("created_at", input.toIso);
  if (cursor) {
    const ca = cursor.createdAt.replace(/"/g, "");
    const cid = cursor.id.replace(/"/g, "");
    // DESC page: (created_at, id) strictly before cursor
    query = query.or(`created_at.lt."${ca}",and(created_at.eq."${ca}",id.lt."${cid}")`);
  }
  if (filter === "credit") query = query.gt("amount", 0);
  if (filter === "debit") query = query.lt("amount", 0);

  let totalQuery: PromiseLike<{ count: number | null; error: { message: string } | null }> | null = null;
  if (input.withTotal) {
    let cq = sb
      .from("point_ledger")
      .select("id", { count: "exact", head: true })
      .or(POINT_LEDGER_HIDE_CAPTURE_AUDIT_OR);
    if (userId) cq = cq.eq("user_id", userId);
    if (input.dateFrom?.trim()) cq = cq.gte("created_at", input.dateFrom.trim());
    if (input.dateTo?.trim()) cq = cq.lte("created_at", input.dateTo.trim());
    if (input.fromIso) cq = cq.gte("created_at", input.fromIso);
    if (input.toIso) cq = cq.lt("created_at", input.toIso);
    if (filter === "credit") cq = cq.gt("amount", 0);
    if (filter === "debit") cq = cq.lt("amount", 0);
    totalQuery = cq;
  }

  const [{ data, error }, totalRes] = await Promise.all([query, totalQuery ?? Promise.resolve(null)]);
  if (error) {
    if (isMissingPointsTable(error.message ?? "", "point_ledger")) {
      return { ok: false, error: "table_missing", code: "table_missing" };
    }
    return { ok: false, error: error.message };
  }
  const total =
    totalRes && !totalRes.error && typeof totalRes.count === "number" ? totalRes.count : null;

  const rows = (data ?? []) as LedgerRow[];
  const pageRows = rows.slice(0, limit);
  const hasMore = rows.length > limit;

  const items = await projectPointLedgerRows(sb, pageRows, filter);

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
      ...(input.withTotal ? { total } : {}),
    },
  };
}

/**
 * 관리자 포인트 원장 — offset 서버 페이지 + 정확한 전체 건수 (R7 목록 표준).
 * 회원 앱(`/api/me/points`)의 커서 조회(`loadPointFinancialHistory`)는 그대로 두고, 같은 투영(promotion·charge·
 * 커뮤니티 제목·피드 광고 hold/capture)만 재사용한다. 화면에서 숨기는 capture 감사 행(금액 0)은
 * DB 조건으로 미리 빼서 `total` 이 실제 표시 행 수와 같게 한다.
 * 기간은 UTC 경계 `[fromIso, toIso)` (PHT 날짜 변환은 호출 라우트 책임).
 */
export async function loadPointFinancialHistoryOffsetPage(
  sb: SupabaseClient,
  input: {
    userId?: string;
    filter?: PointFinancialFilter;
    limit: number;
    offset: number;
    fromIso?: string | null;
    toIso?: string | null;
  }
): Promise<
  | { ok: true; items: PointFinancialHistoryItem[]; total: number }
  | { ok: false; error: string; code?: "table_missing" }
> {
  const filter = input.filter ?? "all";
  const userId = input.userId?.trim() || "";
  let query = sb
    .from("point_ledger")
    // 관리자 목록 전용 — 처리 주체 ID 포함 (회원 API 는 POINT_LEDGER_ROW_SELECT 그대로, actor_id 미노출)
    .select(`${POINT_LEDGER_ROW_SELECT}, actor_id`, { count: "exact" })
    .or(POINT_LEDGER_HIDE_CAPTURE_AUDIT_OR)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(input.offset, input.offset + input.limit - 1);
  if (userId) query = query.eq("user_id", userId);
  if (input.fromIso) query = query.gte("created_at", input.fromIso);
  if (input.toIso) query = query.lt("created_at", input.toIso);
  if (filter === "credit") query = query.gt("amount", 0);
  if (filter === "debit") query = query.lt("amount", 0);

  const { data, error, count } = await query;
  if (error) {
    if (isMissingPointsTable(error.message ?? "", "point_ledger")) {
      return { ok: false, error: "table_missing", code: "table_missing" };
    }
    return { ok: false, error: error.message };
  }
  const pageRows = (data ?? []) as LedgerRow[];
  const items = await projectPointLedgerRows(sb, pageRows, filter);
  return { ok: true, items, total: count ?? items.length };
}

/** 회원 내역 한 쪽 크기 (재감사 R6-a · 사장님 화면과 같은 20) */
export const POINT_HISTORY_PAGE_SIZE = 20;
/** 쪽 경계 앞뒤로 더 읽는 줄 — 같은 시각 묶음을 잔액 사슬로 정렬한 뒤 자르기 위함 (R2) */
export const POINT_HISTORY_CHAIN_MARGIN = 8;

/**
 * offset 쪽 자르기 — `[offset − margin, offset + limit + margin)` 을 읽어 같은 시각 줄을 잔액 사슬로 정렬한 뒤
 * 요청 쪽만 잘라 낸다. 앞뒤 쪽이 같은 창을 보므로 경계 묶음이 두 쪽에 겹치거나 빠지지 않는다. 순수 함수.
 */
export function slicePointLedgerChainPage<T extends PointPeriodLedgerRow>(
  windowRows: readonly T[],
  windowStart: number,
  offset: number,
  limit: number
): T[] {
  const ordered = orderLedgerChainDesc(windowRows, pointChainView);
  const from = offset - windowStart;
  return ordered.slice(from, from + limit);
}

export function pointLedgerChainWindow(offset: number, limit: number, margin: number = POINT_HISTORY_CHAIN_MARGIN) {
  const start = Math.max(0, offset - margin);
  return { start, end: offset + limit + margin - 1 };
}

/**
 * 회원 포인트 내역 — 쪽 이동(offset) + 정확한 전체 건수 + 같은 시각 줄 잔액 사슬 순서 (재감사 R6-a·R2).
 * 승인 확정 0P 감사 줄은 DB 조건으로 빼서 전체 건수 = 표시 줄 수 (R8-c).
 */
export async function loadPointFinancialHistoryChainPage(
  sb: SupabaseClient,
  input: {
    userId: string;
    filter?: PointFinancialFilter;
    offset: number;
    limit?: number;
    fromIso?: string | null;
    toIso?: string | null;
  }
): Promise<
  | { ok: true; items: PointFinancialHistoryItem[]; total: number; offset: number; limit: number }
  | { ok: false; error: string; code?: "table_missing" }
> {
  const filter = input.filter ?? "all";
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(input.limit ?? POINT_HISTORY_PAGE_SIZE)) || POINT_HISTORY_PAGE_SIZE));
  const offset = Math.max(0, Math.trunc(Number(input.offset ?? 0)) || 0);
  const win = pointLedgerChainWindow(offset, limit);
  let query = sb
    .from("point_ledger")
    .select(POINT_LEDGER_ROW_SELECT, { count: "exact" })
    .eq("user_id", input.userId.trim())
    .or(POINT_LEDGER_HIDE_CAPTURE_AUDIT_OR)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(win.start, win.end);
  if (input.fromIso) query = query.gte("created_at", input.fromIso);
  if (input.toIso) query = query.lt("created_at", input.toIso);
  if (filter === "credit") query = query.gt("amount", 0);
  if (filter === "debit") query = query.lt("amount", 0);
  const { data, error, count } = await query;
  if (error) {
    if (isMissingPointsTable(error.message ?? "", "point_ledger")) {
      return { ok: false, error: "table_missing", code: "table_missing" };
    }
    return { ok: false, error: error.message };
  }
  const windowRows = (data ?? []) as unknown as (LedgerRow & PointPeriodLedgerRow)[];
  const pageRows = slicePointLedgerChainPage(windowRows, win.start, offset, limit);
  const items = await projectPointLedgerRows(sb, pageRows, filter);
  return { ok: true, items, total: typeof count === "number" ? count : offset + items.length, offset, limit };
}

/** 원장 줄 → 화면 항목 (상위노출·충전·커뮤니티 제목·피드 광고 보류/확정 투영) — 세 조회 함수 공용 */
async function projectPointLedgerRows(
  sb: SupabaseClient,
  pageRows: LedgerRow[],
  filter: PointFinancialFilter
): Promise<PointFinancialHistoryItem[]> {
  const holdToOrder = await loadPromotionHoldOrderMap(sb, pageRows);
  const promoIds = pageRows
    .filter((r) => String(r.related_type ?? "") === "promotion_order")
    .map((r) => promotionOrderIdOfLedger(String(r.related_id ?? ""), holdToOrder) ?? "")
    .filter(Boolean);
  const chargeIds = pageRows
    .filter((r) => String(r.related_type ?? "") === "point_charge")
    .map((r) => String(r.related_id ?? ""));
  const promotions = await loadPromotionMap(sb, promoIds);
  const charges = await loadChargeMap(sb, chargeIds);
  const postIds = [...promotions.values()].filter((o) => o.targetType === "product").map((o) => o.targetId);
  const posts = await loadPostTitleMap(sb, postIds);
  const communityIds = pageRows
    .filter((r) => String(r.related_type ?? "") === "community_reward")
    .map((r) => String(r.related_id ?? ""));
  const communityPosts = await loadCommunityPostTitleMap(sb, communityIds);
  const feedRequestIds = pageRows
    .filter((r) => String(r.related_type ?? "") === "feed_ad_request")
    .map((r) => String(r.related_id ?? "").replace(/^(hold:|release:|capture:)/, "").trim())
    .filter(Boolean);
  const holdStatus = await loadFeedAdHoldStatusMap(sb, feedRequestIds);
  const adjustReasons = await loadAdminAdjustPublicReasonMap(
    sb,
    pageRows.filter((r) => MEMBER_PUBLIC_REASON_RELATED_TYPES.has(String(r.related_type ?? "").trim()))
  );

  return pageRows
    .map((row) =>
      enrichCommunityItem(enrichItem(asLedgerItemBase(row), promotions, charges, posts, holdToOrder), communityPosts)
    )
    .map((item) => withAdminAdjustPublicReason(item, adjustReasons))
    .map((item) => applyFeedAdHoldCaptureProjection(item, holdStatus))
    .filter((item): item is PointFinancialHistoryItem => item != null)
    .filter((item) => matchesPointFinancialFilter(item, filter));
}

/**
 * 회원 API 응답용 — 처리 관리자 id·내부 원장 설명을 뺀다 (관리자 화면은 원본 사용).
 * 관리자 줄의 설명은 공개 사유(adjustment.reason)만 남긴다.
 */
export function toMemberPointHistoryItem(item: PointFinancialHistoryItem): PointFinancialHistoryItem {
  if (!item.adjustment) return { ...item, actorId: null };
  const pub = item.adjustment.publicReason ?? "";
  const { subtitleEn: _internalEn, ...rest } = item;
  void _internalEn;
  return {
    ...rest,
    actorId: null,
    description: pub,
    subtitle: pub || FINANCE_PUBLIC_PROCESSOR.ko,
    ...(pub ? {} : { subtitleEn: FINANCE_PUBLIC_PROCESSOR.en }),
    adjustment: { ...item.adjustment, reason: pub, publicReason: pub },
  };
}

export function serializePointFinancialPage(page: PointFinancialHistoryPage) {
  return {
    items: page.items,
    hasMore: page.hasMore,
    nextCursor: page.nextCursor ? encodePointFinancialCursor(page.nextCursor) : null,
    /** 같은 기간·필터의 전체 건수 (`withTotal` 요청 때만, 세기 실패 시 null) */
    ...(page.total !== undefined ? { total: page.total } : {}),
  };
}

/** 잔액을 읽지 못하면 ok:false — 호출 라우트는 0 대신 오류로 응답한다(D4). */
export async function loadPointFinancialSummary(
  sb: SupabaseClient,
  userId: string
): Promise<{ ok: true; summary: PointFinancialSummary } | { ok: false; error: string }> {
  const uid = userId.trim();
  const balanceRes = await readUserPointBalanceResult(sb, uid);
  if (!balanceRes.ok) return { ok: false, error: balanceRes.error };
  const balance = balanceRes.balance;
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
    ok: true,
    summary: {
      balance,
      ledgerSum,
      cacheMatchesLedger: ledgerSum === null ? null : balance === ledgerSum,
      totalCredit,
      totalDebit,
      lastOccurredAt,
    },
  };
}
