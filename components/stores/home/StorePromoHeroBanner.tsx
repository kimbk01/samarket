"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { FB } from "@/components/stores/store-facebook-feed-tokens";

/** 짧은 히어로 — 업종 패널·피드로 자연스럽게 이어지도록 앵커 연결 */
export function StorePromoHeroBanner() {
  const { t } = useI18n();
  return (
    <Link
      href="/stores#store-industry-explore"
      className={`block overflow-hidden p-4 ${FB.card} active:opacity-[0.92]`}
    >
      <p className={`font-semibold uppercase tracking-wide ${FB.metaSm}`}>{t("store_promo_eyebrow")}</p>
      <p className={`mt-1 ${FB.name}`}>{t("store_promo_title")}</p>
      <p className={`mt-1 ${FB.meta}`}>{t("store_promo_subtitle")}</p>
      <span className={`mt-3 inline-block text-[14px] leading-[var(--delivery-lh-body)] ${FB.link}`}>
        {t("store_open_industries")}
      </span>
    </Link>
  );
}
