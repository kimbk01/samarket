"use client";

import type { KeyboardEvent } from "react";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  HOME_BANNER_HERO_RATIO,
  pickHomeText,
  splitHomeBannerTitle,
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
  showCount = true,
}: {
  banner: HomeBannerConfig;
  index: number;
  total: number;
  onClick?: () => void;
  /** 「n / N」 장 수 (시안 v2 — 「전체보기」 없음) */
  showCount?: boolean;
}) {
  const { t, language } = useI18n();
  /* 시안 v2 §3-3: 홈 배너 = 제목(노랑 강조) + 버튼만. 칩·본문은 저장값만 남기고 그리지 않는다 */
  const title = pickHomeText(banner.title, language);
  const cta = banner.href ? pickHomeText(banner.ctaLabel, language) || t("home_banner_cta_default") : "";
  const full = banner.ratio === HOME_BANNER_HERO_RATIO;
  return (
    /*
     * 카드 = 블록(div). WebKit(iOS·Mac 앱)에서 <button> 안 겹친 그림 크기가 0 으로 계산되는 결함 (2026-11-18 실측) → 누르기는 role="button".
     * 비율은 `::before` 여백(padding-top %)으로 잡는다 — aspect-ratio 를 못 쓰는 WebKit 에서도 같은 높이.
     */
    <div
      {...(onClick
        ? {
            role: "button" as const,
            tabIndex: 0,
            onClick,
            onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            },
          }
        : {})}
      className={`home-hero-card ${full ? "home-hero-card--full" : "home-hero-card--split"}`}
      data-home-banner={banner.id}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 어드민이 올린 배너 그림 */}
      <img src={banner.imageUrl} alt="" className="home-hero-img" draggable={false} />
      <span className="home-hero-shade" aria-hidden />
      {banner.adLabel ? <span className="home-hero-ad">{t("home_ad")}</span> : null}
      {total > 1 && showCount ? (
        <span className="home-hero-count">{t("home_banner_position", { current: index + 1, total })}</span>
      ) : null}
      <span className="home-hero-copy">
        {title ? (
          <span className="home-hero-title">
            {splitHomeBannerTitle(title).map((part, i) =>
              part.hi ? (
                <span key={i} className="home-hero-hi">
                  {part.text}
                </span>
              ) : (
                <span key={i}>{part.text}</span>
              )
            )}
          </span>
        ) : null}
        {cta ? (
          <span className="home-hero-cta">
            {cta}
            <ArrowRight className="h-4 w-4" strokeWidth={2.4} aria-hidden />
          </span>
        ) : null}
      </span>
    </div>
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
