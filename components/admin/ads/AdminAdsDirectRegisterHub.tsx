"use client";

/**
 * CUT R2 — Admin Direct product selection (canonical entry from + 광고 등록).
 * Community / Trade / Delivery Hero / Popup are separate products.
 * Boost / Delivery Sponsored are not offered.
 */

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";

const PRODUCTS = [
  {
    id: "community",
    href: "/admin/advertising/direct/community",
    titleKo: "Community 배너",
    titleEn: "Community banner",
    bodyKo: "Community 피드에 노출",
    bodyEn: "Shown in the Community feed",
  },
  {
    id: "trade",
    href: "/admin/advertising/direct/trade",
    titleKo: "거래 배너",
    titleEn: "Trade banner",
    bodyKo: "거래 피드에 노출",
    bodyEn: "Shown in the Trade feed",
  },
  {
    id: "delivery",
    href: "/admin/advertising/direct/delivery",
    titleKo: "배달 홈 상단 배너",
    titleEn: "Delivery home hero banner",
    bodyKo: "배달 홈 Hero 영역",
    bodyEn: "Delivery home Hero area",
  },
  {
    id: "popup",
    href: "/admin/advertising/direct/popup",
    titleKo: "Popup",
    titleEn: "Popup",
    bodyKo: "서비스 Popup",
    bodyEn: "Service popup",
  },
] as const;

export function AdminAdsDirectRegisterHub() {
  const { language } = useI18n();
  const ko = language !== "en";

  return (
    <div className="space-y-5" data-admin-ads-direct-flow="PRODUCT_SELECT_R2">
      <header className="space-y-1">
        <p className="text-[12px] text-sam-muted">
          <Link href="/admin/advertising" className="underline">
            {ko ? "광고 / 노출" : "Ads / Exposure"}
          </Link>
          {" › "}
          {ko ? "광고 등록" : "Register ad"}
        </p>
        <h1 className="text-lg font-semibold text-sam-fg">
          {ko ? "광고 등록" : "Register ad"}
        </h1>
        <p className="text-[14px] text-sam-fg">
          {ko ? "어떤 광고를 등록하시겠습니까?" : "Which ad would you like to register?"}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2" data-admin-ads-direct-products="1">
        {PRODUCTS.map((p) => (
          <AdminActionLink
            key={p.id}
            href={p.href}
            variant="secondary"
            className="!block h-auto min-h-[96px] flex-col items-start justify-center gap-1 px-4 py-4 text-left !whitespace-normal"
            data-admin-ads-direct-product={p.id}
          >
            <span className="text-[15px] font-bold text-sam-fg">
              {ko ? p.titleKo : p.titleEn}
            </span>
            <span className="text-[13px] font-normal text-sam-muted">
              {ko ? p.bodyKo : p.bodyEn}
            </span>
          </AdminActionLink>
        ))}
      </div>

      <p
        className="text-[12px] text-sam-muted"
        data-admin-direct-store-promote-blocked="1"
      >
        {ko
          ? "Boost·매장 상위홍보(Delivery Sponsored)는 Admin Direct로 등록할 수 없습니다."
          : "Boost and Delivery Sponsored cannot be registered via Admin Direct."}
      </p>
    </div>
  );
}
