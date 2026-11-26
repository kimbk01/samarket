"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import { HomeHeroBannerCard } from "@/components/home-hub/HomeHeroBannerCard";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay/DibayBottomSheet";
import { HOME_MENU_CATALOG, resolveHomeBannerMenuKey, type HomeBannerConfig } from "@/lib/home/home-layout-contract";
import { keepSessionPick, nextBannerId } from "@/lib/home/home-rotation";
import type { HomeRotationCtl } from "@/components/home-hub/use-home-rotation";
import { homePressFeedback } from "@/lib/ui/home-press-feedback";

/**
 * 홈 메인 배너 SSOT — 시안 R3 (Owner 「배너 SSOT 구현」 2026-11-18).
 * 배너 한 장 = `HomeHeroBannerCard` (어드민 미리보기와 공용) · 이 파일 = 앱 홈 넘기기(‹ ›·점·교체 규칙·자동 넘김).
 * 자동 넘김 (Owner 2026-11-18 「계획대로 진행」 — 계획서 A2, 이전 「새로고침 때만 교체」 규칙 대체):
 * `HOME_BANNER_AUTO_MS` 마다 다음 배너 · 손가락·마우스가 배너에 있거나 방금 넘겼으면 쉼 · 화면 밖·앱 뒤로 가면 쉼 ·
 * 「동작 줄이기」면 끔 · 마지막 → 처음. 처음 보이는 배너는 기존 교체 규칙(새로고침·재접속 때 다음 배너) 그대로.
 */

/** 자동 넘김 간격 */
export const HOME_BANNER_AUTO_MS = 4000;

/** 로그인이 필요한 이동 곳 — 배너 이동 주소의 메뉴(`resolveHomeBannerMenuKey`)의 로그인 안내 */
function guestGateFor(href: string) {
  const k = resolveHomeBannerMenuKey(href);
  return k ? HOME_MENU_CATALOG[k].guestAuthAction : null;
}

