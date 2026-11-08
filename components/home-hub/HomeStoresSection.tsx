"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildLoginHref } from "@/lib/auth/client-access-flow";
import { fetchStoresHomeFeedDeduped, forgetStoresHomeFeedFetchSingleFlight } from "@/lib/stores/store-delivery-api-client";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { DeliveryViewerGate } from "@/lib/stores/delivery-viewer-gate";
import { HOME_STORE_SHOW_MAX, type HomeStoresConfig } from "@/lib/home/home-layout-contract";
import type { HomeStoreMenuItem } from "@/lib/home/home-catalog-types";
import { keepSessionPick, rotateUnseenFirst } from "@/lib/home/home-rotation";
import type { HomeRotationCtl } from "@/components/home-hub/use-home-rotation";
import { HomeSectionHead } from "@/components/home-hub/HomeSectionHead";

type Shown = { store: StoreHomeFeedItem; menus: HomeStoreMenuItem[]; adLabel: boolean };
type LoadState =
  | { kind: "loading" }
  | { kind: "gate"; gate: Exclude<DeliveryViewerGate, "ok"> }
  /** none = 이 주소로 배달되는 후보 매장 없음 · closed = 후보는 있으나 지금 모두 영업시간 밖 */
  | { kind: "empty"; reason: "none" | "closed" }
  | { kind: "ready"; shown: Shown[] };

function peso(n: number): string {
  return `₱${n.toLocaleString("en-US")}`;
}

/**
 * 후보 매장 — 배달 탭 홈 피드(`/api/stores/home-feed`)와 같은 판정·순서를 그대로 쓴다
 * (배달 가능 → 같은 동네 → 가까운 거리 → 주문 많은 → 평점). 홈만 따로 판정하지 않는다.
 * 지금 주문할 수 있는 곳만: 영업 중 · 배달 켬 · 배달 지역 안. 어드민 조건(직접 고르기/자동)으로 거른다.
 */
export function filterHomeStorePool(
  stores: readonly StoreHomeFeedItem[],
  cfg: HomeStoresConfig,
  opts: { requireOpen?: boolean } = {}
): StoreHomeFeedItem[] {
  const requireOpen = opts.requireOpen !== false;
  const eligible = stores.filter(
    (s) => (!requireOpen || s.status === "open") && s.deliveryAvailable && s.distanceOutOfRange !== true
  );
  if (cfg.mode === "manual") {
    const picked = new Set(cfg.picks.map((p) => p.storeId));
    return eligible.filter((s) => picked.has(s.id));
  }
  let pool = eligible;
  if (cfg.autoCategorySlugs.length > 0) {
    const cats = new Set(cfg.autoCategorySlugs);
    pool = pool.filter((s) => s.primarySlug != null && cats.has(s.primarySlug));
  }
  if (cfg.autoFilter === "recent_orders") pool = pool.filter((s) => (s.completedOrderCount30d ?? 0) > 0);
  if (cfg.autoFilter === "newest") {
    pool = [...pool].sort((a, b) => {
      const ta = a.firstListedAt ? Date.parse(a.firstListedAt) : 0;
      const tb = b.firstListedAt ? Date.parse(b.firstListedAt) : 0;
      return tb - ta;
    });
  }
  return pool;
}

/**
 * 「지금 주문할 수 있는 매장」 — 매장별 메뉴 사진 가로 넘김. 새로고침·재접속 때 지난번에 안 나온 매장·메뉴 먼저.
 * 비로그인 = 로그인 안내(S-07) · 저장 주소 없음 = 주소 등록 안내 · 배달 되는 매장 0 = 「배달되는 매장 없음」 ·
 * 배달 되는 매장은 있는데 모두 영업시간 밖 = 「지금 영업 중인 매장 없음」 (운영 11-09 04:15 PHT 실기: 48곳 전부 closed).
 * 메뉴·＋ 누르면 그 메뉴 화면(`/stores/매장/p/메뉴`)에서 담기 — 담기 시트는 배달 화면 안에서만 열리는 기존 계약 그대로.
 */
