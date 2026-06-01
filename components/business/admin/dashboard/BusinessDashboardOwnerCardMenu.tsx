"use client";

import Link from "next/link";
import { Biz } from "@/lib/ui/biz-component-classes";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

export type OwnerCardMenuBadges = {
  newOrders: number;
  inProgress: number;
};

export function BusinessDashboardOwnerCardMenu({
  storeId,
  canSell,
  isVisible,
  badges,
}: {
  storeId: string;
  canSell: boolean;
  isVisible: boolean;
  badges: OwnerCardMenuBadges;
}) {
  const { t } = useI18n();
  const q = `storeId=${encodeURIComponent(storeId)}`;
  const showOps = canSell && isVisible;

  const items: Array<{
    id: string;
    titleKey: MessageKey;
    descKey: MessageKey;
    href: string;
    badge?: string;
    disabled?: boolean;
  }> = [
    {
      id: "orders-new",
      titleKey: "business_phase7_265",
      descKey: "business_phase7_587",
      href: buildStoreOrdersHref({ storeId, tab: "new" }),
      badge: badges.newOrders > 0 ? String(badges.newOrders > 99 ? "99+" : badges.newOrders) : undefined,
      disabled: !showOps,
    },
    {
      id: "orders-progress",
      titleKey: "business_phase7_588",
      descKey: "business_phase7_589",
      href: buildStoreOrdersHref({ storeId, tab: "progress" }),
      badge: badges.inProgress > 0 ? String(badges.inProgress > 99 ? "99+" : badges.inProgress) : undefined,
      disabled: !showOps,
    },
    {
      id: "products",
      titleKey: "business_phase7_590",
      descKey: "business_phase7_591",
      href: `/stores/owner/products?${q}`,
      disabled: false,
    },
    {
      id: "banners",
      titleKey: "biz_nav_banners",
      descKey: "biz_nav_banners_desc",
      href: `/stores/owner/banners?${q}`,
      disabled: false,
    },
    {
      id: "notices",
      titleKey: "biz_nav_notices",
      descKey: "biz_nav_notices_desc",
      href: `/stores/owner/notices?${q}`,
      disabled: false,
    },
    {
      id: "reviews",
      titleKey: "biz_title_reviews",
      descKey: "business_phase7_592",
      href: `/stores/owner/reviews?${q}`,
      disabled: false,
    },
    {
      id: "ops",
      titleKey: "business_phase7_593",
      descKey: "business_phase7_594",
      href: `/stores/owner/ops-status?${q}`,
      disabled: false,
    },
    {
      id: "settlements",
      titleKey: "business_phase7_595",
      descKey: "biz_nav_settlements",
      href: `/stores/owner/settlements?${q}`,
      disabled: !showOps,
    },
    {
      id: "points",
      titleKey: "store_owner_point_title",
      descKey: "store_owner_point_charge_cta",
      href: `/stores/owner/points?${q}`,
      disabled: !showOps,
    },
  ];

  return (
    <section className="space-y-3">
      <h2 className={["font-semibold", Biz.textCardTitle].join(" ")}>{t("business_phase7_100")}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((it) => {
          const inner = (
            <>
              <div className="flex items-start justify-between gap-2">
                <p className={["line-clamp-2 min-h-[2.5rem] font-semibold leading-snug", Biz.textCardTitle].join(" ")}>
                  {t(it.titleKey)}
                </p>
                {it.badge ? (
                  <span className="shrink-0 rounded-full bg-[var(--biz-primary-soft)] px-2 py-0.5 text-xs font-bold text-[var(--biz-primary)]">
                    {it.badge}
                  </span>
                ) : null}
              </div>
              <p className={["mt-1 line-clamp-2", Biz.textMuted].join(" ")}>{t(it.descKey)}</p>
            </>
          );

          if (it.disabled) {
            return (
              <div
                key={it.id}
                className={[Biz.cardCompact, "opacity-50"].join(" ")}
                aria-disabled
                title={t("business_phase7_310")}
              >
                {inner}
              </div>
            );
          }

          return (
            <Link
              key={it.id}
              href={it.href}
              className={[Biz.cardCompact, "block min-h-[112px] transition hover:border-[var(--biz-primary)]/35"].join(" ")}
            >
              {inner}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
