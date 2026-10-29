"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { STORES_BROWSE_SUB_ALL, storesBrowseAllPath, storesBrowsePath } from "@/components/stores/browse/stores-browse-paths";
import { useRegionOptional } from "@/contexts/RegionContext";
import {
  buildDeliveryMenuPageHref,
  findDeliveryMenuRoot,
  listDeliveryMenuPageTabs,
  resolveDeliveryMenuLabel,
} from "@/lib/stores/delivery-menus/delivery-menu-overlay";
import { bumpBrowseListRefresh } from "@/lib/stores/browse-sub-chip-navigation";
import { noteBrowseMenuTabDirection } from "@/lib/stores/delivery-menus/browse-menu-tab-direction";
import { resolveTaxonomyIndustryLabel } from "@/lib/stores/store-taxonomy-canonical";
import {
  onBrowseSubTaxonomyCommit,
  onBrowseSubTaxonomyPointerDown,
} from "@/lib/stores/stores-browse-taxonomy-interaction";
import { useBrowseSubIndustries } from "@/lib/stores/use-browse-sub-industries";
import { useBrowseTaxonomySnapshot } from "@/lib/stores/use-browse-taxonomy-snapshot";
import { DeliveryMediaImage } from "@/components/dibay/DeliveryMediaImage";
import {
  MIRROR_PAGE_TAB_BUTTON_BASE_CLASS,
  MIRROR_PAGE_TAB_OFF_CLASS,
  MIRROR_PAGE_TAB_ON_CLASS,
  MIRROR_PAGE_TABS_MORE_BUTTON_CLASS,
  MIRROR_PAGE_TABS_ROW_CLASS,
} from "@/lib/design/delivery-baemin-mirror";

type MenuTab = {
  key: string;
  label: string;
  href: string;
  iconUrl: string | null;
  /** 업종 2차 탭(메뉴 페이지 아님)일 때만 — 기존 목록 미리 받기·pending 경로 */
  subSlug: string | null;
};

/** 배민 실측: 밑줄 이동 약 150ms */
export const STORES_BROWSE_MENU_TAB_UNDERLINE_MS = 150;

const HOME_TAB_KEY = "home";

