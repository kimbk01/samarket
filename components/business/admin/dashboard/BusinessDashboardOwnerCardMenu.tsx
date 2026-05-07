"use client";

import Link from "next/link";
import { Biz } from "@/lib/ui/biz-component-classes";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";

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
  const q = `storeId=${encodeURIComponent(storeId)}`;
  const showOps = canSell && isVisible;

  const items: Array<{
    title: string;
    desc: string;
    href: string;
    badge?: string;
    disabled?: boolean;
  }> = [
    {
      title: "주문 접수",
      desc: "신규·접수 대기",
      href: buildStoreOrdersHref({ storeId, tab: "new" }),
      badge: badges.newOrders > 0 ? String(badges.newOrders > 99 ? "99+" : badges.newOrders) : undefined,
      disabled: !showOps,
    },
    {
      title: "진행중 주문",
      desc: "조리·배달 진행",
      href: buildStoreOrdersHref({ storeId, tab: "progress" }),
      badge: badges.inProgress > 0 ? String(badges.inProgress > 99 ? "99+" : badges.inProgress) : undefined,
      disabled: !showOps,
    },
    {
      title: "메뉴 관리",
      desc: "상품·품절·노출",
      href: `/my/business/products?${q}`,
      disabled: false,
    },
    {
      title: "배너 관리",
      desc: "매장 상단 배너",
      href: `/my/business/banners?${q}`,
      disabled: false,
    },
    {
      title: "공지 관리",
      desc: "위치별 공지",
      href: `/my/business/notices?${q}`,
      disabled: false,
    },
    {
      title: "리뷰 관리",
      desc: "고객 리뷰",
      href: `/my/business/reviews?${q}`,
      disabled: false,
    },
    {
      title: "영업 정보",
      desc: "영업·배달·노출",
      href: `/my/business/ops-status?${q}`,
      disabled: false,
    },
    {
      title: "정산",
      desc: "정산 내역",
      href: `/my/business/settlements?${q}`,
      disabled: !showOps,
    },
  ];

  return (
    <section className="space-y-3">
      <h2 className={["font-semibold", Biz.textCardTitle].join(" ")}>바로가기</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((it) => {
          const inner = (
            <>
              <div className="flex items-start justify-between gap-2">
                <p className={["line-clamp-2 min-h-[2.5rem] font-semibold leading-snug", Biz.textCardTitle].join(" ")}>
                  {it.title}
                </p>
                {it.badge ? (
                  <span className="shrink-0 rounded-full bg-[var(--biz-primary-soft)] px-2 py-0.5 text-xs font-bold text-[var(--biz-primary)]">
                    {it.badge}
                  </span>
                ) : null}
              </div>
              <p className={["mt-1 line-clamp-2", Biz.textMuted].join(" ")}>{it.desc}</p>
            </>
          );

          if (it.disabled) {
            return (
              <div
                key={it.title}
                className={[Biz.cardCompact, "opacity-50"].join(" ")}
                aria-disabled
                title="판매 승인·공개 후 이용할 수 있습니다"
              >
                {inner}
              </div>
            );
          }

          return (
            <Link
              key={it.href}
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
