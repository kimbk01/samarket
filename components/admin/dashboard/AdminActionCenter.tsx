"use client";

/**
 * CUT E + ARO-AC-001 — Admin Action Center (Control Plane entry on /admin).
 * Read-only composition of canonical Action Queue counts → domain deep-links.
 * Does NOT mutate Ads/Finance/Support. No new aggregate DB. No fake KPI.
 */

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useAdminStorePointPendingCount } from "@/components/admin/store-points/AdminStorePointPendingProvider";
import { AdminActionQueueCardGrid } from "@/components/admin/action-queue/AdminActionQueueCardGrid";
import {
  ADMIN_ACTION_CENTER_HASH,
  withAdminReturnTo,
} from "@/lib/admin/admin-operation-return-context";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { supportInboxHrefForStore } from "@/lib/support/support-reference-admin-href";
import { placementMapFocusHref } from "@/lib/admin/placement-map-read-model";
import { resolveDeliveryActionCenterCard } from "@/lib/admin/metrics/delivery-metrics";
import { resolveChatActionCenterCard } from "@/lib/admin/metrics/chat-metrics";
import { DIBAY_SERVICE_BRAND as B } from "@/lib/brand/dibay-service-brand";

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
              <span className="rounded-full bg-sam-primary px-2 py-0.5 text-[11px] font-bold text-sam-on-primary tabular-nums">
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

  /** ACTION REQUIRED = registry cards from the same Bell payload (Σ in-total cards == Bell). */
  const actionRequiredCount = q.queueCategories.filter(
    (c) => c.listHref && c.status !== "forbidden" && (c.status === "unavailable" || (c.count ?? 0) > 0)
  ).length;
  const unavailableLabel = safeT("admin_dashboard_unavailable");
  const deliveryCard = resolveDeliveryActionCenterCard(q.queueCategories);
  const chatCard = resolveChatActionCenterCard(q.queueCategories);

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
        q.tradeReportsCount +
        q.supportActionableCount,
    },
  ];

  const domainHealth: QueueCard[] = [
    {
      // §5 · X-4 — 배달 대시보드와 같은 지표 정의(lib/admin/metrics), CTA = 배달 대시보드
      id: "domain-delivery",
      href: withAdminReturnTo(deliveryCard.href, returnTo),
      count: deliveryCard.count ?? 0,
      unavailable: deliveryCard.unavailable,
      titleKo: `${B.DIPICK} 운영`,
      titleEn: `${B.DIPICK} ops`,
      domainKo: B.DIPICK,
      domainEn: B.DIPICK,
      primaryCtaKo: `${B.DIPICK} 대시보드`,
      primaryCtaEn: `${B.DIPICK} dashboard`,
    },
    {
      id: "domain-trade",
      href: withAdminReturnTo("/admin/trade", returnTo),
      count: q.tradeReportsCount + q.tradePromoPendingCount,
      titleKo: `${B.MARKET} 운영`,
      titleEn: `${B.MARKET} ops`,
      domainKo: B.MARKET,
      domainEn: B.MARKET,
      primaryCtaKo: `${B.MARKET} 워크스페이스`,
      primaryCtaEn: `${B.MARKET} workspace`,
    },
    {
      id: "domain-community",
      href: withAdminReturnTo("/admin/community", returnTo),
      count: q.communityReportsCount,
      titleKo: `${B.LOUNGE} 운영`,
      titleEn: `${B.LOUNGE} ops`,
      domainKo: B.LOUNGE,
      domainEn: B.LOUNGE,
      primaryCtaKo: `${B.LOUNGE} 홈`,
      primaryCtaEn: `${B.LOUNGE} home`,
    },
    {
      // 설계 §6 — 채팅 대시보드와 같은 지표 정의(lib/admin/metrics/chat-metrics), CTA = 채팅 대시보드
      id: "domain-chat",
      href: withAdminReturnTo(chatCard.href, returnTo),
      count: chatCard.count ?? 0,
      unavailable: chatCard.unavailable,
      titleKo: B.LETARING,
      titleEn: B.LETARING,
      domainKo: B.LETARING,
      domainEn: B.LETARING,
      primaryCtaKo: `${B.LETARING} 대시보드`,
      primaryCtaEn: `${B.LETARING} dashboard`,
      alwaysShow: true,
    },
  ];

  const commonOps: QueueCard[] = [
    {
      id: "common-finance",
      href: withAdminReturnTo("/admin/finance#action-required", returnTo),
      count:
        q.userChargePendingCount +
        q.cashChargePendingCount +
        q.coinWithdrawalsCount +
        q.settlementsActionableCount,
      titleKo: "재무 (Point / Coin / Cash / 정산)",
      titleEn: "Finance (Point / Coin / Cash / Settlement)",
      domainKo: "재무",
      domainEn: "Finance",
      primaryCtaKo: "재무 관제",
      primaryCtaEn: "Finance control plane",
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
      href: withAdminReturnTo("/admin/store-settlements?state=review_required", returnTo),
      count: q.settlementsActionableCount,
      unavailable: unavailable.has("settlements_actionable"),
      titleKo: "수수료 검토 (취소·환불)",
      titleEn: "Commission review (cancel/refund)",
      domainKo: "재무 · 정산",
      domainEn: "Finance · Settlement",
      primaryCtaKo: "수수료 검토 열기",
      primaryCtaEn: "Open commission review",
      alwaysShow: true,
    },
    {
      id: "common-ads",
      href: withAdminReturnTo(`${DELIVERY_AD_ADMIN_ROUTES.hub}#action-required`, returnTo),
      count: q.deliveryAdOpsPendingCount + q.feedAdPendingCount + q.platformPopupPendingCount,
      titleKo: "광고·배너",
      titleEn: "Ads / Exposure",
      domainKo: "광고",
      domainEn: "Ads",
      primaryCtaKo: "광고 관제",
      primaryCtaEn: "Ads control plane",
      alwaysShow: true,
    },
    {
      id: "common-support",
      href: withAdminReturnTo("/admin/support?filter=ACTIONABLE#action-required", returnTo),
      count: q.supportActionableCount,
      titleKo: "고객지원",
      titleEn: "Support",
      domainKo: "고객지원",
      domainEn: "Support",
      primaryCtaKo: "Support 관제",
      primaryCtaEn: "Support control plane",
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
              {safeT("admin_action_center_title")}
            </h2>
            <p className="mt-1 sam-text-helper text-sam-muted">
              {safeT("admin_action_center_desc")}
            </p>
          </div>
          <p className="sam-text-helper tabular-nums text-sam-muted" data-admin-action-center-total="1">
            {safeT("admin_action_center_total")}{" "}
            {q.queueTotalComplete ? q.adminBellCount : `${q.adminBellCount}+`}
          </p>
        </div>
        {actionRequiredCount === 0 && q.queueLoadState !== "loading" ? (
          <p
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 text-[13px] text-sam-muted"
            data-aro-ac-action-empty="1"
          >
            {safeT("admin_dashboard_no_actionable_queues")}
          </p>
        ) : (
          <AdminActionQueueCardGrid
            categories={q.queueCategories}
            loading={q.queueLoadState === "loading"}
            hideZero
            hrefDecorator={(href) => withAdminReturnTo(href, returnTo)}
          />
        )}
      </div>

      {/* C. DOMAIN HEALTH */}
      <div data-aro-ac-domain-health="1">
        <h2 className="mb-3 sam-text-section-title font-semibold text-sam-fg">
          {safeT("admin_dashboard_domain_ops")}
        </h2>
        <CardGrid cards={domainHealth} ko={ko} unavailableLabel={unavailableLabel} />
      </div>

      {/* D. COMMON OPERATIONS */}
      <div data-aro-ac-common-ops="1">
        <h2 className="mb-3 sam-text-section-title font-semibold text-sam-fg">
          {safeT("admin_dashboard_common_operations")}
        </h2>
        <CardGrid cards={commonOps} ko={ko} unavailableLabel={unavailableLabel} />
      </div>

      <div className="flex flex-wrap gap-2 text-[12px]">
        <Link
          href={withAdminReturnTo("/admin/stores-home-shelves", returnTo)}
          className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-1.5 font-medium text-sam-fg"
          data-admin-action-center-config="home"
        >
          {safeT("admin_action_center_home_config")}
        </Link>
        <Link
          href={withAdminReturnTo("/admin/stores-category-policy", returnTo)}
          className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-1.5 font-medium text-sam-fg"
          data-admin-action-center-config="category"
        >
          {safeT("admin_action_center_category_config")}
        </Link>
        <Link
          href={withAdminReturnTo(placementMapFocusHref("STORES_HOME_HERO"), returnTo)}
          className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-1.5 font-medium text-sam-fg"
          data-admin-action-center-placement-map="1"
        >
          {safeT("admin_action_center_placement_map")}
        </Link>
        <Link
          href="/admin/business"
          className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-1.5 font-medium text-sam-fg"
          data-admin-action-center-store-hub="1"
        >
          {safeT("admin_action_center_store_hub")}
        </Link>
        <Link
          href={supportInboxHrefForStore("")}
          className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-1.5 font-medium text-sam-fg"
        >
          {safeT("admin_action_center_owner_support")}
        </Link>
      </div>
    </section>
  );
}
