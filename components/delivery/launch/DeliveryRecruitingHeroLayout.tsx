"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  DELIVERY_LAUNCH_WIDE_MIN_CONTENT_PX,
  resolveDeliveryLaunchTexts,
  type DeliveryLaunchPublicState,
} from "@/lib/delivery/launch/delivery-launch-contract";

/**
 * 배달 매장 모집 배너 — 기기별 배치 (Owner 2026-11-10 · 설계 v2 §4-2).
 * 폰: 4:3 사진 + 사진 아래쪽에 겹친 단색(브랜드 그린) 안내 판 / 본문 600px 이상: 2:1 사진 + 단색 안내 판 2단.
 * 안내 문구는 항상 단색 배경 위 — 어떤 사진이 와도 글자가 묻히지 않는다 (Owner 「텍스트 배경이 있는 형태」 2026-11-10).
 */

/** 배달 본문 폭 기준 와이드 판정 (태블릿·폴더블·폰 가로·PC·Windows) */
function useWideLayout(ref: RefObject<HTMLElement | null>): boolean {
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => setWide(el.getBoundingClientRect().width >= DELIVERY_LAUNCH_WIDE_MIN_CONTENT_PX);
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return wide;
}

function BannerImage({ src, wide }: { src: string; wide: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div
      className={`relative w-full overflow-hidden bg-sam-primary ${wide ? "h-full min-h-[180px]" : "aspect-[4/3]"}`}
      data-delivery-recruiting-image={wide ? "wide" : "mobile"}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- 어드민 업로드 원본 URL(외부 버킷), 비율 칸이 자리를 먼저 잡는다
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          decoding="async"
          fetchPriority="high"
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}

export type DeliveryRecruitingHeroActionsArgs = {
  applyLabel: string;
  inquiryLabel: string;
  applyClassName: string;
  inquiryClassName: string;
};

/**
 * 모집 배너 레이아웃 (기기별) — 고객 화면(`DeliveryRecruitingHero`)과 어드민 미리보기가 같은 레이아웃을 쓴다.
 * 버튼은 호출하는 쪽이 그린다(고객 = 실제 이동·문의, 어드민 = 표시만).
 */
export function DeliveryRecruitingHeroLayout({
  state,
  renderActions,
}: {
  state: DeliveryLaunchPublicState;
  renderActions: (args: DeliveryRecruitingHeroActionsArgs) => ReactNode;
}) {
  const { t, language } = useI18n();
  const rootRef = useRef<HTMLElement | null>(null);
  const wide = useWideLayout(rootRef);
  const texts = resolveDeliveryLaunchTexts(state.content, language);
  const imageSrc = wide ? state.content.wideImageUrl || state.content.mobileImageUrl : state.content.mobileImageUrl;
  const badge = texts.badge;
  const title = texts.title || t("delivery_recruiting_default_title");
  const applyLabel = texts.applyLabel || t("delivery_recruiting_apply");
  const inquiryLabel = texts.inquiryLabel || t("delivery_recruiting_inquiry");

  const textBlock = (
    <div
      className={`flex flex-col gap-2 bg-sam-primary text-white ${
        wide ? "justify-center p-5" : "relative z-[1] mx-2.5 -mt-10 mb-2.5 rounded-ui-rect px-4 pb-4 pt-3.5 shadow-lg"
      }`}
      data-delivery-recruiting-text-panel
    >
      {badge ? (
        <span className="w-fit rounded-full bg-[var(--dibay-gold)] px-2.5 py-0.5 text-[12px] font-bold text-sam-primary">
          {badge}
        </span>
      ) : null}
      <h2 className="text-[20px] font-extrabold leading-snug [text-wrap:balance]">{title}</h2>
      {texts.body ? <p className="text-[13px] leading-relaxed opacity-90">{texts.body}</p> : null}
      {texts.schedule ? (
        <p className="rounded-ui-rect bg-white/10 px-2.5 py-1.5 text-[12px] font-medium">{texts.schedule}</p>
      ) : null}
      <div className="mt-1 grid grid-cols-[1.4fr_1fr] gap-2">
        {renderActions({
          applyLabel,
          inquiryLabel,
          applyClassName:
            "rounded-ui-rect bg-white px-3 py-2.5 text-center text-[14px] font-extrabold text-sam-primary active:opacity-80",
          inquiryClassName:
            "rounded-ui-rect border border-white/60 px-3 py-2.5 text-center text-[14px] font-bold text-white active:opacity-80",
        })}
      </div>
    </div>
  );

  return (
    <section
      ref={rootRef}
      className={`overflow-hidden rounded-ui-rect ${wide ? "bg-sam-primary" : "bg-sam-primary-soft"}`}
      data-delivery-recruiting-hero={wide ? "wide" : "mobile"}
      aria-label={title}
    >
      {wide ? (
        <div className="grid grid-cols-[1.15fr_1fr]">
          <BannerImage src={imageSrc} wide />
          {textBlock}
        </div>
      ) : (
        <>
          <BannerImage src={imageSrc} wide={false} />
          {textBlock}
        </>
      )}
    </section>
  );
}

