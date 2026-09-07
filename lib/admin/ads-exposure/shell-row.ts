/**
 * Ads / Exposure shell list row projection — Admin ops table display only.
 */

import type { AdsActionItem } from "@/lib/admin/ads-control-plane/types";
import {
  formatAdsPeriodRange,
  formatAdsRemaining,
  formatPlacementByMode,
  formatPreApprovalRuntimeStatus,
  inferPlacementProductKind,
  parseAdsInstant,
} from "@/lib/admin/ads-exposure/canonical-location-period";
import { humanPlacementLabel, humanPopupSurfaceShortLabel, productKindLabel } from "@/lib/admin/ads-exposure/human-placement-label";
import {
  popupRuntimeDisplayLabel,
} from "@/lib/admin/ads-exposure/popup-runtime-display";
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
  | "waiting"
  | "incomplete"
  | "paused"
  | "ended"
  | "rejected";

export type AdsShellListRow = {
  id: string;
  kindLabel: string;
  title: string;
  applicantLabel: string;
  memberOrStore: string;
  targetLabel: string;
  placementLabel: string;
  slideLabel: string | null;
  periodLabel: string;
  /** Canonical remaining: 시작까지 / 종료까지 / 종료됨 / — */
  remainingLabel: string;
  amountLabel: string;
  paymentLabel: string;
  /** Row status bucket — never `"all"`. */
  statusTab: Exclude<AdsShellStatusTab, "all">;
  applicationStatusLabel: string;
  campaignStatusLabel: string;
  runtimeExposureStatusLabel: string;
  statusLabel: string;
  operatingStatusLabel: string;
  creativeImageUrl: string | null;
  ctaLabel: string | null;
  destinationLabel: string | null;
  priority: number | null;
  lifecycleStatusLabel: string | null;
  runtimeDisplayStatus: AdsActionItem["runtimeDisplayStatus"];
  runtimeDisplayLabel: string | null;
  isRuntimeWinner: boolean | null;
  href: string;
  previewHref: string;
  liveHref: string | null;
  previewSupported: boolean;
  domain: string;
  product: string;
  rawStatus: string;
  currency: string;
  sourceKind: AdsActionItem["sourceKind"];
  completenessClass: AdsActionItem["completenessClass"];
  missingFieldsLabel: string | null;
  waitingReasonLabel: string | null;
  winnerOccupantLabel: string | null;
};

export type AdsShellProductFamily = "all" | "promote" | "banner" | "popup" | "sponsored";

