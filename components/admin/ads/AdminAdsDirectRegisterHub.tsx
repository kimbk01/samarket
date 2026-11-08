"use client";

/**
 * CUT R2 — Admin Direct product selection (canonical entry from + 광고 등록).
 * Community / Trade / Delivery Hero / Popup are separate products.
 * Boost / Delivery Sponsored are not offered.
 */

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";

const PRODUCTS = [
  {
    id: "community",
    href: "/admin/advertising/direct/community",
    titleKo: "커뮤니티 배너",
    titleEn: "Community banner",
    bodyKo: "커뮤니티 피드에 노출",
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
    titleKo: "배달 배너",
    titleEn: "Delivery banner",
    // 재감사 S-2 (H-7): 실제로 열리는 화면이 배달 배너 4종(홈 상단·홈 중간·업종 상단·검색 상단)을 모두 만든다
    bodyKo: "배달 홈 상단·홈 중간·업종 상단 배너",
    bodyEn: "Delivery home top, home middle, category top banners",
  },
  {
    id: "popup",
    href: "/admin/advertising/direct/popup",
    titleKo: "팝업",
    titleEn: "Popup",
    bodyKo: "서비스 팝업",
    bodyEn: "Service popup",
  },
] as const;

export type AdminAdsDirectRegisterDomain = (typeof PRODUCTS)[number]["id"];

/**
 * D-20: 도메인 메뉴 「광고 만들기」가 `?domain=` 을 붙여 연다 → 그 도메인 상품을 미리 고른 첫 상태.
 * 모르는 값이면 고르지 않는다(전체 4종 그대로).
 */
export function resolveAdminAdsDirectRegisterDomain(raw: string | null | undefined): AdminAdsDirectRegisterDomain | null {
  const v = String(raw ?? "").trim().toLowerCase();
  return PRODUCTS.some((p) => p.id === v) ? (v as AdminAdsDirectRegisterDomain) : null;
}

/** 미리 고른 도메인 상품을 맨 앞에 — 나머지는 원래 순서 */
export function orderAdminAdsDirectProducts(selected: AdminAdsDirectRegisterDomain | null) {
  if (!selected) return [...PRODUCTS];
  return [...PRODUCTS.filter((p) => p.id === selected), ...PRODUCTS.filter((p) => p.id !== selected)];
}

export function AdminAdsDirectRegisterHub() {
  return (
    <Suspense fallback={<AdminAdsDirectRegisterHubView selected={null} />}>
      <AdminAdsDirectRegisterHubWithQuery />
    </Suspense>
  );
}

function AdminAdsDirectRegisterHubWithQuery() {
  const sp = useSearchParams();
  return <AdminAdsDirectRegisterHubView selected={resolveAdminAdsDirectRegisterDomain(sp?.get("domain"))} />;
}

export function AdminAdsDirectRegisterHubView({ selected }: { selected: AdminAdsDirectRegisterDomain | null }) {
  const { language, t } = useI18n();
  const ko = language !== "en";
  const products = orderAdminAdsDirectProducts(selected);

  return (
    <div className="space-y-5" data-admin-ads-direct-flow="PRODUCT_SELECT_R2">
      <header className="space-y-1">
        <p className="text-[12px] text-sam-muted">
          <Link href="/admin/advertising" className="underline">
            {t("admin_ads_ads_banners")}
          </Link>
          {" › "}
          {t("admin_ads_register_ad")}
        </p>
        <h1 className="text-[20px] font-semibold text-sam-fg">
          {t("admin_ads_register_ad")}
        </h1>
        <p className="text-[14px] text-sam-fg">
          {t("admin_ads_which_ad_would_like_register")}
        </p>
      </header>

      <div
        className="grid gap-3 sm:grid-cols-2"
        data-admin-ads-direct-products="1"
        data-admin-ads-direct-selected-domain={selected ?? ""}
      >
        {products.map((p) => (
          <AdminActionLink
            key={p.id}
            href={p.href}
            variant="secondary"
            aria-current={p.id === selected ? "true" : undefined}
            className={`!block h-auto min-h-[96px] flex-col items-start justify-center gap-1 px-4 py-4 text-left !whitespace-normal${
              p.id === selected ? " ring-2 ring-sam-primary" : ""
            }`}
            data-admin-ads-direct-product={p.id}
            data-admin-ads-direct-selected={p.id === selected ? "1" : "0"}
          >
            <span className="text-[16px] font-bold text-sam-fg">
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
        {t("admin_ads_boost_delivery_sponsored_cannot_registered")}
      </p>
    </div>
  );
}
