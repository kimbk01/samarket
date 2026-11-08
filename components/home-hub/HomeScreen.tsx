"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Tier1NotificationAnchor } from "@/components/notifications/Tier1NotificationAnchor";
import { DibayPtrSlot } from "@/components/ptr/DibayPtrSlot";
import {
  Bike,
  Coins,
  Gift,
  Headset,
  Heart,
  LayoutGrid,
  MapPin,
  MessageCircle,
  Newspaper,
  Receipt,
  Search,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { useRepresentativeAddressLine } from "@/hooks/use-representative-address-line";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import { buildLoginHref } from "@/lib/auth/client-access-flow";
import { useOwnerHubBadgeTabUnreadCount } from "@/lib/chats/use-owner-hub-badge-total";
import {
  HOME_MENU_CATALOG,
  HOME_PANEL_LABEL_KEYS,
  resolveVisibleHomeSections,
  type HomeLayoutConfig,
  type HomeMenuKey,
  type HomePanelKey,
} from "@/lib/home/home-layout-contract";
import { addHomePullRefreshHandler, homePtrStore } from "@/lib/home/home-pull-refresh-store";
import { openGlobalSearchFromHere } from "@/lib/search/global/global-search-navigation-ssot";
import { HomeOngoingSection } from "@/components/home-hub/HomeOngoingSection";
import { HomePanels } from "@/components/home-hub/HomePanels";
import { HomePullRefreshHost } from "@/components/home-hub/HomePullRefreshHost";

const MENU_ICON: Record<HomeMenuKey, LucideIcon> = {
  trade: Tag,
  stores: Bike,
  philife: Newspaper,
  chat: MessageCircle,
  events: Gift,
  orders: Receipt,
  points: Coins,
  favorites: Heart,
  support: Headset,
  all: LayoutGrid,
};

/** 서비스 입구 카드 색 — DIBAY 토큰 계열(연한 바탕 + 진한 아이콘) */
const MENU_TINT: Record<HomeMenuKey, { bg: string; fg: string }> = {
  trade: { bg: "#E3F0E6", fg: "#1F6B36" },
  stores: { bg: "#FFEBD6", fg: "#C0622A" },
  philife: { bg: "#E2F1EE", fg: "#17574C" },
  chat: { bg: "#F0E8F8", fg: "#6A3F99" },
  events: { bg: "#E6EDFA", fg: "#2B4F8C" },
  orders: { bg: "#FFF3D6", fg: "#8F5400" },
  points: { bg: "#FDE8E6", fg: "#A23535" },
  favorites: { bg: "#FDE8E6", fg: "#A23535" },
  support: { bg: "#EEF0EF", fg: "#4F5C53" },
  all: { bg: "#EEF0EF", fg: "#4F5C53" },
};

function MenuGlyph({ k, className }: { k: HomeMenuKey; className?: string }) {
  const Icon = MENU_ICON[k];
  return <Icon className={className ?? "h-6 w-6"} strokeWidth={1.8} aria-hidden />;
}

/**
 * 앱 홈 `/`·`/home` — 홈 설계안 v11 (Owner 「구현 시작」 2026-11-09).
 * 녹색 헤더(로고·알림·주소·검색, 1단 아래 당겨서 새로고침 슬롯) + 어드민 「홈 구성」 칸.
 * 비로그인: 읽기 가능, 개인 기능은 기존 `requireAuthAction` 로그인 안내, 배달은 S-07 로그인 안내.
 */
export function HomeScreen({ initialLayout }: { initialLayout: HomeLayoutConfig }) {
  const { t } = useI18n();
  const router = useRouter();
  const membership = useClientMembershipState("home-screen");
  const isGuest = membership.status === "guest";
  const isMember = membership.status === "member";
  const [layout, setLayout] = useState<HomeLayoutConfig>(initialLayout);
  const [refreshSeq, setRefreshSeq] = useState(0);
  const chatUnread = useOwnerHubBadgeTabUnreadCount("chat");
  const address = useRepresentativeAddressLine();

  const reloadLayout = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/home/layout", { cache: "no-store", credentials: "include" });
      const data = (await res.json()) as { ok?: boolean; config?: HomeLayoutConfig };
      if (!res.ok || !data.ok || !data.config) return false;
      setLayout(data.config);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(
    () =>
      addHomePullRefreshHandler(async () => {
        const ok = await reloadLayout();
        setRefreshSeq((n) => n + 1);
        return ok ? "success" : "error";
      }),
    [reloadLayout]
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

  const sections = useMemo(
    () => resolveVisibleHomeSections(layout, !isMember),
    [layout, isMember]
  );
  const tiles = layout.tiles.filter((x) => x.visible);
  const shortcuts = layout.shortcuts.filter((x) => x.visible);
  const panels = layout.panels.filter((x) => x.visible).map((x) => x.key) as HomePanelKey[];
  const label = (k: HomeMenuKey) => t(HOME_MENU_CATALOG[k].labelKey);

  return (
    <div className="min-h-full bg-[#ECF0ED] pb-6" data-home-screen>
      <HomePullRefreshHost />

      {/* 녹색 헤더 — 로고는 앱 안에서 여기 한 곳 */}
      <header className="bg-sam-primary text-white" data-home-header>
        <div className="flex min-h-[52px] items-center gap-2 px-4" style={{ paddingTop: "var(--safe-top, 0px)" }}>
          <span className="flex items-center gap-2" aria-label="dibaY">
            {/* eslint-disable-next-line @next/next/no-img-element -- 정적 브랜드 아이콘 28px */}
            <img src="/images/brand/dibay-app-icon-180.png" alt="" width={28} height={28} className="h-7 w-7 rounded-[8px]" />
            <span className="text-[22px] font-bold tracking-[-0.01em]">
              diba<span className="text-[#FFD95A]">Y</span>
            </span>
          </span>
          <span className="flex-1" />
          {isMember ? (
            <Tier1NotificationAnchor tone="onPrimary" />
          ) : isGuest ? (
            <button
              type="button"
              className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-extrabold text-sam-primary"
              onClick={() => router.push(buildLoginHref("/home"))}
            >
              {t("home_sign_in")}
            </button>
          ) : null}
        </div>
        {/* 당겨서 새로고침 슬롯 — 거래·커뮤니티와 같은 공통 슬롯(1단 아래 · 시그니처 그린) */}
        <DibayPtrSlot store={homePtrStore} tone="onBrand" className="bg-signature" dataAttribute="data-home-ptr-hint" />
        <div className="flex flex-col gap-2 px-4 pb-10 pt-1">
          <button
            type="button"
            className="flex min-w-0 items-center gap-1.5 text-left text-[13.5px]"
            onClick={() => {
              if (isMember) router.push("/mypage/addresses");
              else void requireAuthAction("address_save", () => router.push("/mypage/addresses"), { next: "/home" });
            }}
          >
            <MapPin className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">
              {isMember ? (
                address.status === "ready" && address.line ? (
                  address.line
                ) : address.status === "loading" ? (
                  t("common_loading")
                ) : (
                  t("home_address_unset")
                )
              ) : (
                <>
                  <b className="font-extrabold">{t("home_address_guest_all")}</b>
                  {t("home_address_guest_hint")}
                </>
              )}
            </span>
          </button>
          <button
            type="button"
            className="flex h-[50px] w-full items-center gap-2.5 rounded-ui-rect bg-white px-4 text-left text-[14px] text-sam-muted shadow-[0_4px_14px_rgba(0,0,0,0.18)]"
            onClick={() => openGlobalSearchFromHere(router, "/home")}
          >
            <Search className="h-5 w-5 text-sam-primary" aria-hidden />
            {t("home_search_placeholder")}
          </button>
        </div>
      </header>

      {sections.map((key, idx) => {
        const first = idx === 0;
        if (key === "tiles") {
          return (
            <div key={key} className={`relative mx-3 grid grid-cols-6 gap-2 ${first ? "-mt-8" : "mt-2"}`} data-home-tiles>
              {tiles.map((x, i) => {
                const big = i < 2;
                const tint = MENU_TINT[x.key];
                const badge = x.key === "chat" && isMember && chatUnread > 0 ? chatUnread : 0;
                return (
                  <button
                    key={x.key}
                    type="button"
                    onClick={() => openMenu(x.key)}
                    className={`relative flex flex-col items-start overflow-hidden rounded-ui-rect bg-white p-3 text-left shadow-[0_2px_10px_rgba(14,40,20,0.08)] ${
                      big ? "col-span-3 min-h-[118px]" : "col-span-2 min-h-[84px]"
                    }`}
                  >
                    <span className={`font-extrabold text-sam-fg ${big ? "text-[19px]" : "text-[16px]"}`}>{label(x.key)}</span>
                    {badge > 0 ? (
                      <span className="absolute right-2.5 top-2.5 grid h-[22px] min-w-[22px] place-items-center rounded-full bg-[#FF3B30] px-1.5 text-[12px] font-extrabold text-white shadow-[0_2px_6px_rgba(255,59,48,0.45)]">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    ) : null}
                    <span
                      className={`absolute grid place-items-center rounded-ui-rect ${big ? "bottom-2.5 right-2.5 h-[46px] w-[46px]" : "bottom-2 right-2 h-[34px] w-[34px]"}`}
                      style={{ background: tint.bg, color: tint.fg }}
                    >
                      <MenuGlyph k={x.key} className={big ? "h-[26px] w-[26px]" : "h-[19px] w-[19px]"} />
                    </span>
                  </button>
                );
              })}
            </div>
          );
        }
        if (key === "shortcuts" && shortcuts.length) {
          return (
            <div
              key={key}
              className={`mx-3 grid rounded-ui-rect bg-white py-2.5 ${first ? "-mt-8 relative" : "mt-2"}`}
              style={{ gridTemplateColumns: `repeat(${shortcuts.length}, minmax(0, 1fr))` }}
              data-home-shortcuts
            >
              {shortcuts.map((x) => (
                <button
                  key={x.key}
                  type="button"
                  onClick={() => openMenu(x.key)}
                  className="flex flex-col items-center gap-1 text-[11px] text-sam-muted"
                >
                  <MenuGlyph k={x.key} className="h-[18px] w-[18px]" />
                  <span>{label(x.key)}</span>
                </button>
              ))}
            </div>
          );
        }
        if (key === "guestCta") {
          return (
            <div key={key} className="mx-3 mt-3 flex flex-col gap-2.5 rounded-ui-rect border border-[#CFE3D4] bg-white p-3.5" data-home-guest-cta>
              <div>
                <b className="block text-[15px]">{t("home_guest_cta_title")}</b>
                <span className="text-[12px] text-sam-muted">
                  {t("home_guest_cta_body")}
                </span>
              </div>
              <div className="flex gap-2">
                <button type="button" className="flex-1 rounded-ui-rect bg-sam-primary py-2.5 text-[14px] font-bold text-white" onClick={() => router.push(buildLoginHref("/home"))}>
                  {t("home_sign_in")}
                </button>
                <button type="button" className="flex-1 rounded-ui-rect bg-sam-primary-soft py-2.5 text-[14px] font-bold text-sam-primary" onClick={() => router.push("/signup")}>
                  {t("home_sign_up")}
                </button>
              </div>
            </div>
          );
        }
        if (key === "topBanner") {
          /**
           * 상단 배너 — 배너 출처(광고 표면 SSOT · 2026-11-03 R3 결정)가 Owner 결정 전이라 칸을 접는다
           * (광고 SSOT 「빈 칸은 접는다」 COLLAPSE_SLOT). 결정 후 여기 연결.
           */
          return null;
        }
        if (key === "ongoing") {
          return isMember ? <HomeOngoingSection key={key} refreshSeq={refreshSeq} /> : null;
        }
        if (key === "panels") {
          return panels.length ? (
            <HomePanels key={key} panels={panels} isGuest={!isMember} refreshSeq={refreshSeq} labels={HOME_PANEL_LABEL_KEYS} />
          ) : null;
        }
        return null;
      })}
    </div>
  );
}
