/**
 * 원장 행 표시 · 바로 가기 (설계 §1-3 · §2 · AA-14).
 * - 원장 행 파싱(`parseAdsLedgerRow`) · 종류 · 광고주 · 결제 · 성과 · 상태 문구
 * - 바로 가기: 상세 · 광고주 문의(support) · 충전·잔액(회원 = point · 매장 = business) · 광고주 상세 — 권한 키를 함께 준다
 *   (화면이 `actorMeetsAdminRouteRequirement` 로 켜고 끄며, 꺼진 이유 = 「○○ 권한이 필요합니다」).
 */
import type { AdminRouteRequirement } from "@/lib/admin/access/admin-route-access";
import type { AdsLedgerFields, AdsLedgerKind } from "@/lib/admin/ads-control-plane/types";
import { ledgerText, type AdsLedgerTextKey } from "@/lib/admin/ads-ledger/ledger-text";
import { formatAdminDeliveryAdPriceOrUnset } from "@/lib/stores/advertising/delivery-ad-admin-r3-presentation";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";

export const ADS_LEDGER_KINDS: readonly AdsLedgerKind[] = [
  "trade_promotion",
  "community_promotion",
  "feed_member",
  "feed_admin",
  "feed_event",
  "event_hero",
  "popup_admin",
  "popup_owner",
  "ptr",
  "delivery_banner",
  "delivery_sponsored",
  "my_banner",
  "intro",
] as const;

export const ADS_LEDGER_DOMAINS = ["trade", "community", "delivery", "platform", "mypage"] as const;

export function isAdsLedgerKind(v: unknown): v is AdsLedgerKind {
  return (ADS_LEDGER_KINDS as readonly string[]).includes(String(v ?? ""));
}

const str = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s ? s : null;
};
const numOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** DB 원장 행(json) → 원장 칸. 종류를 모르면 null (옛 함수 행). */
export function parseAdsLedgerRow(r: Record<string, unknown>): AdsLedgerFields | null {
  if (!isAdsLedgerKind(r.kind)) return null;
  const advType = String(r.advertiser_type ?? "");
  const payCur = String(r.pay_currency ?? "");
  const payStatus = String(r.pay_status ?? "");
  const domain = String(r.ledger_domain ?? "");
  return {
    kind: r.kind,
    statusTab: String(r.status_tab ?? ""),
    ledgerDomain: (ADS_LEDGER_DOMAINS as readonly string[]).includes(domain)
      ? (domain as AdsLedgerFields["ledgerDomain"])
      : "platform",
    locationKey: str(r.location_key),
    locationTarget: str(r.location_target),
    locationTargetName: str(r.location_target_name),
    advertiserType: (["member", "store", "operator", "event", "unknown"].includes(advType)
      ? advType
      : "unknown") as AdsLedgerFields["advertiserType"],
    advertiserId: str(r.advertiser_id),
    advertiserName: str(r.advertiser_name),
    payCurrency: (payCur === "POINT" || payCur === "BUSINESS_CASH" ? payCur : "NONE") as AdsLedgerFields["payCurrency"],
    payAmount: numOrNull(r.pay_amount),
    payStatus: (["paid", "held", "refunded", "partial_refund", "unpaid", "none", "unknown"].includes(payStatus)
      ? payStatus
      : "unknown") as AdsLedgerFields["payStatus"],
    refundAmount: numOrNull(r.refund_amount),
    impressions: numOrNull(r.impressions),
    clicks: numOrNull(r.clicks),
    startAt: str(r.start_at),
    endAt: str(r.end_at),
    pausedBy: str(r.paused_by),
    endedReason: r.ended_reason === "expired" ? "expired" : null,
    deleteKind: str(r.delete_kind),
    deleted: r.deleted === true,
    linkedRequestId: str(r.linked_request_id),
    linkedCampaignId: str(r.linked_campaign_id),
    storeId: str(r.store_id),
  };
}

export function adsLedgerKindLabel(kind: AdsLedgerKind | string | null | undefined, ko: boolean): string {
  return isAdsLedgerKind(kind)
    ? ledgerText(`ads_ledger_kind_${kind}` as AdsLedgerTextKey, ko)
    : ledgerText("ads_ledger_kind_all", ko);
}

export function adsLedgerDomainLabel(domain: string, ko: boolean): string {
  return (ADS_LEDGER_DOMAINS as readonly string[]).includes(domain)
    ? ledgerText(`ads_ledger_domain_${domain}` as AdsLedgerTextKey, ko)
    : domain;
}

