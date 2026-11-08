/**
 * 광고·배너 › 배너 현황 (감사 AD-02 · 보완 설계 §3-2) — 배너 4종을 한 표로 보여 주는 읽기 모델.
 * 각 원장의 기존 관리자 GET API 응답을 그대로 받아 같은 열로 바꾼다 (새 테이블·새 쓰기 없음).
 * 상태는 기존 운영자 상태 어휘(`PromotionOperatorStatus` 5종)로만 표시한다.
 */
import type { PromotionOperatorStatus } from "@/lib/admin/promotion-operation-status";
import { resolveDistributionOperatorStatus } from "@/lib/admin/promotion-operation-status";
import { humanPlacementLabel } from "@/lib/admin/ads-exposure/human-placement-label";
import { translate, type MessageKey } from "@/lib/i18n/messages";

function tx(ko: boolean, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

export type BannerOverviewKind = "mypage" | "promotion" | "feed" | "delivery";
export type BannerOverviewDomain = "common" | "trade" | "community" | "delivery";

export type BannerOverviewRow = {
  key: string;
  kind: BannerOverviewKind;
  title: string;
  domain: BannerOverviewDomain;
  /** 고객 노출 위치 (운영자 문구) */
  surface: string;
  status: PromotionOperatorStatus;
  startAt: string | null;
  endAt: string | null;
  thumbUrl: string | null;
  /** 소재·연결 요약 */
  creative: string;
  editHref: string;
  editable: boolean;
  customerHref: string;
  updatedAt: string | null;
};

function ms(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : null;
}

/** 시간창 기준 상태 (노출 상태값이 「켜짐」일 때만) */
function windowStatus(startAt: string | null, endAt: string | null, nowMs: number): PromotionOperatorStatus {
  const end = ms(endAt);
  const start = ms(startAt);
  if (end != null && end <= nowMs) return "ENDED";
  if (start != null && start > nowMs) return "SCHEDULED";
  return "ACTIVE";
}

export type MypageBannerInput = {
  id: string;
  title: string;
  status: string;
  startAt?: string;
  endAt?: string;
  imageUrl?: string;
  mobileImageUrl?: string;
  targetUrl?: string;
  updatedAt?: string;
};

export function mapMypageBanner(b: MypageBannerInput, nowMs: number, ko: boolean = true): BannerOverviewRow {
  const startAt = b.startAt || null;
  const endAt = b.endAt || null;
  const status: PromotionOperatorStatus =
    b.status === "draft"
      ? "DRAFT"
      : b.status === "expired"
        ? "ENDED"
        : b.status === "active"
          ? windowStatus(startAt, endAt, nowMs)
          : "PAUSED";
  return {
    key: `mypage:${b.id}`,
    kind: "mypage",
    title: b.title,
    domain: "common",
    surface: tx(ko, "admin_banners_overview_surface_mypage_profile"),
    status,
    startAt,
    endAt,
    thumbUrl: b.mobileImageUrl || b.imageUrl || null,
    creative: b.targetUrl ? tx(ko, "admin_banners_overview_link_to", { target: b.targetUrl }) : tx(ko, "admin_banners_overview_no_link"),
    editHref: `/admin/my/banners/${encodeURIComponent(b.id)}/edit`,
    editable: true,
    customerHref: "/mypage",
    updatedAt: b.updatedAt ?? null,
  };
}

export type PromotionBannerInput = {
  distributionId: string;
  eventId: string;
  eventTitle: string;
  placement: string;
  presentation: string;
  status: string;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  thumbUrl: string | null;
};

export function mapPromotionBanner(r: PromotionBannerInput, nowMs: number, ko: boolean = true): BannerOverviewRow {
  const community = r.placement === "COMMUNITY_HOME";
  return {
    key: `promotion:${r.distributionId}`,
    kind: "promotion",
    title: r.eventTitle,
    domain: community ? "community" : "trade",
    surface: tx(ko, "admin_banners_overview_surface_pair", {
      surface: tx(ko, community ? "admin_banners_overview_community_home" : "admin_banners_overview_trade_home"),
      presentation: tx(ko, r.presentation === "HERO_BANNER" ? "admin_banners_overview_hero" : "admin_banners_overview_inline"),
    }),
    status: resolveDistributionOperatorStatus(
      { status: r.status, enabled: r.enabled, startsAt: r.startsAt, endsAt: r.endsAt },
      nowMs
    ),
    startAt: r.startsAt,
    endAt: r.endsAt,
    thumbUrl: r.thumbUrl,
    creative: tx(ko, "admin_banners_overview_link_event_detail"),
    editHref: `/admin/platform-events/${encodeURIComponent(r.eventId)}#distribution`,
    editable: true,
    customerHref: community ? "/philife" : "/market",
    updatedAt: null,
  };
}

const FEED_SURFACE: Record<string, MessageKey> = {
  TRADE_HOME: "admin_banners_overview_feed_trade_home",
  TRADE_CATEGORY: "admin_banners_overview_feed_trade_category",
  COMMUNITY_HOME: "admin_banners_overview_feed_community_home",
  COMMUNITY_TOPIC: "admin_banners_overview_feed_community_topic",
};

export type FeedCampaignInput = {
  id: string;
  name: string;
  domain: string;
  placement: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
  source?: string;
  destinationUrl?: string;
  destinationType?: string;
  slides?: Array<{ imageUrl: string; headline?: string }>;
};

/** N-01: `active` 인데 종료 시각이 지난 캠페인은 「종료」로 보인다 (고객 노출 규칙과 같음, DB 는 고치지 않음). */
export function mapFeedCampaign(c: FeedCampaignInput, nowMs: number, ko: boolean = true): BannerOverviewRow {
  const status: PromotionOperatorStatus =
    c.status === "draft"
      ? "DRAFT"
      : c.status === "paused"
        ? "PAUSED"
        : c.status === "ended"
          ? "ENDED"
          : windowStatus(c.startAt, c.endAt, nowMs);
  const first = c.slides?.[0];
  const memberRequested = c.source === "MEMBER_REQUESTED";
  const feedSurfaceKey = FEED_SURFACE[c.placement];
  return {
    key: `feed:${c.id}`,
    kind: "feed",
    title: c.name,
    domain: c.domain === "community" ? "community" : "trade",
    surface: `${feedSurfaceKey ? tx(ko, feedSurfaceKey) : c.placement}${memberRequested ? tx(ko, "admin_banners_overview_member_requested_suffix") : ""}`,
    status,
    startAt: c.startAt,
    endAt: c.endAt,
    thumbUrl: first?.imageUrl || null,
    creative: `${tx(ko, "admin_banners_overview_slides_count", { n: c.slides?.length ?? 0 })}${first?.headline ? ` · ${first.headline}` : ""}`,
    editHref: `/admin/feed-ads/${encodeURIComponent(c.id)}/edit`,
    // N-01: active 라도 종료 시각이 지난 캠페인은 수정 불가 (PATCH planFeedAdCampaignPatch 409 campaign_ended 와 같은 규칙)
    editable: status !== "ENDED",
    customerHref: c.domain === "community" ? "/philife" : "/market",
    updatedAt: null,
  };
}

export type DeliveryBannerInput = {
  id: string;
  title: string | null;
  headline: string | null;
  storeName: string | null;
  imageUrl: string | null;
  ctaHref: string | null;
  startAt: string;
  endAt: string;
  listBucket: string | null;
  inventoryKeys: string[];
  updatedAt: string;
};

export function mapDeliveryBanner(d: DeliveryBannerInput, nowMs: number, ko: boolean = true): BannerOverviewRow {
  const b = d.listBucket ?? "";
  const status: PromotionOperatorStatus =
    b === "ended" || b === "rejected"
      ? "ENDED"
      : b === "held"
        ? "PAUSED"
        : b === "scheduled"
          ? "SCHEDULED"
          : b === "active"
            ? windowStatus(d.startAt, d.endAt, nowMs)
            : "DRAFT";
  return {
    key: `delivery:${d.id}`,
    kind: "delivery",
    title: d.title || d.headline || d.storeName || d.id,
    domain: "delivery",
    // 재감사 S-2 (H-7): 코드값 대신 지면 이름 (업종 상단·검색 상단도 「배달 홈」으로 보이던 것)
    surface: d.inventoryKeys.length
      ? d.inventoryKeys.map((k) => humanPlacementLabel(k, ko)).join(", ")
      : tx(ko, "admin_banners_overview_delivery"),
    status,
    startAt: d.startAt || null,
    endAt: d.endAt || null,
    thumbUrl: d.imageUrl,
    creative: d.ctaHref
      ? tx(ko, "admin_banners_overview_link_to", { target: d.ctaHref })
      : d.storeName
        ? tx(ko, "admin_banners_overview_store_name", { name: d.storeName })
        : tx(ko, "admin_banners_overview_no_link"),
    editHref: `/admin/delivery-ads/${encodeURIComponent(d.id)}`,
    editable: status !== "ENDED",
    customerHref: "/stores",
    updatedAt: d.updatedAt,
  };
}

const STATUS_ORDER: Record<PromotionOperatorStatus, number> = {
  ACTIVE: 0,
  SCHEDULED: 1,
  PAUSED: 2,
  DRAFT: 3,
  ENDED: 4,
};

/** 노출 중 → 예약 → 중지 → 초안 → 종료, 같은 상태는 시작 시각 최신순 */
export function sortBannerOverviewRows(rows: BannerOverviewRow[]): BannerOverviewRow[] {
  return [...rows].sort((a, b) => {
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (s !== 0) return s;
    return (ms(b.startAt) ?? 0) - (ms(a.startAt) ?? 0);
  });
}