function opsToShellTab(ops: AdsOpsStatus): Exclude<AdsShellStatusTab, "all"> {
  if (ops === "pending") return "pending";
  if (ops === "draft") return "incomplete";
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
      return String(item.placementHint).trim().split(/\s+/)[0] ?? "GLOBAL";
    }
    return "GLOBAL";
  }
  if (item.placementHint && String(item.placementHint).trim()) {
    // Inventory keys may append " slide:N" for HERO identity.
    return String(item.placementHint).trim().split(/\s+/)[0] ?? "";
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

export function toAdsShellListRow(
  item: AdsActionItem,
  ko: boolean,
  mode: "all" | "applications" | "operations" | "history" | "boosts" = "all"
): AdsShellListRow {
  const placementKey = resolveShellPlacementKey(item);
  const kind = inferPlacementProductKind(item.domain, item.product);
  const slideN = parseSlideIndex(item.placementHint) ?? parseSlideIndex(item.creativeHint);
  const isApplication =
    mode === "applications" ||
    item.entity === "application" ||
    item.entity === "approval";
  const placementMode = isApplication ? "requested" : "actual";
  const placementLabel = formatPlacementByMode(placementMode, {
    kind,
    ko,
    inventoryKey: placementKey || item.placementHint,
    feedDomain: item.domain === "feed" ? item.product : item.domain,
    popupSurface: item.domain === "popup" ? placementKey || item.placementHint : null,
    slotIndex: placementMode === "actual" ? slideN : null,
  });
  // Common Slide column removed — product secondary lives in placement hierarchy only.
  const slideLabel = null;

  const runtimeStatus = item.runtimeDisplayStatus ?? null;
  const statusTab = resolveShellStatusTab(item);
  const ops = mapRawToAdsOpsStatus(
    [item.status, item.exposureLabel, item.periodLabel].filter(Boolean).join(" ")
  );

  const memberOrStore = resolveMemberOrStoreLabel(item, ko);

  const targetLabel =
    item.domain === "popup"
      ? humanPopupSurfaceShortLabel(item.placementHint || placementKey, ko)
      : item.creativeHint && !isCreativeUrl(item.creativeHint)
        ? item.creativeHint
        : item.title || item.applicantLabel || (ko ? "—" : "—");

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

  const operatingLabel =
    item.operatingStatusLabel ||
    item.lifecycleStatusLabel ||
    adsOpsStatusLabel(ops, ko);

  let runtimeLabel: string;
  if (isApplication) {
    runtimeLabel = formatPreApprovalRuntimeStatus(ko);
  } else if (runtimeStatus) {
    runtimeLabel = popupRuntimeDisplayLabel(runtimeStatus, ko);
  } else {
    runtimeLabel = runtimeLabelFromTab(statusTab, ko) || (ko ? "—" : "—");
  }

  // Prefer ISO-ish fragments from periodLabel when start/end not on item.
  const { startIso, endIso } = splitPeriodHint(item.periodLabel);
  const periodFmt = formatAdsPeriodRange(startIso, endIso, ko);
  const remainingFmt = formatAdsRemaining(startIso, endIso, Date.now(), ko);
  const periodLabel = periodFmt.valid
    ? periodFmt.label
    : periodFmt.error
      ? periodFmt.label
      : item.periodLabel && !/1970/.test(item.periodLabel)
        ? item.periodLabel
        : periodFmt.label;
  const remainingLabel =
    item.remainingLabel && !/1970/.test(item.remainingLabel)
      ? remainingFmt.kind !== "missing"
        ? remainingFmt.label
        : item.remainingLabel
      : remainingFmt.label;

  return {
    id: item.id,
    kindLabel: adsShellKindLabel(item.domain, item.product, ko),
    title:
      item.domain === "popup"
        ? item.title || (ko ? "—" : "—")
        : item.title || item.applicantLabel || (ko ? "—" : "—"),
    applicantLabel: item.applicantLabel || (ko ? "—" : "—"),
    memberOrStore,
    targetLabel,
    placementLabel,
    slideLabel,
    periodLabel,
    remainingLabel,
    amountLabel: item.amountLabel || (ko ? "—" : "—"),
    paymentLabel: item.paymentLabel || (ko ? "—" : "—"),
    statusTab,
    applicationStatusLabel: isApplication ? operatingLabel : ko ? "—" : "—",
    campaignStatusLabel: isApplication ? (ko ? "—" : "—") : operatingLabel,
    runtimeExposureStatusLabel: runtimeLabel,
    statusLabel: operatingLabel,
    operatingStatusLabel: operatingLabel,
    creativeImageUrl:
      item.creativeImageUrl || (isCreativeUrl(item.creativeHint) ? item.creativeHint : null),
    ctaLabel: item.ctaLabel ?? null,
    destinationLabel: item.destinationLabel ?? null,
    priority: item.priority ?? null,
    lifecycleStatusLabel: item.lifecycleStatusLabel ?? null,
    runtimeDisplayStatus: runtimeStatus,
    runtimeDisplayLabel: runtimeLabel,
    isRuntimeWinner: item.isRuntimeWinner ?? null,
    href: item.href,
    previewHref: item.previewHref || item.href,
    liveHref,
    previewSupported,
    domain: item.domain,
    product: item.product,
    rawStatus: item.status,
    currency: item.currency,
    sourceKind: item.sourceKind ?? null,
    completenessClass: item.completenessClass ?? null,
    missingFieldsLabel: item.missingFieldsLabel ?? null,
    waitingReasonLabel: isApplication ? null : item.waitingReasonLabel ?? null,
    winnerOccupantLabel: isApplication ? null : item.winnerOccupantLabel ?? null,
  };
}

function splitPeriodHint(periodLabel: string | null | undefined): {
  startIso: string | null;
  endIso: string | null;
} {
  const raw = String(periodLabel ?? "").trim();
  if (!raw || /1970/.test(raw)) return { startIso: null, endIso: null };
  const parts = raw.split(/\s*[→~\-–]\s*/);
  if (parts.length < 2) {
    const one = parseAdsInstant(raw);
    return { startIso: one ? one.toISOString() : null, endIso: null };
  }
  const a = parseAdsInstant(parts[0]);
  const b = parseAdsInstant(parts[1]);
  return {
    startIso: a ? a.toISOString() : null,
    endIso: b ? b.toISOString() : null,
  };
}

function runtimeLabelFromTab(statusTab: Exclude<AdsShellStatusTab, "all">, ko: boolean): string | null {
  if (statusTab === "live") return ko ? "현재 노출" : "Live now";
  if (statusTab === "waiting") return ko ? "노출 대기" : "Waiting";
  if (statusTab === "scheduled") return ko ? "예약" : "Scheduled";
  if (statusTab === "paused") return ko ? "일시중지" : "Paused";
  if (statusTab === "incomplete") return ko ? "비노출" : "Not exposing";
  if (statusTab === "ended" || statusTab === "rejected") return ko ? "종료" : "Ended";
  return null;
}

export function resolveMemberOrStoreLabel(item: AdsActionItem, ko: boolean): string {
  if (item.sourceKind === "admin_direct") return ko ? "—" : "—";
  if (item.storeId) {
    return `매장 ${item.storeId.slice(0, 8)}`;
  }
  if (item.memberId) {
    return ko ? `회원 ${item.memberId.slice(0, 8)}` : `Member ${item.memberId.slice(0, 8)}`;
  }
  return ko ? "—" : "—";
}

/**
 * Summary / filter authority:
 * - pending = real review only (not draft/incomplete)
 * - live = customer-visible winner / delivery live only (not eligible_waiting)
 * - waiting = eligible non-winner popups
 */
export function resolveShellStatusTab(
  item: AdsActionItem
): Exclude<AdsShellStatusTab, "all"> {
  const runtimeStatus = item.runtimeDisplayStatus ?? null;
  if (runtimeStatus === "live_now") return "live";
  if (runtimeStatus === "eligible_waiting") return "waiting";
  if (runtimeStatus === "incomplete" || runtimeStatus === "draft") return "incomplete";
  if (runtimeStatus === "pending") return "pending";
  if (runtimeStatus === "scheduled") return "scheduled";
  if (runtimeStatus === "paused") return "paused";
  if (runtimeStatus === "rejected") return "rejected";
  if (runtimeStatus === "ended") return "ended";

  if (item.completenessClass === "pending_review") return "pending";
  if (
    item.completenessClass === "orphan_partial" ||
    item.completenessClass === "incomplete" ||
    item.completenessClass === "draft_ready"
  ) {
    return "incomplete";
  }

  const tab = normalizeAdsShellStatus(item.status, item.exposureLabel, item.periodLabel);
  if (tab === "pending") {
    const raw = `${item.status} ${item.lifecycleStatusLabel ?? ""}`.toLowerCase();
    if (raw.includes("draft") || raw.includes("임시") || raw.includes("불완전")) {
      return "incomplete";
    }
  }
  return tab;
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