/** 광고주 이름 — 회원 닉네임 · 매장 이름 · 「운영자」 · 「이벤트: 제목」 (uuid 앞자리 노출 금지) */
export function adsLedgerAdvertiserLabel(l: Pick<AdsLedgerFields, "advertiserType" | "advertiserName">, ko: boolean): string {
  const name = String(l.advertiserName ?? "").trim();
  switch (l.advertiserType) {
    case "operator":
      return ledgerText("ads_ledger_adv_operator", ko);
    case "event":
      return name ? ledgerText("ads_ledger_adv_event", ko, { name }) : ledgerText("ads_ledger_adv_event_unnamed", ko);
    case "member":
      return name || ledgerText("ads_ledger_adv_member_unnamed", ko);
    case "store":
      return name || ledgerText("ads_ledger_adv_store_unnamed", ko);
    default:
      return ledgerText("ads_ledger_adv_unknown", ko);
  }
}

export function formatAdsLedgerMoney(currency: AdsLedgerFields["payCurrency"], amount: number | null, ko: boolean): string {
  if (amount == null) return "—";
  if (currency === "POINT") return `${formatAdminNumber(Math.round(amount))}P`;
  if (currency === "BUSINESS_CASH") return formatAdminDeliveryAdPriceOrUnset(amount, ko ? "ko" : "en");
  return "—";
}

/** 결제: 통화 + 금액 + 상태 (결제 완료 · 보류 · 환급 N · 결제 없음) */
export function adsLedgerPaymentLabel(l: AdsLedgerFields, ko: boolean): string {
  if (l.payCurrency === "NONE" || l.payStatus === "none") return ledgerText("ads_ledger_pay_none", ko);
  const cur = ledgerText(l.payCurrency === "POINT" ? "ads_ledger_currency_point" : "ads_ledger_currency_cash", ko);
  const amount = l.payAmount != null ? formatAdsLedgerMoney(l.payCurrency, l.payAmount, ko) : null;
  const refund = l.refundAmount != null ? formatAdsLedgerMoney(l.payCurrency, l.refundAmount, ko) : "";
  const state =
    l.payStatus === "paid"
      ? ledgerText("ads_ledger_pay_paid", ko)
      : l.payStatus === "held"
        ? ledgerText("ads_ledger_pay_held", ko)
        : l.payStatus === "refunded"
          ? ledgerText("ads_ledger_pay_refunded", ko, { amount: refund || amount || "" })
          : l.payStatus === "partial_refund"
            ? ledgerText("ads_ledger_pay_partial_refund", ko, { amount: refund })
            : l.payStatus === "unpaid"
              ? ledgerText("ads_ledger_pay_unpaid", ko)
              : ledgerText("ads_ledger_pay_unknown", ko);
  return [cur, amount, state].filter(Boolean).join(" · ");
}

/** 성과: 기록이 있는 종류만 · 없는 종류는 「기록 없음」 */
export function adsLedgerPerformanceLabel(l: Pick<AdsLedgerFields, "impressions" | "clicks">, ko: boolean): string {
  if (l.impressions == null && l.clicks == null) return ledgerText("ads_ledger_perf_none", ko);
  const fmt = (n: number | null) => formatAdminNumber(Math.round(n ?? 0));
  return ledgerText("ads_ledger_perf", ko, { imp: fmt(l.impressions), clk: fmt(l.clicks) });
}

/** 상태 하나 (§1-3) — 정지는 누가(운영자/시스템/글 상태) · 기간이 지난 정지는 「종료(기간 만료)」 */
export function adsLedgerStatusLabel(
  statusTab: string,
  l: Pick<AdsLedgerFields, "endedReason" | "pausedBy"> | null | undefined,
  ko: boolean
): string {
  switch (statusTab) {
    case "pending":
      return ledgerText("ads_ledger_status_pending", ko);
    case "scheduled":
      return ledgerText("ads_ledger_status_scheduled", ko);
    case "live":
      return ledgerText("ads_ledger_status_live", ko);
    case "waiting":
      return ledgerText("ads_ledger_status_waiting", ko);
    case "incomplete":
      return ledgerText("ads_ledger_status_incomplete", ko);
    case "paused": {
      const by = String(l?.pausedBy ?? "").toLowerCase();
      if (by.startsWith("listing")) return ledgerText("ads_ledger_status_paused_listing", ko);
      if (by === "system" || by.startsWith("system")) return ledgerText("ads_ledger_status_paused_system", ko);
      if (by) return ledgerText("ads_ledger_status_paused_admin", ko);
      return ledgerText("ads_ledger_status_paused", ko);
    }
    case "ended":
      return l?.endedReason === "expired"
        ? ledgerText("ads_ledger_status_ended_expired", ko)
        : ledgerText("ads_ledger_status_ended", ko);
    case "rejected":
      return ledgerText("ads_ledger_status_rejected", ko);
    case "deleted":
      return ledgerText("ads_ledger_status_deleted", ko);
    default:
      return ledgerText("ads_ledger_status_ended", ko);
  }
}

