/**
 * Point Financial History Projection SSOT.
 * CONTRACT: UI reads projected facts from point_ledger (+ joins). DO NOT invent writers.
 * DO NOT mix archived store-credit schema (AST-002). DO NOT mutate purchase_member_content_promotion.
 */
import type {
  PointLedgerActorType,
  PointLedgerEntryType,
  PointLedgerRelatedType,
  PointPromotionOrderStatus,
} from "@/lib/types/point";

export type PointFinancialDirection = "credit" | "debit";

/** User-facing usage category — projection only, not a DB enum. */
export type PointFinancialCategory =
  | "CHARGE"
  | "PROMOTION"
  | "REFUND"
  | "REWARD"
  | "ADMIN_CREDIT"
  | "ADMIN_DEBIT"
  | "EXPIRATION"
  | "ADVERTISEMENT_USAGE"
  | "FEED_BANNER"
  /** Hold reservation — not confirmed usage until CAPTURE */
  | "POINT_HOLD"
  | "OTHER";

export type PointFinancialFilter = "all" | "credit" | "debit";

export type PointFinancialRelatedObject = {
  kind: "post" | "store" | "charge" | "promotion" | "other";
  id: string;
  label: string;
  missing: boolean;
};

export type PointFinancialPromotionFact = {
  orderId: string;
  productId: string | null;
  /** Human label e.g. "7일 홍보" — never raw trade_promote_7 as primary */
  productLabelKo: string;
  productLabelEn: string;
  durationDays: number;
  pointCost: number;
  startAt: string;
  endAt: string;
  orderStatus: PointPromotionOrderStatus | string;
  targetType: string;
  targetId: string;
  targetTitle: string;
  targetMissing: boolean;
};

export type PointFinancialDepositFact = {
  chargeRequestId: string;
  planName: string;
  pointAmount: number;
  requestStatus: string;
  approvedAt: string | null;
  processedAt: string | null;
};

export type PointFinancialAdjustmentFact = {
  reason: string;
  actorType: PointLedgerActorType;
};

export type PointFinancialHistoryItem = {
  ledgerId: string;
  userId: string;
  occurredAt: string;
  direction: PointFinancialDirection;
  amount: number;
  signedAmount: number;
  balanceAfter: number;
  category: PointFinancialCategory;
  /** Primary title key for UI (MessageKey-compatible slug) */
  titleKey: string;
  fallbackTitleKo: string;
  fallbackTitleEn: string;
  subtitle: string;
  relatedType: PointLedgerRelatedType | string;
  relatedId: string;
  entryType: PointLedgerEntryType | string;
  description: string;
  actorType: PointLedgerActorType | string;
  relatedObject: PointFinancialRelatedObject | null;
  promotion: PointFinancialPromotionFact | null;
  deposit: PointFinancialDepositFact | null;
  adjustment: PointFinancialAdjustmentFact | null;
  status: string | null;
};

export type PointFinancialHistoryCursor = {
  createdAt: string;
  id: string;
};

export type PointFinancialHistoryPage = {
  items: PointFinancialHistoryItem[];
  nextCursor: PointFinancialHistoryCursor | null;
  hasMore: boolean;
};

export type PointFinancialSummary = {
  balance: number;
  ledgerSum: number | null;
  cacheMatchesLedger: boolean | null;
  totalCredit: number;
  totalDebit: number;
  lastOccurredAt: string | null;
};

export function normalizePointFinancialDirection(amount: number): PointFinancialDirection {
  return amount < 0 ? "debit" : "credit";
}

export function normalizePointFinancialCategory(
  entryType: string,
  relatedType: string
): PointFinancialCategory {
  const et = entryType.trim().toLowerCase();
  const rt = relatedType.trim().toLowerCase();

  if (et === "charge" || rt === "point_charge") return "CHARGE";
  if (et === "refund" || et === "reverse" || et === "ad_refund") return "REFUND";
  if (et === "reward" || rt === "community_reward") return "REWARD";
  if (rt === "community_reclaim") return "REFUND";
  if (et === "admin_credit") return "ADMIN_CREDIT";
  if (et === "admin_debit") return "ADMIN_DEBIT";
  if (et === "admin_adjust") {
    return "OTHER";
  }
  if (et === "expire") return "EXPIRATION";
  if (rt === "promotion_order" || rt === "promoted_item") return "PROMOTION";
  // Hold / release = reservation semantics — not confirmed FEED_BANNER usage.
  if (et === "ad_hold" || et === "ad_hold_release") return "POINT_HOLD";
  if (
    et.startsWith("ad_") ||
    rt === "ad_application" ||
    rt === "trade_post_ad"
  ) {
    if (rt === "feed_ad_request") return "FEED_BANNER";
    return "ADVERTISEMENT_USAGE";
  }
  if (rt === "feed_ad_request") return "FEED_BANNER";
  if (et === "spend" && rt === "promotion_order") return "PROMOTION";
  if (et === "spend") return "OTHER";
  return "OTHER";
}

