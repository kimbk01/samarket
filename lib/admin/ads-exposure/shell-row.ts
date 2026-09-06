/**
 * Ads / Exposure shell list row projection — Admin ops table display only.
 */

import type { AdsActionItem } from "@/lib/admin/ads-control-plane/types";
import { humanPlacementLabel, productKindLabel } from "@/lib/admin/ads-exposure/human-placement-label";
import { adsLiveRouteHref } from "@/lib/admin/ads-exposure/live-route";
import {
  adsOpsStatusLabel,
  mapRawToAdsOpsStatus,
  type AdsOpsStatus,
} from "@/lib/admin/ads-exposure/ops-status";

export type AdsShellStatusTab =
  | "all"
  | "pending"
  | "scheduled"
  | "live"
  | "paused"
  | "ended"
  | "rejected";

export type AdsShellListRow = {
  id: string;
  kindLabel: string;
  applicantLabel: string;
  memberOrStore: string;
  targetLabel: string;
  placementLabel: string;
  slideLabel: string | null;
  periodLabel: string;
  amountLabel: string;
  paymentLabel: string;
  /** Row status bucket — never `"all"`. */
  statusTab: Exclude<AdsShellStatusTab, "all">;
  statusLabel: string;
  href: string;
  liveHref: string | null;
  previewSupported: boolean;
  domain: string;
  product: string;
  rawStatus: string;
  currency: string;
};

export type AdsShellProductFamily = "all" | "promote" | "banner" | "popup" | "sponsored";

function opsToShellTab(ops: AdsOpsStatus): Exclude<AdsShellStatusTab, "all"> {
  if (ops === "pending" || ops === "draft") return "pending";
  if (ops === "scheduled") return "scheduled";
  if (ops === "live") return "live";
  if (ops === "paused") return "paused";
  if (ops === "rejected") return "rejected";
  return "ended";
}

export function normalizeAdsShellStatus(
  rawStatus: string,
  exposureLabel?: string | null,
  periodLabel?: string | null
): Exclude<AdsShellStatusTab, "all"> {
  const joined = [rawStatus, exposureLabel, periodLabel].filter(Boolean).join(" ");
  return opsToShellTab(mapRawToAdsOpsStatus(joined));
}

export function adsShellKindLabel(domain: string, product: string, ko: boolean): string {
  const d = String(domain ?? "").toLowerCase();
  const p = String(product ?? "").toLowerCase();
  if (d === "community_promote" || (d.includes("community") && p.includes("promote"))) {
    return ko ? "게시물 상위노출" : "Post top exposure";
  }
  if (d === "trade_promote" || (d.includes("trade") && (p.includes("promote") || p.includes("boost")))) {
    return ko ? "거래 더 알리기" : "Trade promote";
  }
  if (d === "popup" || p.includes("popup")) {
    return ko ? "팝업" : "Popup";
  }
  if (d === "feed" || (p.includes("feed") && p.includes("banner"))) {
    return ko ? "피드 배너" : "Feed banner";
  }
  if (p.includes("sponsored") || p.includes("store_promote")) {
    return ko ? "매장 상위홍보" : "Store promote";
  }
  if (d === "delivery" || p.includes("banner")) {
    return productKindLabel(product || "banner", ko);
  }
  return productKindLabel(product || domain, ko);
}

/** Resolve inventory / promote / popup key for humanPlacementLabel. */
export function resolveShellPlacementKey(item: Pick<AdsActionItem, "domain" | "product" | "placementHint">): string {
  const domain = String(item.domain ?? "");
  if (domain === "trade_promote") return "feed_boost";
  if (domain === "community_promote") return "community_top_pin";
  if (domain === "popup") {
    const hint = String(item.placementHint ?? item.product ?? "").toUpperCase();
    if (hint.includes("DELIVERY") || hint === "DELIVERY") return "DELIVERY";
    if (hint.includes("TRADE") || hint === "TRADE") return "TRADE";
    if (hint.includes("COMMUNITY") || hint === "COMMUNITY") return "COMMUNITY";
    if (hint.includes("MYPAGE")) return "MYPAGE";
    if (item.placementHint && String(item.placementHint).trim()) {
      return String(item.placementHint).trim();
    }
    return "GLOBAL";
  }
  if (item.placementHint && String(item.placementHint).trim()) {
    return String(item.placementHint).trim();
  }
  return "";
}

