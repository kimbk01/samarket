"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import {
  HOME_BANNER_IMAGE_MAX_PX,
  HOME_BANNER_IMAGE_MIN_PX,
  HOME_BANNER_RATIO_CSS,
  HOME_BANNER_SIZE_PERCENT,
  HOME_BANNER_TITLE_PX,
  pickHomeText,
  type HomeBannerConfig,
} from "@/lib/home/home-layout-contract";
import { keepSessionPick, nextBannerId } from "@/lib/home/home-rotation";
import type { HomeRotationCtl } from "@/components/home-hub/use-home-rotation";

/** 로그인이 필요한 이동 곳 — 비로그인이면 기존 로그인 안내 */
function guestGateFor(href: string): "messenger_open" | "delivery_order" | null {
  if (href.startsWith("/community-messenger")) return "messenger_open";
  if (href.startsWith("/orders")) return "delivery_order";
  return null;
}

/** 배너 한 개 그림 — 앱 홈·어드민 미리보기 같은 모양 (네이버형: 카드·배경 없음) */
export function HomeBannerView({
  banner,
  language,
  adLabel,
  onClick,
}: {
  banner: HomeBannerConfig;
  language: string;
  adLabel: string;
  onClick?: () => void;
}) {
  const title = pickHomeText(banner.title, language);
  const body = pickHomeText(banner.body, language);
  const pct = HOME_BANNER_SIZE_PERCENT[banner.size];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`flex w-full items-center gap-4 px-5 py-5 text-left transition-opacity active:opacity-70 ${
        banner.side === "right" ? "flex-row-reverse" : ""
      }`}
      data-home-banner={banner.id}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 어드민이 올린 배너 이미지(비율 고정) */}
      <img
        src={banner.imageUrl}
        alt=""
        className="shrink-0 rounded-ui-rect object-cover"
        style={{
          width: `clamp(${HOME_BANNER_IMAGE_MIN_PX}px, ${pct}%, ${HOME_BANNER_IMAGE_MAX_PX}px)`,
          aspectRatio: HOME_BANNER_RATIO_CSS[banner.ratio],
        }}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className="home-banner-title line-clamp-2"
          style={{ fontSize: `${HOME_BANNER_TITLE_PX[banner.titleSize]}px` }}
        >
          {title}
        </span>
        {body ? (
          <span className="home-banner-body line-clamp-2">{body}</span>
        ) : null}
        {banner.adLabel ? <span className="home-banner-ad">{adLabel}</span> : null}
      </span>
    </Tag>
  );
}

/**
 * 홈 상단 배너 — 한 번에 1개. 새로고침·재접속 때만 다음 배너(어드민 순서로 한 바퀴).
 * 첫 그림(서버)은 높이만 잡고 숨긴다 → 마운트 후 이번에 보일 배너로 바꿔 깜빡임·튐을 막는다.
 */
export function HomeBanner({
  banners,
  isMember,
  rot,
}: {
  banners: HomeBannerConfig[];
  isMember: boolean;
  rot: HomeRotationCtl | null;
}) {
  const { t, language } = useI18n();
  const router = useRouter();
  const ids = useMemo(() => banners.map((b) => b.id), [banners]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const mode = rot?.mode;
  const seq = rot?.seq;

  useEffect(() => {
    if (!rot || ids.length === 0) return;
    const id =
      rot.mode === "session" && rot.session.bannerId && ids.includes(rot.session.bannerId)
        ? rot.session.bannerId
        : rot.mode === "session"
          ? keepSessionPick(ids, (x) => x, [], 1)[0] ?? null
          : nextBannerId(ids, rot.history.bannerId);
    setPickedId(id);
    rot.commit({ bannerId: id });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 교체는 mode·seq(새로고침) 기준
  }, [mode, seq, ids.join("|")]);

  if (banners.length === 0) return null;
  const banner = banners.find((b) => b.id === pickedId) ?? banners[0]!;
  const hidden = pickedId == null;

  const onClick = banner.href
    ? () => {
        const gate = guestGateFor(banner.href);
        if (!isMember && gate) {
          void requireAuthAction(gate, () => router.push(banner.href), { next: banner.href });
          return;
        }
        router.push(banner.href);
      }
    : undefined;

  return (
    <section className={hidden ? "invisible" : undefined} aria-hidden={hidden || undefined} data-home-banner-slot>
      <HomeBannerView banner={banner} language={language} adLabel={t("home_ad")} onClick={onClick} />
    </section>
  );
}

/** 어드민 「홈 구성」 미리보기 — 앱 홈과 같은 부품·같은 바탕(폰 375 / 태블릿 760 폭) */
export function HomeBannerPreviewFrame({
  banner,
  language,
  adLabel,
  width,
}: {
  banner: HomeBannerConfig;
  language: string;
  adLabel: string;
  width: number;
}) {
  return (
    <div className="home-banner-frame mx-auto" style={{ width }} data-home-banner-preview>
      <HomeBannerView banner={banner} language={language} adLabel={adLabel} />
    </div>
  );
}