/** 원장 종류 → 상세(관리) 화면. 기존 projector href 가 없을 때(새 종류) 쓴다. */
export function adsLedgerDetailHref(kind: AdsLedgerKind, sourceId: string, l?: Pick<AdsLedgerFields, "advertiserId"> | null): string {
  const id = encodeURIComponent(sourceId);
  switch (kind) {
    case "ptr":
      return `/admin/ptr-reveal-ads/${id}`;
    case "event_hero":
      return l?.advertiserId ? `/admin/platform-events/${encodeURIComponent(l.advertiserId)}` : "/admin/platform-events";
    case "my_banner":
      return `/admin/my/banners/${id}/edit`;
    case "intro":
      return "/admin/platform-promotion/intro";
    default:
      return "/admin/advertising";
  }
}

/** 문의 참조 (support reference_type · reference_id) — `support-reference-admin-href.ts` 와 같은 종류 이름. */
export function adsLedgerSupportReference(
  l: Pick<AdsLedgerFields, "kind" | "linkedRequestId" | "linkedCampaignId">,
  sourceId: string
): { type: string; id: string } | null {
  switch (l.kind) {
    case "trade_promotion":
    case "community_promotion":
      return { type: "POINT_PROMOTION_ORDER", id: sourceId };
    case "feed_member":
      return { type: "FEED_AD_REQUEST", id: l.linkedRequestId ?? sourceId };
    case "feed_admin":
    case "feed_event":
      return { type: "FEED_AD_CAMPAIGN", id: l.linkedCampaignId ?? sourceId };
    case "delivery_banner":
    case "delivery_sponsored":
      return { type: "DELIVERY_AD_CAMPAIGN", id: sourceId };
    case "popup_owner":
      return { type: "PLATFORM_POPUP_OWNER_REQUEST", id: l.linkedRequestId ?? sourceId };
    case "popup_admin":
      return { type: "PLATFORM_POPUP_CAMPAIGN", id: sourceId };
    case "ptr":
      return { type: "PTR_REVEAL_CAMPAIGN", id: sourceId };
    case "event_hero":
      return { type: "EVENT_BANNER", id: sourceId };
    default:
      return null;
  }
}

/**
 * 고객센터 목록이 지금 `reference_type` 으로 거를 수 있는 광고 참조 종류 = `SUPPORT_REFERENCE_TYPES`(서버 전용 파일) 중 광고 종류.
 * 새 4종(FEED_AD_CAMPAIGN · PLATFORM_POPUP_CAMPAIGN · PTR_REVEAL_CAMPAIGN · EVENT_BANNER)은 그 목록에 아직 없어
 * 고객센터 API 가 거름을 버린다 → 그 종류는 id 검색(`?search=`)으로 연다. (목록 추가 = support-reference-authority 담당)
 * 시험이 이 집합 ⊂ SUPPORT_REFERENCE_TYPES 를 확인한다.
 */
export const SUPPORT_FILTERABLE_AD_REFERENCE_TYPES: ReadonlySet<string> = new Set([
  "POINT_PROMOTION_ORDER",
  "FEED_AD_REQUEST",
  "DELIVERY_AD_CAMPAIGN",
  "PLATFORM_POPUP_OWNER_REQUEST",
]);

export function adsLedgerSupportHref(ref: { type: string; id?: string | null }): string {
  const id = String(ref.id ?? "").trim();
  if (SUPPORT_FILTERABLE_AD_REFERENCE_TYPES.has(ref.type)) {
    const q = new URLSearchParams({ reference_type: ref.type });
    if (id) q.set("reference_id", id);
    return `/admin/support?${q.toString()}`;
  }
  return id ? `/admin/support?search=${encodeURIComponent(id)}` : "/admin/support";
}

