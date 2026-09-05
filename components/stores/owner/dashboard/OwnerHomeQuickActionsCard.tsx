"use client";

import Link from "next/link";
import { ClipboardList, Package, Ban, MessageCircle } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { ownerUiCopy } from "@/lib/business/owner-ui-copy";
import { ownerDashCardClass } from "./owner-dashboard-ui";

/** Home quick actions — routes into existing primary surfaces (no new writers). */
export function OwnerHomeQuickActionsCard({
  storeId,
  chatBadge = 0,
}: {
  storeId: string;
  chatBadge?: number;
}) {
  const { language } = useI18n();
  const items = [
    {
      id: "orders",
      href: OwnerRoutes.orders(storeId),
      icon: ClipboardList,
      titleKo: "주문 관리",
      titleEn: "Orders",
      badge: 0,
    },
    {
      id: "products",
      href: OwnerRoutes.products(storeId),
      icon: Package,
      titleKo: "상품 관리",
      titleEn: "Products",
      badge: 0,
    },
    {
      id: "sold_out",
      href: `${OwnerRoutes.products(storeId)}?status=sold_out`,
      icon: Ban,
      titleKo: "빠른 품절",
      titleEn: "Sold out",
      badge: 0,
    },
    {
      id: "customers",
      href: OwnerRoutes.customerCare(storeId),
      icon: MessageCircle,
      titleKo: "고객 응대",
      titleEn: "Customers",
      badge: chatBadge,
    },
  ] as const;

  return (
    <section
      className={ownerDashCardClass()}
      data-owner-home-quick-actions="1"
      aria-label={ownerUiCopy(language, "바로가기", "Quick actions")}
    >
      <h2 className="mb-2 text-sm font-bold text-sam-fg">
        {ownerUiCopy(language, "바로가기", "Quick actions")}
      </h2>
      <div className="grid grid-cols-4 gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              data-owner-home-quick={item.id}
              className="relative flex flex-col items-center gap-1 rounded-ui-rect border border-sam-border bg-sam-app px-1 py-2.5 text-center active:bg-sam-surface"
            >
              <Icon className="h-5 w-5 text-sam-fg" aria-hidden />
              <span className="text-[11px] font-semibold leading-tight text-sam-fg">
                {ownerUiCopy(language, item.titleKo, item.titleEn)}
              </span>
              {item.badge > 0 ? (
                <span className="absolute right-1 top-1 inline-flex min-w-[1rem] justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
