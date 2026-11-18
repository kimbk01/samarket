"use client";

import { useEffect, useState } from "react";
import { untilLaunchPushDestinationSettled } from "@/lib/startup/launch-push-destination-pending";
import { buildMypageAddressesHref } from "@/lib/addresses/mypage-addresses-return-to";
import { useRouter } from "next/navigation";
import { useHubDataRevisitGate } from "@/lib/http/hub-data-freshness";
import { Plus } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildLoginHref } from "@/lib/auth/client-access-flow";
import { fetchStoresHomeFeedDeduped, forgetStoresHomeFeedFetchSingleFlight } from "@/lib/stores/store-delivery-api-client";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { DeliveryViewerGate } from "@/lib/stores/delivery-viewer-gate";
import { HOME_MENU_CATALOG, HOME_STORE_SHOW_MAX, type HomeStoresConfig } from "@/lib/home/home-layout-contract";
import type { HomeStoreMenuItem } from "@/lib/home/home-catalog-types";
import { keepSessionPick, rotateUnseenFirst } from "@/lib/home/home-rotation";
import type { HomeRotationCtl } from "@/components/home-hub/use-home-rotation";
import { HOME_SHELF_BRAND_MARK, HomeShelfHead } from "@/components/home-hub/HomeSectionHead";
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
  isMember,
  rot,
  refreshSeq,
}: {
  config: HomeStoresConfig;
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
      // 설계 §24 D1-웹: 알림으로 켠 실행이면 덮개가 걷힐 때까지(목적지 그림) 홈 전용 요청을 미룬다 · 그 밖에는 바로
      await untilLaunchPushDestinationSettled();
      if (!alive) return;
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

  const head = (
    <HomeShelfHead
      title={t("home_shelf_stores_title", { brand: HOME_SHELF_BRAND_MARK })}
      brand={t(HOME_MENU_CATALOG.stores.labelKey)}
      sub={t("home_shelf_stores_sub")}
      allLabel={t("home_see_all")}
      onAll={() => router.push("/stores")}
    />
  );

  if (state.kind === "gate") {
    const login = state.gate === "login_required";
    return (
      <section className="home-shelf" data-home-stores data-home-stores-gate={state.gate}>
        {head}
        <div className="home-store-gate">
          {/* eslint-disable-next-line @next/next/no-img-element -- 홈 배달 배너 그림(정적) */}
          <img src="/images/home-banners/hero-delivery.jpg" alt="" className="home-store-gate-img" />
          <span className="home-store-gate-shade" aria-hidden />
          <span className="home-store-gate-copy">
            <b>
              {login
                ? t("home_stores_login_title")
                : state.gate === "not_service_area"
                  ? t("store_delivery_not_service_area_title")
                  : t("home_stores_address_title")}
            </b>
            {state.gate === "not_service_area" ? <span>{t("store_delivery_not_service_area_body")}</span> : null}
            {login ? <span>{t("home_stores_login_body")}</span> : null}
            <button
              type="button"
              onClick={() => router.push(login ? buildLoginHref("/home") : buildMypageAddressesHref(null, { purpose: "delivery" }))}
              className="home-store-gate-cta"
            >
              {login
                ? t("home_sign_in")
                : state.gate === "not_service_area"
                  ? t("store_delivery_not_service_area_cta")
                  : t("home_stores_address_cta")}
            </button>
          </span>
        </div>
      </section>
    );
  }
  if (state.kind === "error") {
    return (
      <section className="home-shelf" data-home-stores data-home-stores-error>
        {head}
        <HomeLoadError onRetry={() => setRetryKey((n) => n + 1)} />
      </section>
    );
  }
  if (state.kind === "empty") {
    return (
      <section className="home-shelf" data-home-stores data-home-stores-empty>
        {head}
        <p className="home-shelf-empty">{t("home_stores_empty")}</p>
      </section>
    );
  }
  if (state.kind === "loading") {
    return (
      <section className="home-shelf" data-home-stores aria-busy="true">
        {head}
        <div className="home-store-grid">
          {[0, 1, 2].map((i) => (
            <span key={i} className="home-store-card home-skel" style={{ height: 196 }} />
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="home-shelf" data-home-stores>
      {head}
      {/* 매장 카드 — 휴대폰 1열 · 태블릿 2열 · PC 3열 (계획서 D · Owner 「매장 언발란스」 2026-11-18) */}
      <div className="home-store-grid">
        {state.shown.map(({ store, menus, adLabel }) => {
          const storeHref = `/stores/${encodeURIComponent(store.slug)}`;
          return (
            <div key={store.id} className="home-store-card" data-home-store={store.id}>
              <button type="button" onClick={() => router.push(storeHref)} className="home-store-head">
                {store.profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 매장 프로필 사진
                  <img src={store.profileImageUrl} alt="" className="home-store-logo" />
                ) : (
                  <span className="home-store-logo" />
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
              <div className="home-store-menus">
                {menus.map((m) => {
                  const href = `${storeHref}/p/${encodeURIComponent(m.id)}`;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => router.push(href)}
                      className="home-store-menu"
                      aria-label={t("home_store_menu_open_aria", { name: m.title })}
                    >
                      <span className="home-sq">
                        {m.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- 매장 메뉴 사진
                          <img src={m.imageUrl} alt="" className="home-sq-img" />
                        ) : null}
                        <span className="home-store-plus">
                          <Plus className="h-4 w-4" strokeWidth={2.6} aria-hidden />
                        </span>
                      </span>
                      <span className="mt-1.5 block truncate text-[13px] text-[#222]">{m.title}</span>
                      <span className="block truncate text-[14px] font-bold text-[#141a16]">
                        {peso(m.discountPrice ?? m.price)}
                        {m.discountPrice != null ? (
                          <span className="ml-1 text-[11.5px] font-normal text-[#999] line-through">{peso(m.price)}</span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