export function HomeStoresSection({
  config,
  title,
  isMember,
  rot,
  refreshSeq,
}: {
  config: HomeStoresConfig;
  title: string;
  isMember: boolean;
  rot: HomeRotationCtl | null;
  refreshSeq: number;
}) {
  const { t, language } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const mode = rot?.mode;
  const seq = rot?.seq;
  const cfgKey = JSON.stringify(config);

  useEffect(() => {
    if (!isMember) {
      setState({ kind: "gate", gate: "login_required" });
      return;
    }
    if (!rot) return;
    let alive = true;
    void (async () => {
      if (refreshSeq > 0) forgetStoresHomeFeedFetchSingleFlight("", language);
      const feed = await fetchStoresHomeFeedDeduped("", { language, clientCallSource: "stores_home_mount" }).catch(
        () => null
      );
      const json = (feed?.json ?? {}) as { stores?: StoreHomeFeedItem[]; meta?: { viewer_gate?: DeliveryViewerGate } };
      const gate = json.meta?.viewer_gate;
      if (!alive) return;
      if (gate === "login_required" || gate === "address_required") {
        setState({ kind: "gate", gate });
        return;
      }
      const feedStores = json.stores ?? [];
      const pool = filterHomeStorePool(feedStores, config);
      const emptyReason: "none" | "closed" =
        filterHomeStorePool(feedStores, config, { requireOpen: false }).length > 0 ? "closed" : "none";
      const take = Math.min(config.showCount, HOME_STORE_SHOW_MAX);
      const idOf = (s: StoreHomeFeedItem) => s.id;
      // 메뉴 없는 매장을 빼고도 채우도록 3곳 더 후보로
      const ordered =
        rot.mode === "session"
          ? keepSessionPick(pool, idOf, rot.session.stores, take + 3)
          : rotateUnseenFirst(pool, idOf, rot.history.log.stores, take + 3);
      if (ordered.length === 0) {
        setState({ kind: "empty", reason: emptyReason });
        rot.commit({ stores: [] });
        return;
      }
      const res = await fetch(`/api/home/store-menus?ids=${ordered.map(idOf).join(",")}`, {
        credentials: "include",
        cache: "no-store",
      }).catch(() => null);
      const body = (res && res.ok ? await res.json().catch(() => null) : null) as {
        menus?: Record<string, HomeStoreMenuItem[]>;
      } | null;
      if (!alive) return;
      const menusById = body?.menus ?? {};
      const shown: Shown[] = [];
      const menuPick: Record<string, string[]> = {};
      for (const store of ordered) {
        const menuPool = menusById[store.id] ?? [];
        if (menuPool.length === 0) continue;
        const mIdOf = (m: HomeStoreMenuItem) => m.id;
        const menus =
          rot.mode === "session"
            ? keepSessionPick(menuPool, mIdOf, rot.session.menus[store.id] ?? [], config.menusPerStore)
            : rotateUnseenFirst(menuPool, mIdOf, rot.history.log.menus[store.id] ?? [], config.menusPerStore);
        menuPick[store.id] = menus.map(mIdOf);
        const pick = config.picks.find((p) => p.storeId === store.id);
        shown.push({ store, menus, adLabel: config.mode === "manual" && pick?.adLabel === true });
        if (shown.length >= take) break;
      }
      rot.commit({ stores: shown.map((s) => s.store.id), menus: menuPick });
      setState(shown.length > 0 ? { kind: "ready", shown } : { kind: "empty", reason: emptyReason });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 교체는 mode·seq(새로고침)·구성 기준
  }, [isMember, mode, seq, cfgKey, language]);

  const more = () => router.push("/stores");

  if (state.kind === "gate") {
    const login = state.gate === "login_required";
    return (
      <section className="mt-3 bg-white pb-5 pt-[18px]" data-home-stores data-home-stores-gate={state.gate}>
        <HomeSectionHead title={title} />
        <div className="mx-4 rounded-ui-rect border border-[#e3e7e4] px-4 py-4 text-center">
          <b className="block text-[15px] font-semibold text-[#141a16]">
            {login ? t("home_stores_login_title") : t("home_stores_address_title")}
          </b>
          {login ? <span className="mt-1 block text-[13px] text-[#767676]">{t("home_stores_login_body")}</span> : null}
          <button
            type="button"
            onClick={() => router.push(login ? buildLoginHref("/home") : "/mypage/addresses")}
            className="mt-3 inline-flex h-9 items-center rounded-full bg-sam-primary px-5 text-[14px] font-semibold text-white active:brightness-90"
          >
            {login ? t("home_sign_in") : t("home_stores_address_cta")}
          </button>
        </div>
      </section>
    );
  }
  if (state.kind === "empty") {
    return (
      <section className="mt-3 bg-white pb-5 pt-[18px]" data-home-stores data-home-stores-empty>
        <HomeSectionHead title={title} moreLabel={t("home_menu_stores")} onMore={more} />
        <p className="px-[18px] text-[13.5px] text-[#767676]">
          {state.reason === "closed" ? t("home_stores_closed_now") : t("home_stores_empty")}
        </p>
      </section>
    );
  }
  if (state.kind === "loading") {
    return (
      <section className="mt-3 bg-white pb-5 pt-[18px]" data-home-stores aria-busy="true">
        <HomeSectionHead title={title} />
        <div className="flex gap-2.5 overflow-hidden px-4">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-[112px] w-[112px] shrink-0 animate-pulse rounded-ui-rect bg-[#eef1ee]" />
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="mt-3 bg-white pb-5 pt-[18px]" data-home-stores>
      <HomeSectionHead title={title} moreLabel={t("home_menu_stores")} onMore={more} />
      {state.shown.map(({ store, menus, adLabel }, i) => {
        const storeHref = `/stores/${encodeURIComponent(store.slug)}`;
        return (
          <div key={store.id} className={i > 0 ? "mt-4 border-t border-[#eef1ee] pt-4" : ""} data-home-store={store.id}>
            <button
              type="button"
              onClick={() => router.push(storeHref)}
              className="flex w-full items-center gap-2.5 px-4 text-left active:opacity-70"
            >
              {store.profileImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- 매장 프로필 사진
                <img
                  src={store.profileImageUrl}
                  alt=""
                  className="shrink-0 rounded-full object-cover shadow-[0_0_0_1px_#e3e7e4]"
                  style={{ width: 40, height: 40 }}
                />
              ) : (
                <span className="h-10 w-10 shrink-0 rounded-full bg-[#eef1ee]" />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-semibold text-[#141a16]">{store.nameKo}</span>
                  {store.isSampleStore ? (
                    <span className="shrink-0 rounded-[4px] bg-[#F2F4F2] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#5D6A60]">
                      {t("home_store_sample")}
                    </span>
                  ) : null}
                  {adLabel ? <span className="shrink-0 text-[11px] text-[#999]">{t("home_ad")}</span> : null}
                </span>
                <span className="block truncate text-[12.5px] text-[#767676]">
                  {[store.primaryNameKo, store.regionLabel, t("home_store_open")].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 text-[13px] font-semibold text-sam-primary">{t("home_order_now")} ›</span>
            </button>
            <div className="mt-2.5 flex gap-2.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {menus.map((m) => {
                const href = `${storeHref}/p/${encodeURIComponent(m.id)}`;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => router.push(href)}
                    className="w-[112px] shrink-0 text-left active:opacity-80"
                    aria-label={t("home_store_menu_open_aria", { name: m.title })}
                  >
                    <span className="relative block">
                      {m.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- 매장 메뉴 사진
                        <img
                          src={m.imageUrl}
                          alt=""
                          className="rounded-ui-rect object-cover"
                          /* 앱 전역 img height:auto 보다 앞서도록 크기는 인라인 (정사각 고정) */
                          style={{ width: 112, height: 112 }}
                        />
                      ) : (
                        <span className="block h-[112px] w-[112px] rounded-ui-rect bg-[#eef1ee]" />
                      )}
                      <span className="absolute bottom-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full bg-white text-sam-primary shadow-[0_2px_6px_rgba(0,0,0,0.18)]">
                        <Plus className="h-4 w-4" strokeWidth={2.6} aria-hidden />
                      </span>
                    </span>
                    <span className="mt-1.5 block truncate text-[14px] text-[#222]">{m.title}</span>
                    <span className="block text-[15px] font-bold text-[#141a16]">
                      {peso(m.discountPrice ?? m.price)}
                      {m.discountPrice != null ? (
                        <span className="ml-1 text-[12px] font-normal text-[#999] line-through">{peso(m.price)}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