/** 충전·문의 모음 — 광고 문의 참조 종류 (support reference_type) · 문구 키 */
export const ADS_LEDGER_SUPPORT_REFERENCE_TYPES: ReadonlyArray<{ type: string; labelKey: AdsLedgerTextKey }> = [
  { type: "POINT_PROMOTION_ORDER", labelKey: "ads_ledger_ci_ref_promotion" },
  { type: "FEED_AD_REQUEST", labelKey: "ads_ledger_ci_ref_feed_request" },
  { type: "FEED_AD_CAMPAIGN", labelKey: "ads_ledger_ci_ref_feed_campaign" },
  { type: "DELIVERY_AD_CAMPAIGN", labelKey: "ads_ledger_ci_ref_delivery" },
  { type: "PLATFORM_POPUP_OWNER_REQUEST", labelKey: "ads_ledger_ci_ref_popup_owner" },
  { type: "PLATFORM_POPUP_CAMPAIGN", labelKey: "ads_ledger_ci_ref_popup" },
  { type: "PTR_REVEAL_CAMPAIGN", labelKey: "ads_ledger_ci_ref_ptr" },
  { type: "EVENT_BANNER", labelKey: "ads_ledger_ci_ref_event_banner" },
];

export type AdsLedgerShortcut = {
  id: "detail" | "inquiry" | "charge" | "advertiser";
  label: string;
  href: string;
  /** null = 화면 권한 그대로(별도 키 없음) */
  requirement: AdminRouteRequirement | null;
};

const perm = (key: "support" | "point" | "business"): AdminRouteRequirement => ({ kind: "permission", key });

/**
 * 바로 가기 (§2): 상세 · 광고주 문의 · 충전·잔액 · 광고주 상세.
 * - 문의 = support 권한 · 회원 광고주 충전 = point · 매장 광고주 충전 = business
 * - 충전·잔액은 결제가 있는 광고만(운영자·이벤트·자체 광고 숨김)
 */
export function buildAdsLedgerShortcuts(
  input: { sourceId: string; detailHref: string; ledger: AdsLedgerFields },
  ko: boolean
): AdsLedgerShortcut[] {
  const l = input.ledger;
  const out: AdsLedgerShortcut[] = [
    { id: "detail", label: ledgerText("ads_ledger_sc_detail", ko), href: input.detailHref, requirement: null },
  ];
  const ref = adsLedgerSupportReference(l, input.sourceId);
  if (ref) {
    const advertiserOwned = l.advertiserType === "member" || l.advertiserType === "store";
    out.push({
      id: "inquiry",
      label: ledgerText(advertiserOwned ? "ads_ledger_sc_inquiry_advertiser" : "ads_ledger_sc_inquiry_ad", ko),
      href: adsLedgerSupportHref(ref),
      requirement: perm("support"),
    });
  }
  const advId = l.advertiserId;
  if (l.payCurrency !== "NONE" && advId) {
    if (l.advertiserType === "member" && l.payCurrency === "POINT") {
      out.push({
        id: "charge",
        label: ledgerText("ads_ledger_sc_point", ko),
        href: `/admin/points/ledger?q=${encodeURIComponent(advId)}`,
        requirement: perm("point"),
      });
    } else if (l.advertiserType === "store" && l.payCurrency === "BUSINESS_CASH") {
      out.push({
        id: "charge",
        label: ledgerText("ads_ledger_sc_cash", ko),
        href: `/admin/delivery-ads/cash-charges?storeId=${encodeURIComponent(advId)}`,
        requirement: perm("business"),
      });
    }
  }
  if (advId) {
    if (l.advertiserType === "member") {
      out.push({
        id: "advertiser",
        label: ledgerText("ads_ledger_sc_advertiser_member", ko),
        href: `/admin/users/${encodeURIComponent(advId)}`,
        requirement: null,
      });
    } else if (l.advertiserType === "store") {
      out.push({
        id: "advertiser",
        label: ledgerText("ads_ledger_sc_advertiser_store", ko),
        href: `/admin/business/${encodeURIComponent(advId)}`,
        requirement: null,
      });
    } else if (l.advertiserType === "event") {
      out.push({
        id: "advertiser",
        label: ledgerText("ads_ledger_sc_advertiser_event", ko),
        href: `/admin/platform-events/${encodeURIComponent(advId)}`,
        requirement: null,
      });
    }
  }
  return out;
}

/** 반대 방향 (§2): 문의 상세·충전 상세 → 「이 광고주의 광고」 = 같은 원장 + 광고주 거름 */
export function adsLedgerAdvertiserAdsHref(advertiserId: string): string {
  return `/admin/advertising?advertiser=${encodeURIComponent(advertiserId.trim())}`;
}

/** 매장 광고주 → 같은 원장 + 매장 거름 (기존 `store_id` 거름) */
export function adsLedgerStoreAdsHref(storeId: string): string {
  return `/admin/advertising?store_id=${encodeURIComponent(storeId.trim())}`;
}
