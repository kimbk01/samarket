"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, MapPin, Search } from "lucide-react";
import { openGlobalSearchFromHere } from "@/lib/search/global/global-search-navigation-ssot";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Tier1NotificationAnchor } from "@/components/notifications/Tier1NotificationAnchor";
import { samTier1HeaderIconCluster } from "@/lib/ui/tier1-header-icon";
import { DIBAY_APP_ICON_180_PATH, dibayBrandAssetUrl } from "@/lib/brand/brand-asset-paths";
import { dibayDomainChromeElementPropsForId } from "@/lib/ui/dibay-domain-chrome";
import { DibayPtrSlot } from "@/components/ptr/DibayPtrSlot";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { useRepresentativeAddressLine } from "@/hooks/use-representative-address-line";
import { useLastRunSnapshot } from "@/hooks/use-last-run-snapshot";
import { updateLastRunSnapshot } from "@/lib/startup/last-run-snapshot";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import { buildLoginHref } from "@/lib/auth/client-access-flow";
import {
  HOME_MENU_CATALOG,
  resolveAudienceBanners,
  resolveVisibleHomeSections,
  type HomeLayoutConfig,
  type HomeMenuKey,
  type HomeServiceKey,
} from "@/lib/home/home-layout-contract";
import type { HomeCatalog } from "@/lib/home/home-catalog-types";
import { addHomePullRefreshHandler, homePtrStore } from "@/lib/home/home-pull-refresh-store";
import { HomePullRefreshHost } from "@/components/home-hub/HomePullRefreshHost";
import { HomeBanner } from "@/components/home-hub/HomeBanner";
import { HomeServiceCards, HomeTelringCard } from "@/components/home-hub/HomeServiceCards";
import { HomeInfoStrip } from "@/components/home-hub/HomeInfoStrip";
import { HomeMyActivity } from "@/components/home-hub/HomeMyActivity";
import { HomeRateCalcStandalone } from "@/components/home-hub/HomeRateCalcSheet";
import { homePressFeedback, homePressFromClick, prewarmHomePressFeedback } from "@/lib/ui/home-press-feedback";
import { resolveHomeTopAreas } from "@/lib/home/home-top-areas";
import { HomeNoticeLine } from "@/components/home-hub/HomeNoticeLine";
import { HomeDiscoverFeed } from "@/components/home-hub/HomeDiscoverFeed";
import { useHomeRotation } from "@/components/home-hub/use-home-rotation";
import { hasSupabaseAuthTokenCookie } from "@/lib/home/home-banner-audience-hint";

/**
 * 앱 홈 `/`·`/home` — 슈퍼앱 개편 (Owner 「제안대로 승인」 2026-11-26 · `docs/design/home-superapp-redesign-design-2026-11-26.md`,
 * 이전 홈 시안 v4 2026-11-14).
 * 머리글 → ① 정보 띠(환율·날씨) → ② 배너(한 장씩 화면 폭) → ③ 서비스 8칸 → ④ telRING → ⑤ 내 진행 중(회원) → ⑥ 공지 → ⑦ 피드.
 * 홈 칸 폭 600 이상 = 2열 정확히 반반(1행 배너|서비스 · 2행 telRING|정보 띠+내 진행 중), 같은 행 같은 높이.
 * 바뀌는 때 = 당겨서 새로고침·재접속만(`useHomeRotation`). 비로그인: 읽기 가능, 개인 기능 = 기존 로그인 안내, 배달 = S-07.
 */