function parseSlideIndex(hint: string | null | undefined): number | null {
  const raw = String(hint ?? "");
  const m = raw.match(/(?:slide|슬라이드)\s*[#:]?\s*(\d+)/i) ?? raw.match(/_SLIDE_(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isCreativeUrl(hint: string | null | undefined): boolean {
  if (!hint) return false;
  return /^https?:\/\//i.test(hint) || hint.includes("supabase");
}

export function toAdsShellListRow(item: AdsActionItem, ko: boolean): AdsShellListRow {
  const placementKey = resolveShellPlacementKey(item);
  const placementLabel = humanPlacementLabel(placementKey || item.placementHint, ko);
  const slideN = parseSlideIndex(item.placementHint) ?? parseSlideIndex(item.creativeHint);
  const slideLabel =
    slideN != null && placementKey
      ? ko
        ? `${placementLabel} > Slide ${slideN}`
        : `${placementLabel} > Slide ${slideN}`
      : null;

  const statusTab = normalizeAdsShellStatus(item.status, item.exposureLabel, item.periodLabel);
  const ops = mapRawToAdsOpsStatus(
    [item.status, item.exposureLabel, item.periodLabel].filter(Boolean).join(" ")
  );

  const memberOrStore = item.storeId
    ? item.applicantLabel || (ko ? "매장" : "Store")
    : item.memberId
      ? item.applicantLabel || (ko ? "회원" : "Member")
      : item.applicantLabel || (ko ? "—" : "—");

  const targetLabel =
    item.creativeHint && !isCreativeUrl(item.creativeHint)
      ? item.creativeHint
      : placementLabel;

  const productLower = String(item.product ?? "").toLowerCase();
  const previewSupported =
    Boolean(item.creativeHint) ||
    productLower.includes("banner") ||
    productLower.includes("popup") ||
    productLower.includes("sponsored") ||
    item.domain === "popup" ||
    item.domain === "feed" ||
    item.domain === "delivery";

  const liveHref = adsLiveRouteHref({
    productKind: item.product,
    placementKey,
    domain: item.domain,
  });

  return {
    id: item.id,
    kindLabel: adsShellKindLabel(item.domain, item.product, ko),
    applicantLabel: item.applicantLabel || (ko ? "—" : "—"),
    memberOrStore,
    targetLabel,
    placementLabel,
    slideLabel,
    periodLabel: item.periodLabel || (ko ? "—" : "—"),
    amountLabel: item.amountLabel || (ko ? "—" : "—"),
    paymentLabel: item.paymentLabel || (ko ? "—" : "—"),
    statusTab,
    statusLabel: adsOpsStatusLabel(ops, ko),
    href: item.href,
    liveHref,
    previewSupported,
    domain: item.domain,
    product: item.product,
    rawStatus: item.status,
    currency: item.currency,
  };
}

export function filterShellRowsByTab(
  rows: AdsShellListRow[],
  tab: AdsShellStatusTab
): AdsShellListRow[] {
  if (tab === "all") return rows;
  return rows.filter((r) => r.statusTab === tab);
}

export function filterShellRowsByProductFamily(
  rows: AdsShellListRow[],
  family: AdsShellProductFamily
): AdsShellListRow[] {
  if (family === "all") return rows;
  return rows.filter((r) => {
    const d = String(r.domain ?? "").toLowerCase();
    const p = String(r.product ?? "").toLowerCase();
    if (family === "promote") {
      return (
        d === "trade_promote" ||
        d === "community_promote" ||
        p.includes("promote") ||
        p.includes("boost")
      );
    }
    if (family === "popup") {
      return d === "popup" || p.includes("popup");
    }
    if (family === "sponsored") {
      return p.includes("sponsored") || p.includes("store_promote");
    }
    // banner
    return (
      (d === "delivery" && !p.includes("sponsored")) ||
      d === "feed" ||
      (p.includes("banner") && !p.includes("sponsored"))
    );
  });
}
