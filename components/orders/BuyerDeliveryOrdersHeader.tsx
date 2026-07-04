"use client";

import { Suspense } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { CommerceCartHeaderLink } from "@/components/layout/CommerceCartHeaderLink";
import { Tier1NotificationAnchor } from "@/components/notifications/Tier1NotificationAnchor";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { OWNER_MOBILE_EXIT_HREF } from "@/lib/stores/owner-mobile-ui-tokens";

const HEADER_ICON_BTN_CLASS =
  "flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full text-[#262626] hover:bg-[#F5F5F5] active:bg-[#EBEBEB]";

function HeaderActionsFallback() {
  return (
    <span className={`${HEADER_ICON_BTN_CLASS} opacity-70`} aria-hidden>
      ···
    </span>
  );
}

/**
 * 구매자 `/orders` — 오너 주문 페이지(`OwnerMobileAdminHeader` page variant)와 동일 톤.
 * 뒤로: 배달 홈(`/stores`), 우측: 알림함 + 장바구니.
 */
export function BuyerDeliveryOrdersHeader() {
  const { t } = useI18n();

  return (
    <BodyPortal>
      <header
        className="fixed inset-x-0 top-0 z-[55] border-b border-sam-border bg-sam-surface/95 pt-[var(--safe-top)] backdrop-blur-sm"
        aria-label={t("tier1_order")}
      >
        <div className="flex h-14 w-full min-w-0 items-center gap-2 pl-[max(0.75rem,var(--safe-left))] pr-[max(0.75rem,var(--safe-right))] sm:pl-[max(1rem,var(--safe-left))] sm:pr-[max(1rem,var(--safe-right))]">
          <AppBackButton
            backHref={OWNER_MOBILE_EXIT_HREF}
            preferHistoryBack
            className={`${HEADER_ICON_BTN_CLASS} text-[var(--biz-primary)] hover:bg-[var(--biz-tan-soft)] active:bg-[var(--biz-header-bg)]`}
            ariaLabel={t("store_owner_aria_exit_delivery_home")}
          />
          <div className="flex min-h-0 min-w-0 flex-1 items-center overflow-hidden pr-1">
            <h1 className="truncate text-[14px] font-bold leading-none text-[#262626]">
              {t("tier1_order")}
            </h1>
          </div>
          <div className="ml-auto flex shrink-0 items-center justify-end gap-0">
            <Suspense fallback={<HeaderActionsFallback />}>
              <CommerceCartHeaderLink />
            </Suspense>
            <Suspense fallback={<HeaderActionsFallback />}>
              <Tier1NotificationAnchor surface="bottom_nav_delivery" />
            </Suspense>
          </div>
        </div>
      </header>
    </BodyPortal>
  );
}

export const BUYER_DELIVERY_ORDERS_HEADER_OFFSET_CLASS =
  "pt-[calc(var(--safe-top)+3.5rem)]";
