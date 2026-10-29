"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliveryMediaImage } from "@/components/dibay/DeliveryMediaImage";
import {
  DELIVERY_MENU_ICON_BG,
  DeliveryMenuGlyph,
  DeliveryMenuGlyphOrInitial,
} from "@/components/stores/home/DeliveryMenuGlyph";
import { fetchStoresTaxonomyDeduped } from "@/lib/stores/store-delivery-api-client";
import {
  readStoresHomeTaxonomyFromClientCache,
  resolveStoresHomeTaxonomyFromApi,
  STORES_HOME_TAXONOMY_EMPTY,
  type StoresHomeTaxonomyState,
} from "@/lib/stores/stores-home-taxonomy-client";
import { addStoresHomePullRefreshHandler } from "@/lib/stores/stores-home-pull-refresh-store";
import { useMainHubPtrDomain } from "@/lib/layout/use-main-hub-ptr-domain";
import { sortTaxonomyCategories } from "@/lib/stores/store-taxonomy-canonical";
import {
  buildDeliveryMenuPageHref,
  listDeliveryMenuAllChildren,
  listDeliveryMenuHomeIcons,
  listDeliveryMenuRoots,
  resolveDeliveryMenuItemHref,
  resolveDeliveryMenuLabel,
} from "@/lib/stores/delivery-menus/delivery-menu-overlay";
import { deliveryMenuLinkHref, type DeliveryMenuPublic } from "@/lib/stores/delivery-menus/delivery-menu-types";
import { scheduleStoresBrowseListPrewarm } from "@/lib/stores/stores-browse-prewarm-coordinator";
import { useRegionOptional } from "@/contexts/RegionContext";

/** 앱 세션 동안 마지막 상단 탭 유지 (매장 갔다 돌아와도 같은 탭) */
let lastSelectedRootSlug: string | null = null;

/** 휴대폰 아이콘 판: 대표 카드 없음 5칸×2줄(아이콘 9 + 더보기), 있음 4칸×2줄(7 + 더보기) */
const GRID_SLOTS_PLAIN = 10;
const GRID_SLOTS_WITH_FEATURE = 8;

function MoreGlyph() {
  return <DeliveryMenuGlyph slug="__more" />;
}

/** 아이콘 바탕 — 올린 그림이면 연회색, 기본 그림이면 스타벅스 녹색 */
function tileBg(iconUrl: string | null): string {
  return iconUrl ? "#F3F5F7" : DELIVERY_MENU_ICON_BG;
}

function IconTile({
  slug,
  label,
  iconUrl,
  href,
  onPrewarm,
  more,
  prefetchFull,
}: {
  slug: string;
  label: string;
  iconUrl: string | null;
  href: string;
  onPrewarm?: () => void;
  more?: boolean;
  /** 메뉴 페이지 링크 — 화면에 보이면 전체 미리 받기 (동적 경로 기본은 loading 까지만 → 누른 뒤 흰 화면) */
  prefetchFull?: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={prefetchFull ? true : false}
      className="flex min-w-0 flex-col items-center gap-[5px] active:opacity-70"
      onPointerDown={onPrewarm}
      data-delivery-home-icon={more ? "more" : "item"}
    >
      <span
        className="relative flex h-[46px] w-[46px] items-center justify-center overflow-hidden rounded-[12px]"
        style={{ backgroundColor: more ? DELIVERY_MENU_ICON_BG : tileBg(iconUrl) }}
      >
        {more ?
          <MoreGlyph />
        : iconUrl ?
          <DeliveryMediaImage src={iconUrl} alt="" fill sizes="46px" className="object-contain p-[3px]" />
        : <DeliveryMenuGlyphOrInitial slug={slug} label={label} />}
      </span>
      <span className="w-full truncate text-center text-[13px] leading-tight text-[color:#362415]">{label}</span>
    </Link>
  );
}

/**
 * 배민 미러링 — 배달 홈 ③ 상단 탭 · ④ 아이콘 판(+대표 카드) · ⑤ 매장 바로가기 줄 (설계 v6 §3·§4).
 * - 상단 탭을 바꾸면 아이콘 판·바로가기 줄만 바뀐다 (화면 이동 없음).
 * - 아이콘: 매장 목록 메뉴 → 메뉴 페이지(그 탭 선택), 화면 연결 메뉴 → 그 화면 (상품권몰·선물함·쿠폰함 …).
 * - 「더보기」: 매장 목록 1단 → 메뉴 페이지 「홈」 탭, 화면 연결만 있는 1단 → 판을 펼쳐 전부 표시.
 * - 메뉴가 없으면(복구 스위치) 1차 업종 아이콘 판.
 */
