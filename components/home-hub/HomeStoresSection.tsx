"use client";

import { useEffect, useState } from "react";
import { buildMypageAddressesHref } from "@/lib/addresses/mypage-addresses-return-to";
import { useRouter } from "next/navigation";
import { useHubDataRevisitGate } from "@/lib/http/hub-data-freshness";
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
import { HomeLoadError } from "@/components/home-hub/HomeLoadError";
import { storeDisplayStatusLabelKey } from "@/lib/stores/store-display-status-label";

type Shown = { store: StoreHomeFeedItem; menus: HomeStoreMenuItem[]; adLabel: boolean };
type LoadState =
  | { kind: "loading" }
  | { kind: "gate"; gate: Exclude<DeliveryViewerGate, "ok"> }
  | { kind: "empty" }
  | { kind: "error" }
  | { kind: "ready"; shown: Shown[] };

function peso(n: number): string {
  return `₱${n.toLocaleString("en-US")}`;
}

/**
 * 후보 매장 — 배달 탭 홈 피드(`/api/stores/home-feed`)와 같은 판정을 그대로 쓴다. 홈만 따로 판정하지 않는다.
 * 조건: 배달 켬 · 배달 지역 안 (영업시간 밖·샘플도 포함 — Owner 2026-11-09). `requireOpen` 은 영업 중만 볼 때.
 * 순서: 직접 고르기 = 어드민이 고른 순서 (감사 E10) · 자동 = 영업 중 먼저, 그다음 배달 탭 순서
 * (배달 가능 → 같은 동네 → 가까운 거리 → 주문 많은 → 평점), 「새로 연 순」이면 처음 공개일 최신순.
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
    const byId = new Map(eligible.map((s) => [s.id, s] as const));
    return cfg.picks.map((p) => byId.get(p.storeId)).filter((s): s is StoreHomeFeedItem => Boolean(s));
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
  return [...pool.filter((s) => s.status === "open"), ...pool.filter((s) => s.status !== "open")];
}

/**
 * 「우리 동네 배달 매장」 — 매장별 메뉴 사진 가로 넘김. 배달 지역 안 매장은 영업시간 밖이어도 보인다(상태 표시).
 * 새로고침·재접속 때 지난번에 안 나온 매장·메뉴 먼저.
 * 비로그인 = 로그인 안내(S-07) · 저장 주소 없음 = 주소 등록 안내 · 배달 지역 안 매장 0 = 「배달되는 매장 없음」.
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
  const [retryKey, setRetryKey] = useState(0);
  const mode = rot?.mode;
  const seq = rot?.seq;
  const cfgKey = JSON.stringify(config);

  /** D1 §4 — 허브 화면 보관대에서 다시 보일 때 같은 조건·60초 안이면 다시 받지 않음(보이던 매장·메뉴 유지) */
  const revisitGate = useHubDataRevisitGate();

  useEffect(() => {
    if (!isMember) {
      setState({ kind: "gate", gate: "login_required" });
      revisitGate.reset();
      return;
    }
    if (!rot) return;
    const gateKey = `${mode}|${seq}|${cfgKey}|${language}|${retryKey}`;
    if (revisitGate.isFresh(gateKey)) return;
    let alive = true;
    void (async () => {
      if (refreshSeq > 0) forgetStoresHomeFeedFetchSingleFlight("", language);
      const feed = await fetchStoresHomeFeedDeduped("", { language, clientCallSource: "stores_home_mount" }).catch(
        () => null
      );
      if (!alive) return;
      // 실패는 「매장 없음」이 아니라 오류로 보이고, 교체 기록에 넣지 않는다 (감사 E8)
      if (!feed || feed.status !== 200) {
        setState({ kind: "error" });
        return;
      }
      const json = (feed.json ?? {}) as { stores?: StoreHomeFeedItem[]; meta?: { viewer_gate?: DeliveryViewerGate } };
      const gate = json.meta?.viewer_gate;
      if (gate === "login_required" || gate === "address_required" || gate === "not_service_area") {
        setState({ kind: "gate", gate });
        revisitGate.markLoaded(gateKey);
        return;
      }
      // Owner 2026-11-09 「샘플이라도 배달 지역 안이면 홈에서도 보여야」 — 영업시간 밖 매장도 후보(상태 표시)
      const pool = filterHomeStorePool(json.stores ?? [], config, { requireOpen: false });
      const take = Math.min(config.showCount, HOME_STORE_SHOW_MAX);
      const idOf = (s: StoreHomeFeedItem) => s.id;
      // 메뉴 없는 매장을 빼고도 채우도록 3곳 더 후보로
      const ordered =
        rot.mode === "session"
          ? keepSessionPick(pool, idOf, rot.session.stores, take + 3)
          : rotateUnseenFirst(pool, idOf, rot.history.log.stores, take + 3);
      if (ordered.length === 0) {
        setState({ kind: "empty" });
        rot.commit({ stores: [] });
        revisitGate.markLoaded(gateKey);
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
      if (!body?.menus) {
        setState({ kind: "error" });
        return;
      }
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
      setState(shown.length > 0 ? { kind: "ready", shown } : { kind: "empty" });
      revisitGate.markLoaded(gateKey);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 교체는 mode·seq(새로고침)·구성 기준
  }, [isMember, mode, seq, cfgKey, language, retryKey]);

  if (state.kind === "gate") {
    const login = state.gate === "login_required";
    return (
      <section className="mt-3 bg-white pb-5 pt-[18px]" data-home-stores data-home-stores-gate={state.gate}>
        <HomeSectionHead title={title} />
        <div className="mx-4 rounded-ui-rect border border-[#e3e7e4] px-4 py-4 text-center">
          <b className="block text-[15px] font-semibold text-[#141a16]">
            {login
              ? t("home_stores_login_title")
              : state.gate === "not_service_area"
                ? t("store_delivery_not_service_area_title")
                : t("home_stores_address_title")}
          </b>
          {state.gate === "not_service_area" ? (
            <span className="mt-1 block text-[13px] text-[#767676]">{t("store_delivery_not_service_area_body")}</span>
          ) : null}
          {login ? <span className="mt-1 block text-[13px] text-[#767676]">{t("home_stores_login_body")}</span> : null}
          <button
            type="button"
            onClick={() => router.push(login ? buildLoginHref("/home") : buildMypageAddressesHref(null, { purpose: "delivery" }))}
            className="mt-3 inline-flex h-9 items-center rounded-full bg-sam-primary px-5 text-[14px] font-semibold text-white active:brightness-90"
          >
            {login
              ? t("home_sign_in")
              : state.gate === "not_service_area"
                ? t("store_delivery_not_service_area_cta")
                : t("home_stores_address_cta")}
          </button>
        </div>
      </section>
    );
  }
  if (state.kind === "error") {
    return (
      <section className="mt-3 bg-white pb-5 pt-[18px]" data-home-stores data-home-stores-error>
        <HomeSectionHead title={title} />
        <HomeLoadError onRetry={() => setRetryKey((n) => n + 1)} />
      </section>
    );
  }
  if (state.kind === "empty") {
    return (
      <section className="mt-3 bg-white pb-5 pt-[18px]" data-home-stores data-home-stores-empty>
        <HomeSectionHead title={title} />
        <p className="px-[18px] text-[13.5px] text-[#767676]">{t("home_stores_empty")}</p>
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
      <HomeSectionHead title={title} />
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
                  {[store.primaryNameKo, store.regionLabel].filter(Boolean).join(" · ")}
                  {" · "}
                  <span className={store.status === "open" ? "text-sam-primary" : "text-[#999]"}>
                    {t(storeDisplayStatusLabelKey(store.status))}
                  </span>
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
