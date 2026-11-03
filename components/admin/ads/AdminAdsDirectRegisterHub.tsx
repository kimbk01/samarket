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

export function AdminAdsDirectRegisterHub() {
  const { language } = useI18n();
  const ko = language !== "en";

  return (
    <div className="space-y-5" data-admin-ads-direct-flow="PRODUCT_SELECT_R2">
      <header className="space-y-1">
        <p className="text-[12px] text-sam-muted">
          <Link href="/admin/advertising" className="underline">
            {ko ? "광고·배너" : "Ads & banners"}
          </Link>
          {" › "}
          {ko ? "광고 등록" : "Register ad"}
        </p>
        <h1 className="text-[20px] font-semibold text-sam-fg">
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
        {ko
          ? "상위노출·매장 홍보는 운영자 직접 등록으로 만들 수 없습니다(회원·사장님 결제 상품)."
          : "Boost and Delivery Sponsored cannot be registered via Admin Direct."}
      </p>
    </div>
  );
}