export function HomeScreen({
  initialLayout,
  initialCatalog,
}: {
  initialLayout: HomeLayoutConfig;
  initialCatalog: HomeCatalog;
}) {
  const { t } = useI18n();
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
  useEffect(() => {
    prewarmHomePressFeedback();
  }, []);
  const [rateCalcOpen, setRateCalcOpen] = useState(false);
  const [myActivityShown, setMyActivityShown] = useState(false);

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
        homePressFeedback("refresh");
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

  const showBanner = sections.includes("banner") && banners.length > 0;
  const showServices = sections.includes("services") && layout.services.some((s) => s.visible);
  const showInfo = sections.includes("infoStrip");
  const showTelring = sections.includes("telring");
  /** 내 진행 중 = 회원만 · 진행 중이 있을 때만 칸을 차지 (데이터는 칸이 받아 알림) */
  const showMy = sections.includes("myActivity") && isMember;
  const topAreas = resolveHomeTopAreas({
    banner: showBanner,
    services: showServices,
    telring: showTelring,
    info: showInfo,
    my: showMy && myActivityShown,
  });
  const telringConfig = layout.services.find((x) => x.key === "chat") ?? null;

  /**
   * 앱 진입 v3 ① (실측 2026-11-17 삼성: 첫 그림 뒤 「전체 지역」→빈칸→실제 주소 3단계 · 알림 종이 늦게 끼어들어 자리 이동).
   * 회원 확인 중에는 비회원 문구를 먼저 그리지 않는다 — 같은 자리 회색 칸(비회원 확정이면 「전체 지역」, 회원이면 주소)으로
   * 한 번만 바뀐다. 알림 자리도 미리 비워 둬 머리줄이 밀리지 않는다.
   */
  /**
   * 앱 진입 실기 F3-a (2026-11-17 삼성: 주소 +1.1초 · 종 +1.3초): 같은 계정의 지난 실행 값으로 첫 그림부터 회원 머리줄
   * (주소 한 줄 · 종 자리)을 그린다. 서버·hydration 첫 렌더는 사진 없음(null) — 첫 클라이언트 커밋에서만 반영.
   * 확인 결과가 비회원이면 그때 비회원 머리줄로, 주소가 다르면 새 주소로 바뀐다.
   */
  const lastRun = useLastRunSnapshot();
  const membershipChecking = membership.status === "checking";
  const seededMember = membershipChecking && lastRun?.member === true;
  const headerMember = isMember || seededMember;
  const seededAddressLine = headerMember ? lastRun?.addressLine?.trim() || null : null;
  /**
   * 조회된 주소 한 줄. 회원 확정 직후 주소 훅이 아직 사용자 없이 만든 「준비됨·없음」일 수 있어(부팅 재시도 전),
   * 없음이면 지난 실행 줄을 계속 보인다(회원은 주소 필수 — MandatoryAddressGate). 다른 주소가 오면 그 주소로 바뀐다.
   */
  const liveAddressLine = !membershipChecking && address.status === "ready" ? address.line?.trim() || null : null;
  const headerPending = membershipChecking
    ? !seededAddressLine && (seededMember || authCookieHint !== false)
    : isMember && address.status === "loading" && !seededAddressLine;
  const addressLabel = headerPending
    ? null
    : headerMember
      ? (liveAddressLine ?? seededAddressLine ?? t("home_address_unset"))
      : t("home_address_all");

  /** F3-a 기록 — 회원 확정·주소 조회 성공 뒤 (계정 = 로그인 쿠키 · 확정 사용자 id 와 같을 때만 · 주소는 있는 줄만) */
  const memberProfileId = membership.status === "member" ? membership.profile.id : null;
  useEffect(() => {
    if (!memberProfileId) return;
    updateLastRunSnapshot({ member: true }, memberProfileId);
  }, [memberProfileId]);
  useEffect(() => {
    if (!memberProfileId || !liveAddressLine) return;
    updateLastRunSnapshot({ addressLine: liveAddressLine }, memberProfileId);
  }, [memberProfileId, liveAddressLine]);

  return (
    <div className="home-r3 min-h-full bg-[#F3F5F3]" data-home-screen>
      <HomePullRefreshHost />

      {/* 머리줄 — 시안 R4 수정안 #1 (Owner 「수정안대로 진행」 2026-11-18): 로고 · 흰 알약 주소 · 알림 종/로그인.
          본문과 같은 가운데 1240 시작선(`.home-r3-hdr-row`) · 바탕 = 홈 도메인 색(헤더 SSOT) · 구분선 없음(시안). */}
      <header className="home-r3-hdr" data-home-header {...dibayDomainChromeElementPropsForId("home")}>
        <div style={{ paddingTop: "var(--safe-top, 0px)" }}>
          <div className="home-r3-hdr-row">
            <span className="flex shrink-0 items-center gap-1.5" aria-label="dibaY">
              {/* eslint-disable-next-line @next/next/no-img-element -- 정적 브랜드 아이콘 */}
              <img src={dibayBrandAssetUrl(DIBAY_APP_ICON_180_PATH)} alt="" width={28} height={28} className="h-7 w-7 rounded-[7px]" />
              <span className="text-[22px] font-extrabold tracking-[-0.03em] text-sam-primary">
                diba<span className="text-[#E0A800]">Y</span>
              </span>
            </span>
            {layout.header.showAddress ? (
              <button
                type="button"
                aria-label={t("home_address_change_aria")}
                className="home-press home-r3-loc"
                onClick={(e) => {
                  homePressFromClick("tap", e);
                  if (isMember) router.push("/mypage/addresses");
                  else void requireAuthAction("address_save", () => router.push("/mypage/addresses"), { next: "/home" });
                }}
                data-home-address
                data-popup-anchor="region"
              >
                <MapPin className="h-4 w-4 shrink-0 text-[#1C7A3A]" strokeWidth={2.4} aria-hidden />
                {/* F3-c: 글자 칸은 회색 칸과 같은 최소 너비 — 글자가 와도 `⌄` 가 당겨지지 않는다 */}
                {addressLabel == null ? (
                  <span aria-hidden className="inline-block h-[14px] w-20 shrink-0 rounded-ui-rect bg-[#e9ece9]" data-home-address-pending />
                ) : (
                  <span className="min-w-0 truncate" data-home-address-line>
                    {addressLabel}
                  </span>
                )}
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#555]" strokeWidth={2.4} aria-hidden />
              </button>
            ) : null}
            <span className="flex-1" />
            {/* 검색 (설계 C2) — 휴대폰 = 아이콘, 태블릿 = 검색 알약. 둘 다 기존 통합검색 화면으로만 이동 */}
            <button
              type="button"
              className="home-press home-r3-search"
              aria-label={t("common_search")}
              onClick={(e) => {
                homePressFromClick("tap", e);
                openGlobalSearchFromHere(router);
              }}
              data-home-search
            >
              <Search className="h-[18px] w-[18px] shrink-0" strokeWidth={2.4} aria-hidden />
              <span className="home-r3-search-label">{t("common_search")}</span>
            </button>
            <div className={samTier1HeaderIconCluster}>
              {headerMember ? (
                /* 진입 감사 PO-3: 팝업 말풍선이 붙는 자리 · F3-a: 지난 실행이 회원이면 확인 중에도 종을 바로 그린다 */
                <span data-popup-anchor="notifications" className="inline-flex">
                  <Tier1NotificationAnchor />
                </span>
              ) : membership.status === "checking" && authCookieHint !== false ? (
                /* 회원 확인 중 — 알림 자리를 미리 비워 둔다(머리줄 밀림 방지) */
                <span aria-hidden className="inline-block h-10 w-10" data-home-bell-pending />
              ) : null}
            </div>
            {/* 로그인 = 글자 버튼 — 아이콘 칸 묶음(36px 정사각) 밖에 둔다 (2026-11-18 실측: 묶음 안에서 「로그인」 세로 쪼개짐) */}
            {!headerMember && isGuest ? (
              <button
                type="button"
                className="home-press inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-full bg-sam-primary px-4 text-[13.5px] font-bold text-white"
                onClick={(e) => {
                  homePressFromClick("tap", e);
                  router.push(buildLoginHref("/home"));
                }}
                data-home-login
              >
                {t("home_sign_in")}
              </button>
            ) : null}
          </div>
        </div>
        {/* 당겨서 새로고침 슬롯 — 커뮤니티·거래와 같은 공통 슬롯(1단 아래 · 시그니처 그린) */}
        <DibayPtrSlot store={homePtrStore} tone="onBrand" className="bg-signature" dataAttribute="data-home-ptr-hint" />
      </header>

      {/* 시안 R3 (Owner 「계획대로 진행」 2026-11-18 · 계획서 B): 가운데 최대 1240 · 위 = 배너 + telRING·서비스 칸
          (휴대폰·태블릿 세로 = 아래로 · iPad 가로·PC = 왼쪽 배너 · 오른쪽 서비스) → 공지 → 서비스별 줄. 칸 보이기 = 어드민 「홈 구성」 */}
      <div className="home-r3-wrap">
        {topAreas ? (
          <div
            className="home-r3-top"
            style={{ ["--home-areas" as string]: topAreas.areas, ["--home-cols" as string]: topAreas.cols }}
            data-home-top
          >
            {showInfo ? (
              <div className="home-r3-cell home-r3-cell--info">
                <HomeInfoStrip
                  isMember={isMember}
                  refreshSeq={refreshSeq}
                  rateCalcOpen={rateCalcOpen}
                  onRateCalcOpenChange={setRateCalcOpen}
                />
              </div>
            ) : null}
            {showBanner ? (
              // 회원 확인 중에는 기기 로그인 쿠키로 대상을 먼저 정해 바로 보인다(R1). 쿠키를 읽기 전(마운트 직후)에만 고르지 않는다 (감사 E14).
              <div className="home-r3-cell home-r3-cell--banner home-r3-banner" data-home-banner-wrap>
                <HomeBanner banners={banners} isMember={isMember} rot={bannerAudienceMember == null ? null : rot} />
              </div>
            ) : null}
            {showServices ? (
              <div className="home-r3-cell home-r3-cell--svc">
                <HomeServiceCards
                  services={layout.services}
                  catalog={catalog}
                  onOpen={openMenu}
                  onOpenRateCalc={() => setRateCalcOpen(true)}
                />
              </div>
            ) : null}
            {showTelring ? (
              <div className="home-r3-cell home-r3-cell--ring">
                <HomeTelringCard config={telringConfig} catalog={catalog} onOpen={openMenu} onOpenHref={openMenuHref} />
              </div>
            ) : null}
            {showMy ? (
              <div className={`home-r3-cell home-r3-cell--my${myActivityShown ? "" : " hidden"}`}>
                <HomeMyActivity refreshSeq={refreshSeq} onShownChange={setMyActivityShown} />
              </div>
            ) : null}
          </div>
        ) : null}
        {/* 정보 띠를 숨겼어도 서비스 「환율 계산」 칸은 시트를 연다 */}
        {!showInfo ? <HomeRateCalcStandalone open={rateCalcOpen} onClose={() => setRateCalcOpen(false)} /> : null}
        {sections.includes("notice") && catalog.latestNotice ? (
          <div className="home-r3-notice">
            <HomeNoticeLine notice={catalog.latestNotice} />
          </div>
        ) : null}
        {sections.includes("feed") ? (
          <HomeDiscoverFeed
            layout={layout}
            tradeCategories={catalog.tradeCategories}
            storeCategories={catalog.storeCategories}
            isMember={isMember}
            membershipChecking={membership.status === "checking"}
            rot={rot}
            refreshSeq={refreshSeq}
          />
        ) : null}
      </div>
    </div>
  );
}
