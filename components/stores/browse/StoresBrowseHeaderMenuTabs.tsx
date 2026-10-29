"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { startTransition, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { STORES_BROWSE_SUB_ALL, storesBrowseAllPath, storesBrowsePath } from "@/components/stores/browse/stores-browse-paths";
import { useRegionOptional } from "@/contexts/RegionContext";
import { buildDeliveryMenuTabHref, listDeliveryMenuTabsForPrimary } from "@/lib/stores/delivery-menus/delivery-menu-overlay";
import { bumpBrowseListRefresh } from "@/lib/stores/browse-sub-chip-navigation";
import { noteBrowseMenuTabDirection } from "@/lib/stores/delivery-menus/browse-menu-tab-direction";
import { resolveTaxonomyIndustryLabel } from "@/lib/stores/store-taxonomy-canonical";
import {
  onBrowseSubTaxonomyCommit,
  onBrowseSubTaxonomyPointerDown,
} from "@/lib/stores/stores-browse-taxonomy-interaction";
import { useBrowseSubIndustries } from "@/lib/stores/use-browse-sub-industries";
import { useBrowseTaxonomySnapshot } from "@/lib/stores/use-browse-taxonomy-snapshot";
import { STORES_HOME_HEADER_BROWSE_MENU_TABS_ROW_CLASS } from "@/lib/design/stores-home-header-chrome";

type MenuTab = {
  key: string;
  label: string;
  href: string;
  /** 업종 2차 탭(메뉴 없음)일 때만 — 기존 목록 미리 받기·pending 경로 */
  subSlug: string | null;
};

/** 배민 실측: 밑줄 이동 약 150ms */
export const STORES_BROWSE_MENU_TAB_UNDERLINE_MS = 150;

/**
 * WP3 — 업종 페이지 2단 텍스트 탭 (배민 음식배달 업종 탭과 같은 구조).
 * - 「전체」 + 어드민 2단 메뉴. 메뉴가 없으면 업종 2차 그대로 (복구 스위치).
 * - 누르는 즉시 굵은 글자·밑줄 이동(150ms), 선택 탭을 가운데로 스크롤.
 * - URL 은 `router.replace` — 탭을 몇 번 바꿔도 뒤로가기 한 번이면 이전 화면.
 * - 탭 줄은 헤더(`[data-app-sticky-header]`) 안 → 헤더에서 시작한 당겨서 새로고침도 그대로 받는다.
 */
