"use client";

/**
 * CUT E + ARO-AC-001 — Admin Action Center (Control Plane entry on /admin).
 * Read-only composition of canonical Action Queue counts → domain deep-links.
 * Does NOT mutate Ads/Finance/Support. No new aggregate DB. No fake KPI.
 */

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useAdminStorePointPendingCount } from "@/components/admin/store-points/AdminStorePointPendingProvider";
import {
  ADMIN_ACTION_CENTER_HASH,
  withAdminReturnTo,
} from "@/lib/admin/admin-operation-return-context";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { supportInboxHrefForStore } from "@/lib/support/support-reference-admin-href";
import { placementMapFocusHref } from "@/lib/admin/placement-map-read-model";

type QueueCard = {
  id: string;
  href: string;
  count: number;
  unavailable?: boolean;
  titleKo: string;
  titleEn: string;
  domainKo: string;
  domainEn: string;
  primaryCtaKo: string;
  primaryCtaEn: string;
  /** Always show in Action Required strip even at 0 — reserved; prefer hideZeros */
  alwaysShow?: boolean;
};

function CardGrid({
  cards,
  ko,
  unavailableLabel,
}: {
  cards: QueueCard[];
  ko: boolean;
  unavailableLabel: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <Link
          key={card.id}
          href={card.href}
          className="flex min-h-[7.5rem] flex-col justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 transition-colors hover:border-signature/40 hover:bg-sam-app"
          data-admin-action-center-card={card.id}
          data-count={card.unavailable ? "unavailable" : card.count}
          data-unavailable={card.unavailable ? "1" : "0"}
        >
          <div>
            <p className="sam-text-helper text-sam-muted">
              {ko ? card.domainKo : card.domainEn}
            </p>
            <p className="mt-1 text-[15px] font-semibold text-sam-fg">
              {ko ? card.titleKo : card.titleEn}
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-sam-primary">
              {ko ? card.primaryCtaKo : card.primaryCtaEn}
            </span>
            {card.unavailable ? (
              <span className="rounded-ui-rect border border-amber-600 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                {unavailableLabel}
              </span>
            ) : card.count > 0 ? (
              <span className="rounded-full bg-sam-primary px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
                {card.count}
              </span>
            ) : (
              <span className="text-[11px] text-sam-muted">0</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

export function AdminActionCenter() {
  const { safeT, language } = useI18n();
  const ko = language !== "en";
  const q = useAdminStorePointPendingCount();
  const unavailable = new Set(q.queueUnavailable ?? []);
  const returnTo = "/admin";

  const actionCards: QueueCard[] = [
    {
      id: "orders",
      href: withAdminReturnTo("/admin/store-orders?order_status=refund_requested", returnTo),
      count: q.ordersAttentionCount,
      unavailable: unavailable.has("orders_attention"),
      titleKo: "주문 처리 필요",
      titleEn: "Orders need attention",
      domainKo: "배달",
      domainEn: "Delivery",
      primaryCtaKo: "주문 큐 열기",
      primaryCtaEn: "Open order queue",
    },
    {
      id: "settlement",
      href: withAdminReturnTo("/admin/store-settlements?settlement_status=scheduled", returnTo),
      count: q.settlementsActionableCount,
      unavailable: unavailable.has("settlements_actionable"),
      titleKo: "정산 요청 / 보류",
      titleEn: "Settlement scheduled / held",
      domainKo: "재무",
      domainEn: "Finance",
      primaryCtaKo: "정산 큐",
      primaryCtaEn: "Settlement queue",
    },
    {
      id: "community-reports",
      href: withAdminReturnTo("/admin/community/reports", returnTo),
      count: q.communityReportsCount,
      unavailable: unavailable.has("community_reports"),
      titleKo: "커뮤니티 일반 신고",
      titleEn: "Community reports",
      domainKo: "커뮤니티",
      domainEn: "Community",
      primaryCtaKo: "신고 큐",
      primaryCtaEn: "Reports queue",
    },
    {
      id: "meeting-reports",
      href: withAdminReturnTo("/admin/philife/meeting-reports", returnTo),
      count: q.meetingReportsCount,
      unavailable: unavailable.has("meeting_reports"),
      titleKo: "모임 신고",
      titleEn: "Meeting reports",
      domainKo: "커뮤니티",
      domainEn: "Community",
      primaryCtaKo: "모임 신고 큐",
      primaryCtaEn: "Meeting reports",
    },
    {
      id: "trade-reports",
      href: withAdminReturnTo("/admin/reports?domain=trade", returnTo),
      count: q.tradeReportsCount,
      titleKo: "거래 신고",
      titleEn: "Trade reports",
      domainKo: "거래",
      domainEn: "Trade",
      primaryCtaKo: "거래 신고 큐",
      primaryCtaEn: "Trade reports",
    },
    {
      id: "point",
      href: withAdminReturnTo("/admin/point-charges", returnTo),
      count: q.userChargePendingCount,
      titleKo: "Point 충전 승인 대기",
      titleEn: "Point top-up pending",
      domainKo: "재무 · Point",
      domainEn: "Finance · Point",
      primaryCtaKo: "Point 대기열",
      primaryCtaEn: "Point queue",
    },
    {
      id: "cash",
      href: withAdminReturnTo(DELIVERY_AD_ADMIN_ROUTES.cashCharges, returnTo),
      count: q.cashChargePendingCount,
      titleKo: "Cash 충전 승인 대기",
      titleEn: "Cash top-up pending",
      domainKo: "재무 · Cash",
      domainEn: "Finance · Cash",
      primaryCtaKo: "Cash 대기열",
      primaryCtaEn: "Cash queue",
    },
    {
      id: "coin-withdraw",
      href: withAdminReturnTo("/admin/finance#coin-withdrawals", returnTo),
      count: q.coinWithdrawalsCount,
      unavailable: unavailable.has("coin_withdrawals"),
      titleKo: "Coin 출금 요청",
      titleEn: "Coin withdrawals",
      domainKo: "재무 · Coin",
      domainEn: "Finance · Coin",
      primaryCtaKo: "Coin 출금 큐",
      primaryCtaEn: "Coin withdraw queue",
    },
    {
      id: "ads-review",
      href: withAdminReturnTo(`${DELIVERY_AD_ADMIN_ROUTES.hub}?view=actionable`, returnTo),
      count: q.deliveryAdOpsPendingCount,
      titleKo: "배달 광고 운영 대기",
      titleEn: "Delivery ads waiting",
      domainKo: "광고 · 배달",
      domainEn: "Ads · Delivery",
      primaryCtaKo: "광고 운영 열기",
      primaryCtaEn: "Open ads ops",
    },
    {
      id: "feed-ads",
      href: withAdminReturnTo("/admin/feed-ad-requests", returnTo),
      count: q.feedAdPendingCount,
      titleKo: "피드 광고 심사",
      titleEn: "Feed ad review",
      domainKo: "광고 · 피드",
      domainEn: "Ads · Feed",
      primaryCtaKo: "피드 신청 열기",
      primaryCtaEn: "Open feed requests",
    },
    {
      id: "popup",
      href: withAdminReturnTo("/admin/platform-popup", returnTo),
      count: q.platformPopupPendingCount,
      unavailable: unavailable.has("platform_popup_pending"),
      titleKo: "팝업 승인 대기",
      titleEn: "Popup review pending",
      domainKo: "광고 · 팝업",
      domainEn: "Ads · Popup",
      primaryCtaKo: "팝업 허브",
      primaryCtaEn: "Popup hub",
    },
    {
      id: "partner",
      href: withAdminReturnTo(DELIVERY_AD_ADMIN_ROUTES.partnerMemberships, returnTo),
      count: q.partnerPendingCount,
      unavailable: unavailable.has("partner_pending"),
      titleKo: "Partner 가입 심사",
      titleEn: "Partner membership review",
      domainKo: "Partner",
      domainEn: "Partner",
      primaryCtaKo: "Partner 관리",
      primaryCtaEn: "Manage Partner",
    },
    {
      id: "support",
      href: withAdminReturnTo("/admin/support?filter=WAITING_ADMIN", returnTo),
      count: q.supportActionableCount,
      titleKo: "고객지원 답변 대기",
      titleEn: "Support waiting on admin",
      domainKo: "고객지원",
      domainEn: "Support",
      primaryCtaKo: "고객센터 열기",
      primaryCtaEn: "Open Support",
    },
    {
      id: "store-apps",
      href: withAdminReturnTo("/admin/stores", returnTo),
      count: q.storeApplicationsCount,
      titleKo: "입점 검토",
      titleEn: "Store applications",
      domainKo: "매장",
      domainEn: "Store",
      primaryCtaKo: "매장 목록",
      primaryCtaEn: "Store list",
    },
    {
      id: "trade-promo",
      href: withAdminReturnTo("/admin/ad-applications?domain=trade", returnTo),
      count: q.tradePromoPendingCount,
      titleKo: "거래 프로모 심사",
      titleEn: "Trade promo review",
      domainKo: "거래",
      domainEn: "Trade",
      primaryCtaKo: "신청 열기",
      primaryCtaEn: "Open applications",
    },
    {
      id: "delivery-alerts",
      href: withAdminReturnTo("/admin/delivery-alerts", returnTo),
      count: q.deliveryAlertsCount,
      titleKo: "배달 운영 알림",
      titleEn: "Delivery ops alerts",
      domainKo: "배달",
      domainEn: "Delivery",
      primaryCtaKo: "알림 큐",
      primaryCtaEn: "Alerts queue",
    },
  ];

  const actionRequired = actionCards.filter((c) => c.unavailable || c.count > 0);
  const unavailableLabel = ko ? "확인 불가" : "UNAVAILABLE";

  const topSummary = [
    { id: "need", labelKo: "처리 필요", labelEn: "Action needed", n: q.adminBellCount },
    { id: "orders", labelKo: "주문", labelEn: "Orders", n: q.ordersAttentionCount },
    {
      id: "finance",
      labelKo: "정산/재무",
      labelEn: "Settlement/Finance",
      n:
        q.settlementsActionableCount +
        q.userChargePendingCount +
        q.cashChargePendingCount +
        q.coinWithdrawalsCount,
    },
    {
      id: "ads",
      labelKo: "광고",
      labelEn: "Ads",
      n: q.deliveryAdOpsPendingCount + q.feedAdPendingCount + q.platformPopupPendingCount,
    },
    {
      id: "mod",
      labelKo: "신고/지원",
      labelEn: "Reports/Support",
      n:
        q.communityReportsCount +
        q.meetingReportsCount +
        q.tradeReportsCount +
        q.supportActionableCount,
    },
  ];

  const domainHealth: QueueCard[] = [
    {
      id: "domain-delivery",
      href: withAdminReturnTo("/admin/delivery-orders", returnTo),
      count: q.ordersAttentionCount + q.deliveryAlertsCount + q.storeApplicationsCount,
      titleKo: "배달 운영",
      titleEn: "Delivery ops",
      domainKo: "배달",
      domainEn: "Delivery",
      primaryCtaKo: "배달 대시보드",
      primaryCtaEn: "Delivery dashboard",
    },
    {
      id: "domain-trade",
      href: withAdminReturnTo("/admin/trade", returnTo),
      count: q.tradeReportsCount + q.tradePromoPendingCount,
      titleKo: "거래 운영",
      titleEn: "Trade ops",
      domainKo: "거래",
      domainEn: "Trade",
      primaryCtaKo: "거래 워크스페이스",
      primaryCtaEn: "Trade workspace",
    },
    {
      id: "domain-community",
      href: withAdminReturnTo("/admin/community", returnTo),
      count: q.communityReportsCount + q.meetingReportsCount,
      titleKo: "커뮤니티 운영",
      titleEn: "Community ops",
      domainKo: "커뮤니티",
      domainEn: "Community",
      primaryCtaKo: "커뮤니티 홈",
      primaryCtaEn: "Community home",
    },
    {
      id: "domain-chat",
      href: withAdminReturnTo("/admin/chats/messenger", returnTo),
      count: 0,
      titleKo: "채팅 (메신저)",
      titleEn: "Chat (Messenger)",
      domainKo: "채팅",
      domainEn: "Chat",
      primaryCtaKo: "메신저 관리",
      primaryCtaEn: "Messenger admin",
      alwaysShow: true,
    },
  ];

  const commonOps: QueueCard[] = [
    {
      id: "common-finance",
      href: withAdminReturnTo("/admin/finance", returnTo),
      count:
        q.userChargePendingCount +
        q.cashChargePendingCount +
        q.coinWithdrawalsCount +
        q.settlementsActionableCount,
      titleKo: "재무 (Point / Coin / Cash / 정산)",
      titleEn: "Finance (Point / Coin / Cash / Settlement)",
      domainKo: "재무",
      domainEn: "Finance",
      primaryCtaKo: "Finance 허브",
      primaryCtaEn: "Finance hub",
      alwaysShow: true,
    },
    {
      id: "common-coin",
      href: withAdminReturnTo("/admin/finance#coin-withdrawals", returnTo),
      count: q.coinWithdrawalsCount,
      unavailable: unavailable.has("coin_withdrawals"),
      titleKo: "Coin 출금 큐",
      titleEn: "Coin withdrawal queue",
      domainKo: "재무 · Coin",
      domainEn: "Finance · Coin",
      primaryCtaKo: "출금 관리",
      primaryCtaEn: "Manage withdrawals",
      alwaysShow: true,
    },
    {
      id: "common-settlement",
      href: withAdminReturnTo("/admin/store-settlements?settlement_status=scheduled", returnTo),
      count: q.settlementsActionableCount,
      unavailable: unavailable.has("settlements_actionable"),
      titleKo: "정산 큐",
      titleEn: "Settlement queue",
      domainKo: "재무 · 정산",
      domainEn: "Finance · Settlement",
      primaryCtaKo: "정산 열기",
      primaryCtaEn: "Open settlements",
      alwaysShow: true,
    },
    {
      id: "common-ads",
      href: withAdminReturnTo(DELIVERY_AD_ADMIN_ROUTES.hub, returnTo),
      count: q.deliveryAdOpsPendingCount + q.feedAdPendingCount + q.platformPopupPendingCount,
      titleKo: "광고 / 노출",
      titleEn: "Ads / Exposure",
      domainKo: "광고",
      domainEn: "Ads",
      primaryCtaKo: "광고 허브",
      primaryCtaEn: "Ads hub",
      alwaysShow: true,
    },
    {
      id: "common-support",
      href: withAdminReturnTo("/admin/support", returnTo),
      count: q.supportActionableCount,
      titleKo: "고객지원",
      titleEn: "Support",
      domainKo: "고객지원",
      domainEn: "Support",
      primaryCtaKo: "Support 열기",
      primaryCtaEn: "Open Support",
      alwaysShow: true,
    },
    {
      id: "common-meeting-reports",
      href: withAdminReturnTo("/admin/philife/meeting-reports", returnTo),
      count: q.meetingReportsCount,
      unavailable: unavailable.has("meeting_reports"),
      titleKo: "모임 신고 큐",
      titleEn: "Meeting reports queue",
      domainKo: "커뮤니티",
      domainEn: "Community",
      primaryCtaKo: "모임 신고",
      primaryCtaEn: "Meeting reports",
      alwaysShow: true,
    },
  ];

  return (
    <section
      id={ADMIN_ACTION_CENTER_HASH}
      className="scroll-mt-20 space-y-6"
      data-admin-action-center="1"
      data-admin-control-plane="1"
      data-aro-ac-001="1"
    >
      {/* A. TOP SUMMARY */}
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
        data-aro-ac-top-summary="1"
      >
        {topSummary.map((s) => (
          <div
            key={s.id}
            className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
            data-aro-ac-summary={s.id}
          >
            <p className="text-[11px] text-sam-muted">{ko ? s.labelKo : s.labelEn}</p>
            <p className="text-[18px] font-bold tabular-nums text-sam-fg">{s.n}</p>
          </div>
        ))}
      </div>

      {/* B. ACTION REQUIRED */}
      <div data-aro-ac-action-required="1">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="sam-text-section-title font-semibold text-sam-fg">
              {safeT("admin_action_center_title", {
                fallbackKo: "처리 필요 (Action Center)",
                fallbackEn: "Needs action (Action Center)",
              })}
            </h2>
            <p className="mt-1 sam-text-helper text-sam-muted">
              {safeT("admin_action_center_desc", {
                fallbackKo:
                  "canonical 도메인 대기열로 이동합니다. 0건은 정상일 수 있습니다. Control Plane은 데이터를 복제·수정하지 않습니다.",
                fallbackEn:
                  "Opens canonical domain queues. Zero can be healthy. Control Plane does not copy or mutate domain data.",
              })}
            </p>
          </div>
          <p className="sam-text-helper tabular-nums text-sam-muted" data-admin-action-center-total="1">
            {safeT("admin_action_center_total", {
              fallbackKo: "Bell 합계",
              fallbackEn: "Bell total",
            })}{" "}
            {q.adminBellCount}
          </p>
        </div>
        {actionRequired.length === 0 ? (
          <p
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 text-[13px] text-sam-muted"
            data-aro-ac-action-empty="1"
          >
            {ko
              ? "지금 처리할 대기열이 없습니다 (0건 · 정상 가능)."
              : "No actionable queues right now (0 · may be healthy)."}
          </p>
        ) : (
          <CardGrid cards={actionRequired} ko={ko} unavailableLabel={unavailableLabel} />
        )}
      </div>

      {/* C. DOMAIN HEALTH */}
      <div data-aro-ac-domain-health="1">
        <h2 className="mb-3 sam-text-section-title font-semibold text-sam-fg">
          {ko ? "도메인 운영" : "Domain ops"}
        </h2>
        <CardGrid cards={domainHealth} ko={ko} unavailableLabel={unavailableLabel} />
      </div>

      {/* D. COMMON OPERATIONS */}
      <div data-aro-ac-common-ops="1">
        <h2 className="mb-3 sam-text-section-title font-semibold text-sam-fg">
          {ko ? "공통 운영" : "Common operations"}
        </h2>
        <CardGrid cards={commonOps} ko={ko} unavailableLabel={unavailableLabel} />
      </div>

      <div className="flex flex-wrap gap-2 text-[12px]">
        <Link
          href={withAdminReturnTo("/admin/stores-home-shelves", returnTo)}
          className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-1.5 font-medium text-sam-fg"
          data-admin-action-center-config="home"
        >
          {safeT("admin_action_center_home_config", {
            fallbackKo: "HOME 구성 (설정)",
            fallbackEn: "HOME config",
          })}
        </Link>
        <Link
          href={withAdminReturnTo("/admin/stores-category-policy", returnTo)}
          className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-1.5 font-medium text-sam-fg"
          data-admin-action-center-config="category"
        >
          {safeT("admin_action_center_category_config", {
            fallbackKo: "업종 노출 정책 (설정)",
            fallbackEn: "Category policy",
          })}
        </Link>
        <Link
          href={withAdminReturnTo(placementMapFocusHref("STORES_HOME_HERO"), returnTo)}
          className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-1.5 font-medium text-sam-fg"
          data-admin-action-center-placement-map="1"
        >
          {safeT("admin_action_center_placement_map", {
            fallbackKo: "앱 노출 위치 맵",
            fallbackEn: "App placement map",
          })}
        </Link>
        <Link
          href="/admin/business"
          className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-1.5 font-medium text-sam-fg"
          data-admin-action-center-store-hub="1"
        >
          {safeT("admin_action_center_store_hub", {
            fallbackKo: "매장 운영 허브",
            fallbackEn: "Store ops hub",
          })}
        </Link>
        <Link
          href={supportInboxHrefForStore("")}
          className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-1.5 font-medium text-sam-fg"
        >
          {safeT("admin_action_center_owner_support", {
            fallbackKo: "Owner Support",
            fallbackEn: "Owner Support",
          })}
        </Link>
      </div>
    </section>
  );
}