export function DeliveryHomeMenuBoard() {
  const { t, language } = useI18n();
  const router = useRouter();
  const primaryRegion = useRegionOptional()?.primaryRegion ?? null;
  const isStoresHubRoot = useMainHubPtrDomain() === "stores";
  const [taxonomy, setTaxonomy] = useState<StoresHomeTaxonomyState | null>(null);

  useLayoutEffect(() => {
    const cached = readStoresHomeTaxonomyFromClientCache(language);
    if (cached && cached.categories.length > 0) setTaxonomy(cached);
    let cancelled = false;
    void (async () => {
      try {
        const { json } = await fetchStoresTaxonomyDeduped({ language, clientCallSource: "stores_home_mount" });
        if (cancelled) return;
        const next = resolveStoresHomeTaxonomyFromApi(json, cached ?? STORES_HOME_TAXONOMY_EMPTY);
        if (next.categories.length > 0) setTaxonomy(next);
      } catch {
        /* 표시 중 판 유지 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [language]);

  /** 당겨서 새로고침 — 같은 taxonomy 재조회 (StoresHomeQuickCategories 가 캐시를 비운 뒤 dedupe 공유) */
  useLayoutEffect(() => {
    if (!isStoresHubRoot) return;
    return addStoresHomePullRefreshHandler(async () => {
      try {
        const { status, json } = await fetchStoresTaxonomyDeduped({ language, clientCallSource: "stores_home_mount" });
        if (status < 200 || status >= 300) return "error";
        const next = resolveStoresHomeTaxonomyFromApi(json, STORES_HOME_TAXONOMY_EMPTY);
        if (next.categories.length > 0) setTaxonomy(next);
        return "success";
      } catch {
        return "error";
      }
    });
  }, [isStoresHubRoot, language]);

  const roots = useMemo(() => listDeliveryMenuRoots(taxonomy?.menus), [taxonomy?.menus]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(() => lastSelectedRootSlug);
  const selected = roots.find((r) => r.slug === selectedSlug) ?? roots[0] ?? null;
  const [expandedRootId, setExpandedRootId] = useState<string | null>(null);

  const selectRoot = useCallback((slug: string) => {
    lastSelectedRootSlug = slug;
    setSelectedSlug(slug);
    setExpandedRootId(null);
  }, []);

  const prewarmMenuPage = useCallback(
    (rootSlug: string, href: string) => {
      scheduleStoresBrowseListPrewarm({ language, primary: rootSlug, sub: "all", primaryRegion });
      router.prefetch(href);
    },
    [language, primaryRegion, router]
  );

  const tabsRef = useRef<HTMLDivElement>(null);

  if (!taxonomy) {
    return <div className="h-[196px] w-full bg-white" aria-busy="true" data-delivery-home-board-skeleton />;
  }

  /** 복구 스위치 — 메뉴 없음: 1차 업종 판 */
  if (roots.length === 0) {
    const cats = sortTaxonomyCategories(taxonomy.categories);
    return (
      <section className="w-full bg-white" data-delivery-home-board="taxonomy">
        <div className="mx-auto grid w-full max-w-[768px] grid-cols-5 gap-x-1 gap-y-3 px-[var(--delivery-page-x)] py-3">
          {cats.map((c) => {
            const href = `/stores/browse/${encodeURIComponent(String(c.slug))}?sub=all`;
            return (
              <IconTile
                key={c.id}
                slug={String(c.slug)}
                label={language !== "ko" && c.name_en ? c.name_en : c.name}
                iconUrl={c.image_url ?? null}
                href={href}
                onPrewarm={() => router.prefetch(href)}
              />
            );
          })}
        </div>
        <div className="h-2 w-full bg-[#F3F5F7]" />
      </section>
    );
  }

  const root = selected!;
  const feature = root.feature;
  const homeIcons = listDeliveryMenuHomeIcons(taxonomy.menus, root.id);
  const allChildren = listDeliveryMenuAllChildren(taxonomy.menus, root.id);
  const hasStoreMenus = allChildren.some((m) => !m.linkTarget);
  const expanded = expandedRootId === root.id;
  const slots = feature ? GRID_SLOTS_WITH_FEATURE : GRID_SLOTS_PLAIN;
  const iconsShown: DeliveryMenuPublic[] = expanded ? allChildren : homeIcons.slice(0, slots - 1);
  const needMore = !expanded && (hasStoreMenus || allChildren.length > iconsShown.length);
  const moreHref = hasStoreMenus ? buildDeliveryMenuPageHref(root.slug) : null;
  const cols = feature ? "grid-cols-4" : "grid-cols-5";

  return (
    <section className="w-full bg-white" data-delivery-home-board="menus" data-delivery-home-root={root.slug}>
      <div className="mx-auto w-full max-w-[768px]">
        {/* ③ 상단 탭 — 모두 굵게, 고른 탭 갈색 + 녹색 밑줄 3px, 나머지 #B1B3B5, 위 빨간 배지 */}
        <div
          ref={tabsRef}
          role="tablist"
          className="flex gap-[16px] overflow-x-auto border-b border-[color:#E4E6E8] px-[var(--delivery-page-x)] pt-[14px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {roots.map((r) => {
            const on = r.id === root.id;
            return (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={on}
                data-delivery-home-tab={r.slug}
                className={`relative shrink-0 pb-[8px] text-[17px] font-bold leading-none ${
                  on ? "text-[color:#362415]" : "text-[color:#B1B3B5]"
                }`}
                onClick={() => selectRoot(r.slug)}
              >
                {r.badgeText ?
                  <span className="absolute -top-[11px] left-0 whitespace-nowrap text-[10px] font-bold leading-none text-[color:#D45252]">
                    {r.badgeText}
                  </span>
                : null}
                {resolveDeliveryMenuLabel(r, language)}
                {on ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-[#0B421A]" /> : null}
              </button>
            );
          })}
        </div>

        {/* ④ 아이콘 판 (+ 왼쪽 대표 카드) */}
        <div
          className={`${feature ? "grid grid-cols-[96px_minmax(0,1fr)] gap-2" : ""} px-[var(--delivery-page-x)] py-[14px]`}
        >
          {feature ?
            <Link
              href={feature.linkTarget ? deliveryMenuLinkHref(feature.linkTarget) : buildDeliveryMenuPageHref(root.slug)}
              prefetch={false}
              className="relative flex h-[124px] flex-col justify-between overflow-hidden rounded-[10px] p-[10px] active:opacity-80"
              style={{ backgroundColor: feature.bg ?? "#EAC784" }}
              data-delivery-home-feature
            >
              <span className="relative z-[1] whitespace-pre-line text-[14px] font-extrabold leading-snug text-[color:#362415]">
                {feature.title}
              </span>
              {feature.imageUrl ?
                <span className="relative ml-auto h-[44px] w-[44px]">
                  <DeliveryMediaImage src={feature.imageUrl} alt="" fill sizes="44px" className="object-contain" />
                </span>
              : null}
            </Link>
          : null}
          <div className={`grid ${cols} gap-x-1 gap-y-[14px]`}>
            {iconsShown.map((m) => {
              const href = resolveDeliveryMenuItemHref(root.slug, m);
              return (
                <IconTile
                  key={m.id}
                  slug={m.slug}
                  label={resolveDeliveryMenuLabel(m, language)}
                  iconUrl={m.iconUrl}
                  href={href}
                  prefetchFull={!m.linkTarget}
                  onPrewarm={m.linkTarget ? () => router.prefetch(href) : () => prewarmMenuPage(root.slug, href)}
                />
              );
            })}
            {needMore ?
              moreHref ?
                <IconTile
                  slug="__more"
                  label={t("store_home_menu_more")}
                  iconUrl={null}
                  href={moreHref}
                  more
                  prefetchFull
                  onPrewarm={() => prewarmMenuPage(root.slug, moreHref)}
                />
              : <button
                  type="button"
                  className="flex min-w-0 flex-col items-center gap-[5px] active:opacity-70"
                  data-delivery-home-icon="more"
                  onClick={() => setExpandedRootId(root.id)}
                >
                  <span
                    className="flex h-[46px] w-[46px] items-center justify-center rounded-[12px]"
                    style={{ backgroundColor: DELIVERY_MENU_ICON_BG }}
                  >
                    <MoreGlyph />
                  </span>
                  <span className="w-full truncate text-center text-[13px] leading-tight text-[color:#362415]">
                    {t("store_home_menu_more")}
                  </span>
                </button>
            : null}
          </div>
        </div>

        {/* ⑤ 매장 바로가기 줄 */}
        {root.shortcuts.length > 0 ?
          <div
            className="flex gap-[10px] overflow-x-auto border-t border-[color:#E4E6E8] px-[var(--delivery-page-x)] py-[12px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            data-delivery-home-shortcuts
          >
            {root.shortcuts.map((s) => (
              <Link
                key={s.storeId}
                href={`/stores/${encodeURIComponent(s.slug)}`}
                prefetch={false}
                className="flex w-[60px] shrink-0 flex-col items-center gap-1 active:opacity-70"
                onPointerDown={() => router.prefetch(`/stores/${encodeURIComponent(s.slug)}`)}
              >
                <span className="relative h-[52px] w-[52px] overflow-hidden rounded-[12px] border border-[color:#E4E6E8] bg-[#F3F5F7]">
                  {s.imageUrl ?
                    <DeliveryMediaImage src={s.imageUrl} alt="" fill sizes="52px" className="object-cover" />
                  : <span className="flex h-full w-full items-center justify-center text-[15px] font-bold text-[color:#0B421A]">
                      {s.name.slice(0, 1)}
                    </span>}
                </span>
                <span className="w-full truncate text-center text-[11px] leading-tight text-[color:#362415]">{s.name}</span>
                {s.caption ?
                  <span className="-mt-[2px] w-full truncate text-center text-[10px] font-bold leading-tight text-[color:#D45252]">
                    {s.caption}
                  </span>
                : null}
              </Link>
            ))}
          </div>
        : null}
      </div>
      <div className="h-2 w-full bg-[#F3F5F7]" />
    </section>
  );
}
