/**
 * Marketplace public listing status — ACTIVE | SOLD only.
 * L1 inquiry/negotiating/reserved stay internal; do not paint 문의중/예약중 on LIST/SEARCH/DETAIL.
 * Chat activity (trade_flow_status, reserved_buyer_id) is out of this module.
 */
import type { MessageKey } from "@/lib/i18n/messages";
import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";
import {
  APP_FEED_LIST_ROW1_LAYOUT,
  APP_FEED_LIST_ROW1_TEXT_DETAIL,
  APP_FEED_LIST_ROW1_TEXT_LIST,
} from "@/lib/ui/app-feed-list-row1";

export type MarketplacePublicListingStatus = "active" | "sold";

export type MarketplacePublicTradeState = "latest" | "active" | "sold";

export type MarketplacePublicListingPost = {
  seller_listing_state?: unknown;
  status?: string | null;
  /** 감사 J5: 일자리 글(구인·구직) 판정용 — `listing_kind`·`job_type` */
  meta?: unknown;
};

/** 감사 J5 (2026-11-22): 일자리 글이면 구인/구직, 아니면 null */
export function marketplaceJobListingKind(post: MarketplacePublicListingPost): "hire" | "work" | null {
  const m = post.meta && typeof post.meta === "object" ? (post.meta as Record<string, unknown>) : null;
  if (!m) return null;
  const kind = String(m.listing_kind ?? "").trim();
  if (kind === "hire" || kind === "work") return kind;
  const jobType = String(m.job_type ?? "").trim();
  if (jobType === "hire") return "hire";
  if (jobType === "seek") return "work";
  return null;
}

/** Legacy URL `tradeState=reserved` → public active. Do not filter L1 reserved as its own marketplace facet. */
export function parseMarketplacePublicTradeState(
  raw: string | null | undefined
): MarketplacePublicTradeState {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "sold") return "sold";
  if (s === "active" || s === "reserved") return "active";
  return "latest";
}

/**
 * sold wins. completed → sold. inquiry/negotiating/reserved → active.
 * hidden/deleted are not public marketplace values (feed already excludes them).
 */
export function resolveMarketplacePublicListingStatus(
  post: MarketplacePublicListingPost
): MarketplacePublicListingStatus {
  const st = String(post.status ?? "").trim().toLowerCase();
  if (st === "sold") return "sold";
  const ls = normalizeSellerListingState(post.seller_listing_state, st);
  if (ls === "completed") return "sold";
  return "active";
}

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function marketplacePublicStatusLabel(
  status: MarketplacePublicListingStatus,
  t?: Translate
): string {
  if (status === "sold") {
    return t ? t("trade_listing_step_completed") : "판매완료";
  }
  return t ? t("trade_listing_step_inquiry") : "판매중";
}

export function marketplacePublicStatusBadge(
  post: MarketplacePublicListingPost,
  size: "list" | "detail" = "list",
  t?: Translate
): { label: string; className: string } {
  const st = String(post.status ?? "active").toLowerCase();
  const textSz = size === "detail" ? APP_FEED_LIST_ROW1_TEXT_DETAIL : APP_FEED_LIST_ROW1_TEXT_LIST;
  const row1 = `${APP_FEED_LIST_ROW1_LAYOUT} ${textSz}`.trim();

  if (st === "hidden" || st === "blinded" || st === "deleted") {
    const label =
      st === "deleted"
        ? t
          ? t("ui_product_status_deleted")
          : "삭제됨"
        : t
          ? t("ui_product_status_hidden")
          : "숨김";
    return {
      label,
      className: `${row1} border border-sam-border bg-sam-surface-muted text-sam-muted`,
    };
  }

  const publicStatus = resolveMarketplacePublicListingStatus(post);
  /** 감사 J5: 일자리 글은 「모집중·구직중·마감」(이전: 공통 「판매중·판매완료」) */
  const jobKind = t ? marketplaceJobListingKind(post) : null;
  const label = jobKind
    ? publicStatus === "sold"
      ? t!("ui_jobs_status_closed")
      : t!(jobKind === "hire" ? "ui_jobs_status_hiring_active" : "ui_jobs_status_seeking_active")
    : marketplacePublicStatusLabel(publicStatus, t);
  if (publicStatus === "sold") {
    return {
      label,
      className: `${row1} border border-sam-border bg-sam-surface-muted text-sam-muted`,
    };
  }
  return {
    label,
    className: `${row1} border-0 bg-signature text-white`,
  };
}
