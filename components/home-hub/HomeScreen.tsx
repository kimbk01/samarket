"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Tier1NotificationAnchor } from "@/components/notifications/Tier1NotificationAnchor";
import { SectorHeaderBar } from "@/components/layout/sector-header/SectorHeaderBar";
import { samTier1HeaderIconCluster } from "@/lib/ui/tier1-header-icon";
import { dibayDomainChromeElementPropsForId } from "@/lib/ui/dibay-domain-chrome";
import { DibayPtrSlot } from "@/components/ptr/DibayPtrSlot";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { useRepresentativeAddressLine } from "@/hooks/use-representative-address-line";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import { buildLoginHref } from "@/lib/auth/client-access-flow";
import {
  HOME_MENU_CATALOG,
  HOME_SECTION_DEFAULT_TITLE_KEYS,
  pickHomeText,
  resolveAudienceBanners,
  resolveVisibleHomeSections,
  type HomeLayoutConfig,
  type HomeMenuKey,
  type HomeSectionKey,
  type HomeServiceKey,
} from "@/lib/home/home-layout-contract";
import type { HomeCatalog } from "@/lib/home/home-catalog-types";
import { addHomePullRefreshHandler, homePtrStore } from "@/lib/home/home-pull-refresh-store";
import { HomePullRefreshHost } from "@/components/home-hub/HomePullRefreshHost";
import { HomeBanner } from "@/components/home-hub/HomeBanner";
import { HomeServiceCards } from "@/components/home-hub/HomeServiceCards";
import { HomeNoticeLine } from "@/components/home-hub/HomeNoticeLine";
import { HomeDiscoverFeed } from "@/components/home-hub/HomeDiscoverFeed";
import { useHomeRotation } from "@/components/home-hub/use-home-rotation";
import { hasSupabaseAuthTokenCookie } from "@/lib/home/home-banner-audience-hint";

/**
 * 앱 홈 `/`·`/home` — 홈 시안 v4 (Owner 「이 시안으로 진행」 2026-11-14, 이전 v22 2026-11-09).
 * 상단(로고 · 오른쪽 주소 · 종 — 헤더 SSOT 그대로) → 당겨서 새로고침 슬롯 → 서비스 입구(telRING 대표 칸) →
 * 어드민 배너 → 공지 한 줄 → 지금 우리 동네(섞인 피드). 검색창·개인 숫자 칸 없음(통합검색 = 라운지 머리글 검색).
 * 바뀌는 때 = 당겨서 새로고침·재접속만(`useHomeRotation`). 비로그인: 읽기 가능, 개인 기능 = 기존 로그인 안내, 배달 = S-07.
 */
