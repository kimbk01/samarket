"use client";

/**
 * CUT E — Admin Action Center (Control Plane entry on /admin).
 * Read-only composition of canonical Action Queue counts → domain deep-links.
 * Does NOT mutate Ads/Finance/Support. No new aggregate DB.
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

type QueueCard = {
  id: string;
  href: string;
  count: number;
  titleKo: string;
  titleEn: string;
  domainKo: string;
  domainEn: string;
  primaryCtaKo: string;
  primaryCtaEn: string;
};

export function AdminActionCenter() {
  const { safeT, language } = useI18n();
  const ko = language !== "en";
  const {
    cashChargePendingCount,
    userChargePendingCount,
    supportActionableCount,
    deliveryAdOpsPendingCount,
    feedAdPendingCount,
    storeApplicationsCount,
    tradePromoPendingCount,
    adminBellCount,
  } = useAdminStorePointPendingCount();

  const returnTo = "/admin";

  const cards: QueueCard[] = [
    {
      id: "ads-review",
      href: withAdminReturnTo(
        `${DELIVERY_AD_ADMIN_ROUTES.hub}?view=actionable`,
        returnTo
      ),
      count: deliveryAdOpsPendingCount,
      titleKo: "광고 검토 / 운영 대기",
      titleEn: "Ads review / ops waiting",
      domainKo: "광고",
      domainEn: "Ads",
      primaryCtaKo: "광고 운영 열기",
      primaryCtaEn: "Open ads ops",
    },
    {
      id: "feed-ads",
      href: withAdminReturnTo("/admin/feed-ad-requests", returnTo),
      count: feedAdPendingCount,
      titleKo: "피드 광고 심사",
      titleEn: "Feed ad review",
      domainKo: "피드",
      domainEn: "Feed",
      primaryCtaKo: "피드 신청 열기",
      primaryCtaEn: "Open feed requests",
    },
    {
      id: "cash",
      href: withAdminReturnTo(DELIVERY_AD_ADMIN_ROUTES.cashCharges, returnTo),
      count: cashChargePendingCount,
      titleKo: "Cash 충전 대기",
      titleEn: "Cash top-up pending",
      domainKo: "Finance",
      domainEn: "Finance",
      primaryCtaKo: "Cash 대기열",
      primaryCtaEn: "Cash queue",
    },
    {
      id: "point",
      href: withAdminReturnTo("/admin/point-charges", returnTo),
      count: userChargePendingCount,
      titleKo: "Point 충전 대기",
      titleEn: "Point top-up pending",
      domainKo: "Finance",
      domainEn: "Finance",
      primaryCtaKo: "Point 대기열",
      primaryCtaEn: "Point queue",
    },
    {
      id: "support",
      href: withAdminReturnTo("/admin/support?filter=WAITING_ADMIN", returnTo),
      count: supportActionableCount,
      titleKo: "미답변 / 조치 필요 문의",
      titleEn: "Unanswered Support",
      domainKo: "Support",
      domainEn: "Support",
      primaryCtaKo: "고객센터 열기",
      primaryCtaEn: "Open Support",
    },
    {
      id: "store-apps",
      href: withAdminReturnTo("/admin/stores", returnTo),
      count: storeApplicationsCount,
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
      count: tradePromoPendingCount,
      titleKo: "거래 프로모 심사",
      titleEn: "Trade promo review",
      domainKo: "거래",
      domainEn: "Trade",
      primaryCtaKo: "신청 열기",
      primaryCtaEn: "Open applications",
    },
    {
      id: "popup",
      href: withAdminReturnTo("/admin/platform-popup", returnTo),
      count: 0,
      titleKo: "팝업 광고 운영",
      titleEn: "Popup ads ops",
      domainKo: "팝업",
      domainEn: "Popup",
      primaryCtaKo: "팝업 허브",
      primaryCtaEn: "Popup hub",
    },
    {
      id: "partner",
      href: withAdminReturnTo(DELIVERY_AD_ADMIN_ROUTES.partnerMemberships, returnTo),
      count: 0,
      titleKo: "Partner 멤버십",
      titleEn: "Partner memberships",
      domainKo: "Partner",
      domainEn: "Partner",
      primaryCtaKo: "Partner 관리",
      primaryCtaEn: "Manage Partner",
    },
    {
      id: "finance-hub",
      href: withAdminReturnTo("/admin/finance", returnTo),
      count: cashChargePendingCount + userChargePendingCount,
      titleKo: "Finance 허브",
      titleEn: "Finance hub",
      domainKo: "Finance",
      domainEn: "Finance",
      primaryCtaKo: "Finance 열기",
      primaryCtaEn: "Open Finance",
    },
  ];

  const actionable = cards.filter((c) => c.count > 0 || c.id === "popup" || c.id === "partner");

  return (
    <section
      id={ADMIN_ACTION_CENTER_HASH}
      className="scroll-mt-20 space-y-3"
      data-admin-action-center="1"
      data-admin-control-plane="1"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
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
                "canonical 도메인 대기열로 이동합니다. Control Plane은 데이터를 복제·수정하지 않습니다.",
              fallbackEn:
                "Opens canonical domain queues. Control Plane does not copy or mutate domain data.",
            })}
          </p>
        </div>
        <p className="sam-text-helper tabular-nums text-sam-muted" data-admin-action-center-total="1">
          {safeT("admin_action_center_total", {
            fallbackKo: "Bell 합계",
            fallbackEn: "Bell total",
          })}{" "}
          {adminBellCount}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {actionable.map((card) => (
          <Link
            key={card.id}
            href={card.href}
            className="flex min-h-[7.5rem] flex-col justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 transition-colors hover:border-signature/40 hover:bg-sam-app"
            data-admin-action-center-card={card.id}
            data-count={card.count}
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
              {card.count > 0 ? (
                <span className="rounded-full bg-sam-primary px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
                  {card.count}
                </span>
              ) : (
                <span className="text-[11px] text-sam-muted">
                  {safeT("admin_action_center_open", {
                    fallbackKo: "열기",
                    fallbackEn: "Open",
                  })}
                </span>
              )}
            </div>
          </Link>
        ))}
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