/**
 * 홈 메인 배너 — 어드민 순서대로 옆으로 넘기기(자동 넘김 없음).
 * 처음 보이는 배너 = 기존 교체 규칙(새로고침·재접속 때 다음 배너, `useHomeRotation`).
 * 첫 그림(서버)은 높이만 잡고 숨긴다 → 마운트 후 이번 배너 위치로 옮겨 보인다(깜빡임·튐 방지).
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
  const { t } = useI18n();
  const router = useRouter();
  const ids = useMemo(() => banners.map((b) => b.id), [banners]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const activeRef = useRef(0);
  activeRef.current = active;
  /** 손가락·마우스가 배너 위에 있음 */
  const holdRef = useRef(false);
  /** 마지막으로 사람이 넘긴 시각 — 그 뒤 한 간격 동안 자동 넘김 쉼 */
  const touchedAtRef = useRef(0);
  /** 배너 칸이 화면에 보임 */
  const inViewRef = useRef(true);
  /** 「전체보기」 시트 (수정안 #2) — 열려 있으면 자동 넘김 쉼 */
  const [allOpen, setAllOpen] = useState(false);
  const allOpenRef = useRef(false);
  allOpenRef.current = allOpen;
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

  const cardLeft = useCallback((el: HTMLDivElement, i: number) => {
    const card = el.children[i] as HTMLElement | undefined;
    if (!card) return 0;
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
    return card.offsetLeft - pad;
  }, []);

  /** 이번 배너 위치로 바로 옮김 (보이기 전) */
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el || pickedId == null) return;
    const i = Math.max(0, ids.indexOf(pickedId));
    el.scrollLeft = cardLeft(el, i);
    setActive(i);
  }, [pickedId, ids, cardLeft]);

  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < el.children.length; i++) {
      const d = Math.abs(cardLeft(el, i) - el.scrollLeft);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setActive(best);
  }, [cardLeft]);

  const go = useCallback(
    (i: number) => {
      const el = trackRef.current;
      if (!el) return;
      const n = el.children.length;
      if (n === 0) return;
      const to = (i + n) % n;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollTo({ left: cardLeft(el, to), behavior: reduce ? "auto" : "smooth" });
    },
    [cardLeft]
  );

  /** 손으로 넘겨 장이 바뀌면 선택 진동 1회 (설계 §5-2) — 자동 넘김·처음 위치 잡기는 제외 */
  const lastFeedbackActiveRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = lastFeedbackActiveRef.current;
    lastFeedbackActiveRef.current = active;
    if (prev == null || prev === active) return;
    if (Date.now() - touchedAtRef.current < 1500) homePressFeedback("swipe");
  }, [active]);

  const multiCount = banners.length;
  const ready = pickedId != null;
  useEffect(() => {
    if (!ready || multiCount < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const sec = sectionRef.current;
    let io: IntersectionObserver | null = null;
    if (sec && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((es) => {
        inViewRef.current = es.some((e) => e.isIntersecting);
      });
      io.observe(sec);
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || !inViewRef.current || holdRef.current || allOpenRef.current) return;
      if (Date.now() - touchedAtRef.current < HOME_BANNER_AUTO_MS) return;
      go(activeRef.current + 1);
    }, HOME_BANNER_AUTO_MS);
    return () => {
      window.clearInterval(timer);
      io?.disconnect();
    };
  }, [ready, multiCount, go]);

  if (banners.length === 0) return null;
  const hidden = pickedId == null;
  const multi = banners.length > 1;

  const open = (b: HomeBannerConfig) => {
    homePressFeedback("tap");
    const gate = guestGateFor(b.href);
    if (!isMember && gate) {
      void requireAuthAction(gate, () => router.push(b.href), { next: b.href });
      return;
    }
    router.push(b.href);
  };

  return (
    <section
      ref={sectionRef}
      className={`home-hero${hidden ? " invisible" : ""}`}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") holdRef.current = true;
      }}
      onPointerLeave={() => {
        holdRef.current = false;
      }}
      onPointerDown={() => {
        touchedAtRef.current = Date.now();
      }}
      onTouchStart={() => {
        holdRef.current = true;
        touchedAtRef.current = Date.now();
      }}
      onTouchEnd={() => {
        holdRef.current = false;
        touchedAtRef.current = Date.now();
      }}
      onWheel={() => {
        touchedAtRef.current = Date.now();
      }}
      aria-hidden={hidden || undefined}
      aria-roledescription="carousel"
      data-home-banner-slot
    >
      <div ref={trackRef} className="home-hero-track" data-multi={multi || undefined} onScroll={onScroll}>
        {banners.map((b, i) => (
          <HomeHeroBannerCard
            key={b.id}
            banner={b}
            index={i}
            total={banners.length}
            onClick={b.href ? () => open(b) : undefined}
            showAllSlot={
              <button
                type="button"
                className="home-hero-all"
                onClick={(e) => {
                  e.stopPropagation();
                  homePressFeedback("tap");
                  setAllOpen(true);
                }}
              >
                {t("home_see_all")}
              </button>
            }
          />
        ))}
      </div>
      {multi ? (
        <>
          <button
            type="button"
            className="home-hero-arrow home-hero-arrow--prev"
            aria-label={t("home_banner_prev")}
            onClick={() => go(active - 1)}
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.4} aria-hidden />
          </button>
          <button
            type="button"
            className="home-hero-arrow home-hero-arrow--next"
            aria-label={t("home_banner_next")}
            onClick={() => go(active + 1)}
          >
            <ChevronRight className="h-5 w-5" strokeWidth={2.4} aria-hidden />
          </button>
          <div className="home-hero-dots" aria-hidden>
            {banners.map((b, i) => (
              <i key={b.id} className={i === active ? "is-on" : undefined} />
            ))}
          </div>
        </>
      ) : null}
      {multi ? (
        <DibayBottomSheet open={allOpen} onClose={() => setAllOpen(false)} title={t("home_banner_all_title")} heightRatio={0.85}>
          {/* 같은 배너 카드 세로 목록 — 앱 홈·어드민과 같은 부품 */}
          <div className="home-hero home-hero--preview" data-home-banner-all>
            <div className="home-hero-list">
              {banners.map((b, i) => (
                <HomeHeroBannerCard
                  key={b.id}
                  banner={b}
                  index={i}
                  total={banners.length}
                  showAllLabel={false}
                  onClick={
                    b.href
                      ? () => {
                          setAllOpen(false);
                          open(b);
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
        </DibayBottomSheet>
      ) : null}
    </section>
  );
}
