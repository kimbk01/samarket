"use client";

import { ArrowRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  HOME_BANNER_HERO_RATIO,
  HOME_MENU_CATALOG,
  pickHomeText,
  resolveHomeBannerMenuKey,
  type HomeBannerConfig,
} from "@/lib/home/home-layout-contract";

/**
 * 홈 메인 배너 한 장 SSOT — 시안 R3 (Owner 「배너 SSOT 구현」 2026-11-18).
 * 앱 홈(`HomeBanner`)과 어드민 「홈 구성」 미리보기(`HomeHeroBannerPreview`)가 이 부품 하나를 쓴다.
 * 모양·크기는 `app/home-hub.css` 의 `.home-hero*` (배너 칸 폭 기준: 휴대폰 <600 · 태블릿 600–1023 · PC ≥1024).
 * 16:9 그림 = 사진 꽉 찬 배너 · 그 밖 비율(예전 1:1 등) = 왼쪽 글·오른쪽 그림 배너.
 */

/** 배너 한 장 — 앱 홈·어드민 미리보기 공용 */
export function HomeHeroBannerCard({
  banner,
  index,
  total,
  onClick,
}: {
  banner: HomeBannerConfig;
  index: number;
  total: number;
  onClick?: () => void;
}) {
  const { t, language } = useI18n();
  const menuKey = resolveHomeBannerMenuKey(banner.href);
  const chip = pickHomeText(banner.chip, language) || (menuKey ? t(HOME_MENU_CATALOG[menuKey].labelKey) : "");
  const title = pickHomeText(banner.title, language);
  const body = pickHomeText(banner.body, language);
  const cta = banner.href ? pickHomeText(banner.ctaLabel, language) || t("home_banner_cta_default") : "";
  const full = banner.ratio === HOME_BANNER_HERO_RATIO;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`home-hero-card ${full ? "home-hero-card--full" : "home-hero-card--split"}`}
      data-home-banner={banner.id}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 어드민이 올린 배너 그림 */}
      <img src={banner.imageUrl} alt="" className="home-hero-img" draggable={false} />
      <span className="home-hero-shade" aria-hidden />
      {banner.adLabel ? <span className="home-hero-ad">{t("home_ad")}</span> : null}
      {total > 1 ? (
        <span className="home-hero-count">{t("home_banner_position", { current: index + 1, total })}</span>
      ) : null}
      <span className="home-hero-copy">
        {chip ? <span className="home-hero-chip">{chip}</span> : null}
        {title ? <span className="home-hero-title">{title}</span> : null}
        {body ? <span className="home-hero-body">{body}</span> : null}
        {cta ? (
          <span className="home-hero-cta">
            {cta}
            <ArrowRight className="h-4 w-4" strokeWidth={2.4} aria-hidden />
          </span>
        ) : null}
      </span>
    </Tag>
  );
}

/** 어드민 미리보기 — 앱 홈과 같은 부품·같은 CSS 를 정해진 폭(폰·태블릿·PC)으로 그린다 */
export function HomeHeroBannerPreview({
  banner,
  index,
  total,
  width,
}: {
  banner: HomeBannerConfig;
  index: number;
  total: number;
  width: number;
}) {
  return (
    <div className="home-hero home-hero--preview mx-auto" style={{ width }} data-home-banner-preview>
      <div className="home-hero-track">
        <HomeHeroBannerCard banner={banner} index={index} total={total} />
      </div>
    </div>
  );
}