export function HomeScreen({
  initialLayout,
  initialCatalog,
}: {
  initialLayout: HomeLayoutConfig;
  initialCatalog: HomeCatalog;
}) {
  const { t, language } = useI18n();
  const router = useRouter();
  const membership = useClientMembershipState("home-screen");
  const isMember = membership.status === "member";
  const isGuest = membership.status === "guest";
  const [layout, setLayout] = useState<HomeLayoutConfig>(initialLayout);
  const [catalog, setCatalog] = useState<HomeCatalog>(initialCatalog);
  const [refreshSeq, setRefreshSeq] = useState(0);
  const address = useRepresentativeAddressLine();
  const { ctl: rot, init: initRotation, rotateNow } = useHomeRotation();

  useEffect(() => {
    initRotation();
  }, [initRotation]);

  /** R1: 회원 확인 중 배너 대상 — 기기 로그인 쿠키 유무(마운트 후 1회, 서버 그림과 어긋나지 않게 효과에서 읽음) */
  const [authCookieHint, setAuthCookieHint] = useState<boolean | null>(null);
  useEffect(() => {
    setAuthCookieHint(hasSupabaseAuthTokenCookie(document.cookie));
  }, []);
  const bannerAudienceMember: boolean | null = membership.status === "checking" ? authCookieHint : isMember;

  const reloadLayout = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/home/layout", { cache: "no-store", credentials: "include" });
      const data = (await res.json()) as { ok?: boolean; config?: HomeLayoutConfig; catalog?: HomeCatalog };
      if (!res.ok || !data.ok || !data.config) return false;
      setLayout(data.config);
      if (data.catalog) setCatalog(data.catalog);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(
    () =>
      addHomePullRefreshHandler(async () => {
        const ok = await reloadLayout();
        rotateNow();
        setRefreshSeq((n) => n + 1);
        return ok ? "success" : "error";
      }),
    [reloadLayout, rotateNow]
  );

  const openMenu = useCallback(
    (k: HomeMenuKey) => {
      const m = HOME_MENU_CATALOG[k];
      if (!isMember && m.guestAuthAction) {
        void requireAuthAction(m.guestAuthAction, () => router.push(m.href), { next: m.href });
        return;
      }
      router.push(m.href);
    },
    [isMember, router]
  );
  /** telRING 대표 칸의 채팅·통화 바로가기 — 비로그인 안내는 메뉴와 같은 규칙 */
  const openMenuHref = useCallback(
    (k: HomeServiceKey, href: string) => {
      const m = HOME_MENU_CATALOG[k];
      if (!isMember && m.guestAuthAction) {
        void requireAuthAction(m.guestAuthAction, () => router.push(href), { next: href });
        return;
      }
      router.push(href);
    },
    [isMember, router]
  );

  const sections = useMemo(() => resolveVisibleHomeSections(layout, !isMember), [layout, isMember]);
  const banners = useMemo(
    () => resolveAudienceBanners(layout, !(bannerAudienceMember ?? isMember)),
    [layout, bannerAudienceMember, isMember]
  );

  const sectionTitle = (key: HomeSectionKey): string => {
    const cfg = layout.sections.find((s) => s.key === key);
    const custom = pickHomeText(cfg?.title, language);
    if (custom) return custom;
    const k = HOME_SECTION_DEFAULT_TITLE_KEYS[key];
    return k ? t(k) : "";
  };

  const addressLabel = isMember
    ? address.status === "ready" && address.line
      ? address.line
      : address.status === "loading"
        ? ""
        : t("home_address_unset")
    : t("home_address_all");

  return (
    <div className="min-h-full bg-[#F3F5F3]" data-home-screen>
      <HomePullRefreshHost />

      {/* 상단 — 로고 · 오른쪽 주소 · 종 (Owner 2026-11-09 「로고 우측에 주소」) */}
      {/* 헤더 SSOT 3단계 — 바탕 = 홈 도메인 색 · 아래 구분선 */}
      <header
        className="border-b border-[color:var(--dibay-domain-divider)] bg-[color:var(--dibay-domain-surface)]"
        data-home-header
        {...dibayDomainChromeElementPropsForId("home")}
      >
        {/* 헤더 SSOT — 다른 허브와 같은 공통 줄 부품(`SectorHeaderBar` 제목-왼쪽 · 왼쪽 빈칸 없음) */}
        <div className="sector-header--no-left-slot" style={{ paddingTop: "var(--safe-top, 0px)" }}>
          <SectorHeaderBar
            centerAlign="left"
            center={
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex shrink-0 items-center gap-1.5" aria-label="dibaY">
                  {/* eslint-disable-next-line @next/next/no-img-element -- 정적 브랜드 아이콘 26px */}
                  <img src="/images/brand/dibay-app-icon-180.png" alt="" width={26} height={26} className="h-[26px] w-[26px] rounded-[7px]" />
                  <span className="text-[21px] font-extrabold tracking-[-0.02em] text-sam-primary">
                    diba<span className="text-[#E0A800]">Y</span>
                  </span>
                </span>
                {layout.header.showAddress ? (
                  <button
                    type="button"
                    aria-label={t("home_address_change_aria")}
                    className="flex min-w-0 flex-1 items-center gap-0.5 px-1 py-1 text-left text-[length:var(--sector-header-title-size)] font-semibold leading-none text-[color:var(--sector-header-title-color)] active:opacity-60"
                    onClick={() => {
                      if (isMember) router.push("/mypage/addresses");
                      else void requireAuthAction("address_save", () => router.push("/mypage/addresses"), { next: "/home" });
                    }}
                    data-home-address
                  >
                    <span className="min-w-0 truncate">{addressLabel}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} aria-hidden />
                  </button>
                ) : null}
              </span>
            }
            right={
              <div className={samTier1HeaderIconCluster}>
                {isMember ? (
                  <Tier1NotificationAnchor />
                ) : isGuest ? (
                  <button
                    type="button"
                    className="shrink-0 rounded-full bg-sam-primary px-3.5 py-1.5 text-[13px] font-semibold text-white active:brightness-90"
                    onClick={() => router.push(buildLoginHref("/home"))}
                  >
                    {t("home_sign_in")}
                  </button>
                ) : null}
              </div>
            }
          />
        </div>
        {/* 당겨서 새로고침 슬롯 — 커뮤니티·거래와 같은 공통 슬롯(1단 아래 · 시그니처 그린) */}
        <DibayPtrSlot store={homePtrStore} tone="onBrand" className="bg-signature" dataAttribute="data-home-ptr-hint" />
      </header>

      {sections.map((key) => {
        if (key === "services") {
          return (
            <HomeServiceCards
              key={key}
              services={layout.services}
              catalog={catalog}
              onOpen={openMenu}
              onOpenHref={openMenuHref}
            />
          );
        }
        if (key === "banner") {
          // 회원 확인 중에는 기기 로그인 쿠키로 대상을 먼저 정해 바로 보인다(R1). 확인 결과가 다르면 그 대상 배너로 바뀐다.
          // 쿠키를 아직 읽기 전(마운트 직후)에만 고르지 않는다 (감사 E14).
          return banners.length ? (
            <div key={key} className="mt-2 bg-white pt-1" data-home-banner-wrap>
              <HomeBanner banners={banners} isMember={isMember} rot={bannerAudienceMember == null ? null : rot} />
            </div>
          ) : null;
        }
        if (key === "notice") {
          return <HomeNoticeLine key={key} notice={catalog.latestNotice} />;
        }
        if (key === "feed") {
          return (
            <HomeDiscoverFeed
              key={key}
              layout={layout}
              title={sectionTitle("feed")}
              tradeCategories={catalog.tradeCategories}
              isMember={isMember}
              membershipChecking={membership.status === "checking"}
              rot={rot}
              refreshSeq={refreshSeq}
            />
          );
        }
        return null;
      })}
    </div>
  );
}