export function pointFinancialCategoryTitle(category: PointFinancialCategory): {
  titleKey: string;
  fallbackTitleKo: string;
  fallbackTitleEn: string;
} {
  switch (category) {
    case "CHARGE":
      return {
        titleKey: "point_fin_cat_charge",
        fallbackTitleKo: "포인트 충전",
        fallbackTitleEn: "Point top-up",
      };
    case "PROMOTION":
      return {
        titleKey: "point_fin_cat_promotion",
        fallbackTitleKo: "게시물 홍보",
        fallbackTitleEn: "Post promotion",
      };
    case "REFUND":
      return {
        titleKey: "point_fin_cat_refund",
        fallbackTitleKo: "환불",
        fallbackTitleEn: "Refund",
      };
    case "REWARD":
      return {
        titleKey: "point_fin_cat_reward",
        fallbackTitleKo: "이벤트 지급",
        fallbackTitleEn: "Reward",
      };
    case "ADMIN_CREDIT":
      return {
        titleKey: "point_fin_cat_admin_credit",
        fallbackTitleKo: "관리자 지급",
        fallbackTitleEn: "Admin credit",
      };
    case "ADMIN_DEBIT":
      return {
        titleKey: "point_fin_cat_admin_debit",
        fallbackTitleKo: "관리자 차감",
        fallbackTitleEn: "Admin debit",
      };
    case "EXPIRATION":
      return {
        titleKey: "point_fin_cat_expire",
        fallbackTitleKo: "기간 만료",
        fallbackTitleEn: "Expiration",
      };
    case "ADVERTISEMENT_USAGE":
      return {
        titleKey: "point_fin_cat_ad",
        fallbackTitleKo: "상단 고정",
        fallbackTitleEn: "Top pin",
      };
    case "FEED_BANNER":
      return {
        titleKey: "point_fin_cat_feed_banner",
        fallbackTitleKo: "피드 광고",
        fallbackTitleEn: "Feed advertisement",
      };
    case "POINT_HOLD":
      return {
        titleKey: "point_fin_cat_point_hold",
        fallbackTitleKo: "포인트 보류",
        fallbackTitleEn: "Point hold",
      };
    default:
      return {
        titleKey: "point_fin_cat_other",
        fallbackTitleKo: "기타 조정",
        fallbackTitleEn: "Other adjustment",
      };
  }
}

/** Prefer duration from order; never show trade_promote_* as primary label. */
export function promotionProductDisplayLabel(
  productId: string | null | undefined,
  durationDays: number
): { ko: string; en: string } {
  const days = Math.max(0, Math.trunc(Number(durationDays) || 0));
  if (days > 0) {
    return { ko: `${days}일 홍보`, en: `${days}-day promotion` };
  }
  const id = (productId ?? "").trim();
  if (id === "trade_promote_7") return { ko: "7일 홍보", en: "7-day promotion" };
  if (id === "trade_promote_14") return { ko: "14일 홍보", en: "14-day promotion" };
  return { ko: "게시물 홍보", en: "Post promotion" };
}

export function encodePointFinancialCursor(c: PointFinancialHistoryCursor): string {
  return Buffer.from(JSON.stringify({ createdAt: c.createdAt, id: c.id }), "utf8").toString(
    "base64url"
  );
}

export function decodePointFinancialCursor(raw: string | null | undefined): PointFinancialHistoryCursor | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  try {
    const json = Buffer.from(s, "base64url").toString("utf8");
    const j = JSON.parse(json) as { createdAt?: string; id?: string };
    const createdAt = String(j.createdAt ?? "").trim();
    const id = String(j.id ?? "").trim();
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export function matchesPointFinancialFilter(
  item: Pick<PointFinancialHistoryItem, "direction">,
  filter: PointFinancialFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "credit") return item.direction === "credit";
  return item.direction === "debit";
}

/** Local calendar day key for grouping (viewer timezone offset minutes). */
export function pointFinancialDayKey(iso: string, timeZoneOffsetMinutes: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "unknown";
  const shifted = new Date(t - timeZoneOffsetMinutes * 60_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
