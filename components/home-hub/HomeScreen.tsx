"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Coins, Gift, Headset, Heart, LayoutGrid, MessageCircle, Newspaper, Receipt, Search, Tag, type LucideIcon } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Tier1NotificationAnchor } from "@/components/notifications/Tier1NotificationAnchor";
import { SectorHeaderBar } from "@/components/layout/sector-header/SectorHeaderBar";
import { samTier1HeaderIconCluster } from "@/lib/ui/tier1-header-icon";
import { DibayPtrSlot } from "@/components/ptr/DibayPtrSlot";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { useRepresentativeAddressLine } from "@/hooks/use-representative-address-line";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import { buildLoginHref } from "@/lib/auth/client-access-flow";
import { useOwnerHubBadgeTabUnreadCount } from "@/lib/chats/use-owner-hub-badge-total";
import {
  HOME_MENU_CATALOG,
  HOME_SECTION_DEFAULT_TITLE_KEYS,
  pickHomeText,
  resolveAudienceBanners,
  resolveVisibleHomeSections,
  type HomeLayoutConfig,
  type HomeMenuKey,
  type HomeSectionKey,
} from "@/lib/home/home-layout-contract";
import type { HomeCatalog } from "@/lib/home/home-catalog-types";
import { addHomePullRefreshHandler, homePtrStore } from "@/lib/home/home-pull-refresh-store";
import { openGlobalSearchFromHere } from "@/lib/search/global/global-search-navigation-ssot";
import { HomePullRefreshHost } from "@/components/home-hub/HomePullRefreshHost";
import { HomeBanner } from "@/components/home-hub/HomeBanner";
import { HomeOngoingSection } from "@/components/home-hub/HomeOngoingSection";
import { HomeServiceCards } from "@/components/home-hub/HomeServiceCards";
import { HomeCategoryRow } from "@/components/home-hub/HomeCategoryRow";
import { HomeStoresSection } from "@/components/home-hub/HomeStoresSection";
import { HomeTradeRow } from "@/components/home-hub/HomeTradeRow";
import { HomePostsSection } from "@/components/home-hub/HomePostsSection";
import { useHomeRotation } from "@/components/home-hub/use-home-rotation";
import { hasSupabaseAuthTokenCookie } from "@/lib/home/home-banner-audience-hint";

const SHORTCUT_ICON: Record<HomeMenuKey, LucideIcon> = {
  trade: Tag,
  stores: Receipt,
  philife: Newspaper,
  chat: MessageCircle,
  events: Gift,
  orders: Receipt,
  points: Coins,
  favorites: Heart,
  support: Headset,
  all: LayoutGrid,
};


/**
 * 앱 홈 `/`·`/home` — 홈 시안 v22 (Owner 「이대로 구현」 2026-11-09).
 * 밝은 상단(로고 · 오른쪽 주소 · 종) → 1단 아래 당겨서 새로고침 슬롯(커뮤니티와 같은 공통 슬롯) → 큰 검색창 →
 * 어드민 「홈 구성」 칸(배너 · 진행 중 배달 · 서비스 카드 · 배달 업종 · 매장 메뉴 · 거래 · 교민 이야기 · 바로가기).
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
  const chatUnread = useOwnerHubBadgeTabUnreadCount("chat");
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

  const sections = useMemo(() => resolveVisibleHomeSections(layout, !isMember), [layout, isMember]);
  const banners = useMemo(
    () => resolveAudienceBanners(layout, !(bannerAudienceMember ?? isMember)),
    [layout, bannerAudienceMember, isMember]
  );
  const shortcuts = layout.shortcuts.filter((x) => x.visible);

  const sectionTitle = (key: HomeSectionKey): string => {
    const cfg = layout.sections.find((s) => s.key === key);
    const custom = pickHomeText(cfg?.title, language);
    if (custom) return custom;
    const k = HOME_SECTION_DEFAULT_TITLE_KEYS[key];
    return k ? t(k) : "";
  };

  const searchPlaceholder = pickHomeText(layout.header.searchPlaceholder, language) || t("home_search_placeholder");
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
      <header className="bg-[#F3F5F3]" data-home-header>
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
        <div className="px-3.5 pb-1 pt-3">
          <button
            type="button"
            aria-label={t("home_search_aria")}
            className="flex h-[54px] w-full items-center gap-2 rounded-full bg-white pl-[22px] pr-2 text-left shadow-[0_6px_20px_rgba(20,40,25,0.10)] active:opacity-80"
            onClick={() => openGlobalSearchFromHere(router, "/home")}
            data-home-search
          >
            <span className="min-w-0 flex-1 truncate text-[15px] text-[#9aa39c]">{searchPlaceholder}</span>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sam-primary">
              <Search className="h-[19px] w-[19px] text-white" strokeWidth={2.6} aria-hidden />
            </span>
          </button>
        </div>
      </header>

      {sections.map((key) => {
        if (key === "banner") {
          // 회원 확인 중에는 기기 로그인 쿠키로 대상을 먼저 정해 바로 보인다(R1). 확인 결과가 다르면 그 대상 배너로 바뀐다.
          // 쿠키를 아직 읽기 전(마운트 직후)에만 고르지 않는다 (감사 E14).
          return banners.length ? (
            <HomeBanner key={key} banners={banners} isMember={isMember} rot={bannerAudienceMember == null ? null : rot} />
          ) : null;
        }
        if (key === "ongoing") {
          return isMember ? <HomeOngoingSection key={key} refreshSeq={refreshSeq} /> : null;
        }
        if (key === "services") {
          return (
            <HomeServiceCards
              key={key}
              services={layout.services}
              catalog={catalog}
              chatUnread={chatUnread}
              isMember={isMember}
              onOpen={openMenu}
            />
          );
        }
        if (key === "categories") {
          return (
            <HomeCategoryRow
              key={key}
              config={layout.categories}
              categories={catalog.storeCategories}
              title={sectionTitle("categories")}
            />
          );
        }
        if (key === "stores") {
          return membership.status === "checking" ? null : (
            <HomeStoresSection
              key={key}
              config={layout.stores}
              title={sectionTitle("stores")}
              isMember={isMember}
              rot={rot}
              refreshSeq={refreshSeq}
            />
          );
        }
        if (key === "trades") {
          return (
            <HomeTradeRow
              key={key}
              config={layout.trades}
              title={sectionTitle("trades")}
              tradeCategories={catalog.tradeCategories}
              rot={rot}
              refreshSeq={refreshSeq}
            />
          );
        }
        if (key === "posts") {
          return <HomePostsSection key={key} config={layout.posts} title={sectionTitle("posts")} refreshSeq={refreshSeq} />;
        }
        if (key === "shortcuts" && shortcuts.length) {
          return (
            <div
              key={key}
              className="mx-3 mt-3 grid rounded-ui-rect bg-white py-3"
              style={{ gridTemplateColumns: `repeat(${shortcuts.length}, minmax(0, 1fr))` }}
              data-home-shortcuts
            >
              {shortcuts.map((x) => {
                const Icon = SHORTCUT_ICON[x.key];
                return (
                  <button
                    key={x.key}
                    type="button"
                    onClick={() => openMenu(x.key)}
                    className="flex flex-col items-center gap-1 text-[11.5px] text-[#333] active:opacity-60"
                  >
                    <Icon className="h-[19px] w-[19px] text-[#2f4a35]" strokeWidth={1.8} aria-hidden />
                    <span>{t(HOME_MENU_CATALOG[x.key].labelKey)}</span>
                  </button>
                );
              })}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