function ChevronIcon({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 12 12" className={`h-3 w-3 transition-transform duration-150 ${up ? "rotate-180" : ""}`} fill="none" aria-hidden>
      <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * 배민 미러링 3단 — 메뉴 페이지 텍스트 탭 「홈 · 한식 · 중식 …」 + 오른쪽 ⌄ 「메뉴 전체보기」.
 * - 메뉴 1단 페이지(`/stores/browse/{food|pickup|shop…}`): 「홈」 + 어드민 2단 메뉴 (`?menu=`).
 * - 업종 페이지(메뉴 없음 · 이전 경로): 「전체」 + 업종 2차 (복구 스위치).
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
  const menuRoot = useMemo(() => findDeliveryMenuRoot(taxonomy?.menus, primarySlug), [taxonomy?.menus, primarySlug]);
  const menuTabs = useMemo(
    () => (menuRoot ? listDeliveryMenuPageTabs(taxonomy?.menus, primarySlug) : null),
    [menuRoot, taxonomy?.menus, primarySlug]
  );

  const tabs = useMemo<MenuTab[]>(() => {
    if (menuRoot && menuTabs) {
      return [
        {
          key: HOME_TAB_KEY,
          label: t("store_browse_menu_tab_home"),
          href: buildDeliveryMenuPageHref(primarySlug),
          iconUrl: null,
          subSlug: null,
        },
        ...menuTabs.map((m) => ({
          key: `menu:${m.slug}`,
          label: resolveDeliveryMenuLabel(m, language),
          href: buildDeliveryMenuPageHref(primarySlug, m.slug),
          iconUrl: m.iconUrl,
          subSlug: null,
        })),
      ];
    }
    return [
      {
        key: STORES_BROWSE_SUB_ALL,
        label: t("store_browse_menu_tab_all"),
        href: storesBrowseAllPath(primarySlug),
        iconUrl: null,
        subSlug: null,
      },
      ...subs.map((s) => ({
        key: `sub:${s.slug}`,
        label: resolveTaxonomyIndustryLabel(language, String(s.nameKo ?? "").trim(), s.name_en, s.slug),
        href: storesBrowsePath(primarySlug, s.slug),
        iconUrl: null,
        subSlug: s.slug,
      })),
    ];
  }, [language, menuRoot, menuTabs, primarySlug, subs, t]);

  const urlKey = useMemo(() => {
    const menu = searchParams?.get("menu")?.trim().toLowerCase() ?? "";
    if (menuRoot) {
      if (menu && menuTabs?.some((m) => m.slug === menu)) return `menu:${menu}`;
      return HOME_TAB_KEY;
    }
    const sub = searchParams?.get("sub")?.trim().toLowerCase() ?? "";
    if (sub && sub !== STORES_BROWSE_SUB_ALL && subs.some((s) => s.slug === sub)) return `sub:${sub}`;
    return STORES_BROWSE_SUB_ALL;
  }, [menuRoot, menuTabs, searchParams, subs]);

  /** 누른 즉시 선택 표시 — URL 반영 전까지 */
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  useLayoutEffect(() => {
    setPendingKey(null);
  }, [urlKey, pathname]);
  const activeKey = pendingKey ?? urlKey;

  const [allOpen, setAllOpen] = useState(false);
  useEffect(() => {
    setAllOpen(false);
  }, [pathname, urlKey]);

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
    setUnderline({ left: el.offsetLeft + 10, width: Math.max(0, el.offsetWidth - 20) });
    const target = el.offsetLeft - (rail.clientWidth - el.offsetWidth) / 2;
    rail.scrollTo({ left: Math.max(0, target), behavior: firstLayoutRef.current ? "auto" : "smooth" });
    firstLayoutRef.current = false;
  }, [activeKey, tabs]);

  if (tabs.length <= 1) return null;

  const go = (tab: MenuTab) => {
    if (tab.key === activeKey) {
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
  };

  return (
    <div className={MIRROR_PAGE_TABS_ROW_CLASS} data-baemin-mirror-page-tabs="1">
      <div className="relative mx-auto w-full min-w-0 max-w-[768px]">
        <div
          ref={railRef}
          role="tablist"
          aria-label={t("store_sub_industry_aria")}
          className="stores-browse-menu-tabs relative flex min-w-0 overflow-x-auto overscroll-x-contain pl-[calc(var(--delivery-page-x)-10px)] pr-[44px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                className={`${MIRROR_PAGE_TAB_BUTTON_BASE_CLASS} ${on ? MIRROR_PAGE_TAB_ON_CLASS : MIRROR_PAGE_TAB_OFF_CLASS}`}
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
                onClick={() => go(tab)}
              >
                {tab.label}
              </button>
            );
          })}
          {underline ?
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-0 left-0 h-[2px] bg-[#0B421A] motion-reduce:transition-none"
              style={{
                width: underline.width,
                transform: `translateX(${underline.left}px)`,
                transition: `transform ${STORES_BROWSE_MENU_TAB_UNDERLINE_MS}ms ease-out, width ${STORES_BROWSE_MENU_TAB_UNDERLINE_MS}ms ease-out`,
              }}
            />
          : null}
        </div>
        {menuRoot ?
          <button
            type="button"
            className={MIRROR_PAGE_TABS_MORE_BUTTON_CLASS}
            aria-expanded={allOpen}
            aria-label={t("store_browse_menu_all_view")}
            data-baemin-mirror-menu-all="1"
            onClick={() => setAllOpen((v) => !v)}
          >
            <ChevronIcon up={allOpen} />
          </button>
        : null}
      </div>
      {menuRoot && allOpen ?
        <>
          <button
            type="button"
            aria-label={t("common_close")}
            className="fixed inset-x-0 bottom-0 top-0 z-[-1] cursor-default bg-black/45"
            onClick={() => setAllOpen(false)}
          />
          <div className="absolute inset-x-0 top-0 z-[3] bg-white shadow-[0_8px_16px_rgba(0,0,0,0.12)]" data-baemin-mirror-menu-all-panel="1">
            <div className="mx-auto flex h-[40px] w-full max-w-[768px] items-center justify-between px-[var(--delivery-page-x)]">
              <span className="text-[15px] font-bold text-[color:#362415]">{t("store_browse_menu_all_view")}</span>
              <button
                type="button"
                className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-[color:#E4E6E8] text-[color:#362415]"
                aria-label={t("common_close")}
                onClick={() => setAllOpen(false)}
              >
                <ChevronIcon up />
              </button>
            </div>
            <div className="mx-auto grid w-full max-w-[768px] grid-cols-5 gap-x-1 gap-y-3 px-[var(--delivery-page-x)] pb-4 pt-1">
              {tabs.map((tab) => {
                const on = tab.key === activeKey;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    className="flex min-w-0 flex-col items-center gap-1"
                    onClick={() => {
                      setAllOpen(false);
                      go(tab);
                    }}
                  >
                    <span
                      className={`relative flex h-[40px] w-[40px] items-center justify-center overflow-hidden rounded-[10px] ${
                        on ? "bg-[#F3F5F7] ring-1 ring-[#0B421A]" : "bg-[#F3F5F7]"
                      }`}
                    >
                      {tab.iconUrl ?
                        <DeliveryMediaImage src={tab.iconUrl} alt="" fill sizes="40px" className="object-contain p-1" />
                      : <span className="text-[13px] font-bold text-[color:#362415]">{tab.label.slice(0, 1)}</span>}
                    </span>
                    <span className={`w-full truncate text-center text-[12px] ${on ? "font-bold text-[color:#362415]" : "text-[color:#362415]"}`}>
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      : null}
    </div>
  );
}