export function StoresBrowseHeaderMenuTabs({ primarySlug }: { primarySlug: string }) {
  const { t, language } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const primaryRegion = useRegionOptional()?.primaryRegion ?? null;
  const taxonomy = useBrowseTaxonomySnapshot();
  const subs = useBrowseSubIndustries(primarySlug);
  const menuTabs = useMemo(
    () => listDeliveryMenuTabsForPrimary(taxonomy?.menus, primarySlug),
    [taxonomy?.menus, primarySlug]
  );

  const tabs = useMemo<MenuTab[]>(() => {
    const all: MenuTab = {
      key: STORES_BROWSE_SUB_ALL,
      label: t("store_browse_menu_tab_all"),
      href: storesBrowseAllPath(primarySlug),
      subSlug: null,
    };
    if (menuTabs) {
      return [
        all,
        ...menuTabs.map((m) => ({
          key: `menu:${m.slug}`,
          label: language === "en" && m.nameEn ? m.nameEn : m.nameKo,
          href: buildDeliveryMenuTabHref(primarySlug, m.slug),
          subSlug: null,
        })),
      ];
    }
    return [
      all,
      ...subs.map((s) => ({
        key: `sub:${s.slug}`,
        label: resolveTaxonomyIndustryLabel(language, String(s.nameKo ?? "").trim(), s.name_en, s.slug),
        href: storesBrowsePath(primarySlug, s.slug),
        subSlug: s.slug,
      })),
    ];
  }, [language, menuTabs, primarySlug, subs, t]);

  const urlKey = useMemo(() => {
    const menu = searchParams?.get("menu")?.trim().toLowerCase() ?? "";
    if (menu && menuTabs?.some((m) => m.slug === menu)) return `menu:${menu}`;
    const sub = searchParams?.get("sub")?.trim().toLowerCase() ?? "";
    if (!menuTabs && sub && sub !== STORES_BROWSE_SUB_ALL && subs.some((s) => s.slug === sub)) return `sub:${sub}`;
    return STORES_BROWSE_SUB_ALL;
  }, [menuTabs, searchParams, subs]);

  /** 누른 즉시 선택 표시 — URL 반영 전까지 */
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  useLayoutEffect(() => {
    setPendingKey(null);
  }, [urlKey, pathname]);
  const activeKey = pendingKey ?? urlKey;

  const railRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const [underline, setUnderline] = useState<{ left: number; width: number } | null>(null);
  const firstLayoutRef = useRef(true);

  useLayoutEffect(() => {
    const el = tabRefs.current.get(activeKey);
    const rail = railRef.current;
    if (!el || !rail) {
      setUnderline(null);
      return;
    }
    setUnderline({ left: el.offsetLeft, width: el.offsetWidth });
    const target = el.offsetLeft - (rail.clientWidth - el.offsetWidth) / 2;
    rail.scrollTo({ left: Math.max(0, target), behavior: firstLayoutRef.current ? "auto" : "smooth" });
    firstLayoutRef.current = false;
  }, [activeKey, tabs]);

  if (tabs.length <= 1) return null;

  return (
    <div className={STORES_HOME_HEADER_BROWSE_MENU_TABS_ROW_CLASS}>
      <div
        ref={railRef}
        role="tablist"
        aria-label={t("store_sub_industry_aria")}
        className="stores-browse-menu-tabs relative flex min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const on = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              ref={(node) => {
                if (node) tabRefs.current.set(tab.key, node);
                else tabRefs.current.delete(tab.key);
              }}
              type="button"
              role="tab"
              aria-selected={on}
              data-stores-browse-menu-tab={tab.key}
              className={`relative flex h-11 shrink-0 items-center px-3 text-[15px] leading-none transition-colors duration-150 ${
                on ? "font-bold text-sam-fg" : "font-normal text-sam-muted"
              }`}
              onPointerDown={(e) => {
                if (tab.subSlug) {
                  onBrowseSubTaxonomyPointerDown({
                    ev: e,
                    primarySlug,
                    subSlug: tab.subSlug,
                    language,
                    primaryRegion,
                  });
                }
              }}
              onClick={() => {
                if (on) {
                  bumpBrowseListRefresh();
                  return;
                }
                setPendingKey(tab.key);
                const fromIdx = tabs.findIndex((x) => x.key === activeKey);
                const toIdx = tabs.findIndex((x) => x.key === tab.key);
                noteBrowseMenuTabDirection(toIdx >= fromIdx ? "forward" : "back");
                if (tab.subSlug) onBrowseSubTaxonomyCommit(primarySlug, tab.subSlug);
                else if (tab.key === STORES_BROWSE_SUB_ALL) onBrowseSubTaxonomyCommit(primarySlug, STORES_BROWSE_SUB_ALL);
                startTransition(() => router.replace(tab.href, { scroll: false }));
              }}
            >
              {tab.label}
            </button>
          );
        })}
        {underline ?
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 h-[2px] bg-sam-primary motion-reduce:transition-none"
            style={{
              width: underline.width,
              transform: `translateX(${underline.left}px)`,
              transition: `transform ${STORES_BROWSE_MENU_TAB_UNDERLINE_MS}ms ease-out, width ${STORES_BROWSE_MENU_TAB_UNDERLINE_MS}ms ease-out`,
            }}
          />
        : null}
      </div>
    </div>
  );
}
