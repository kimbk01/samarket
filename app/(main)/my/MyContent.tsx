"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MyPageHeader } from "@/components/my/MyPageHeader";
import { MyPageHomeDashboard } from "@/components/mypage/MyPageHomeDashboard";
import { useMypageHomeModel } from "@/hooks/use-mypage-home-model";
import { MYPAGE_MOBILE_NAV_QUERY, normalizeMyPageTab } from "@/components/mypage/mypage-nav";
import { mapLegacyMyPageItemSlug } from "@/lib/mypage/mypage-mobile-nav-registry";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { MYPAGE_HOME_PAGE_BG_CLASS } from "@/lib/ui/mypage-home-styles";
import {
  MYPAGE_INFO_HUB_SHEET_PARAM,
  MYPAGE_INFO_HUB_SHEET_VALUE,
} from "@/lib/my/mypage-info-hub";
import { MYPAGE_SETTINGS_HREF } from "@/lib/mypage/mypage-profile-routes";
import {
  dibayMyInfoPerfMark,
  dibayMyInfoPerfMaybeLogTotal,
  dibayMyInfoPerfNavClick,
} from "@/lib/runtime/dibay-myinfo-perf";
import { guardedRouterReplace, logNetworkLoopGuardReplace } from "@/lib/dev/network-loop-guard";
import { MyPageGuestHomeDashboard } from "@/components/mypage/MyPageGuestHomeDashboard";
import { MypageProfileSheetsHost } from "@/components/mypage/profile-settings/MypageProfileSheetsHost";
import { MypageProfileSheetsProvider } from "@/components/mypage/profile-settings/mypage-profile-sheets-context";
import { MypageProfileEditQueryOpener } from "@/components/mypage/profile-settings/MypageProfileEditQueryOpener";
import {
  retryClientMembershipRecovery,
  useClientMembershipRecoveryFailed,
  useClientMembershipState,
} from "@/hooks/use-client-membership-state";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { MypageOwnerStoreGateSeed } from "@/lib/my/load-mypage-owner-store-gate-seed";
import type { MypageAdminMenuSeed } from "@/lib/my/load-mypage-admin-menu-seed";
import { DibayPtrSlot } from "@/components/ptr/DibayPtrSlot";
import { MypagePullRefreshHost } from "@/components/mypage/MypagePullRefreshHost";
import { addMypagePullRefreshHandler, mypagePtrStore } from "@/lib/mypage/mypage-pull-refresh-store";
import { getMypageHomeSummaryState, loadMypageHomeSummary } from "@/lib/mypage/mypage-home-summary-client";

function resolveLegacyMyPageRedirectTarget(args: {
  tab: string;
  nav: string | null;
  rawSection: string | null;
}): string | null {
  const { tab, nav, rawSection } = args;
  if (nav === "1") return "/mypage";
  if (!tab) return null;
  if (tab === "account" && (!rawSection || rawSection === "home")) return "/mypage";
  if (!rawSection || rawSection === "home") {
    return `/mypage/section/${encodeURIComponent(tab)}`;
  }
  const normalizedTab = normalizeMyPageTab(tab);
  const item = mapLegacyMyPageItemSlug(normalizedTab, rawSection);
  return `/mypage/section/${encodeURIComponent(normalizedTab)}/${encodeURIComponent(item)}`;
}

/**
 * `/mypage` root shell.
 * CONTRACT: no full-page spinner; session member → home shell immediately;
 * guest only after membership confirms guest (not during checking with cached user).
 */
export function MyContent({
  ownerStoreGateSeed = null,
  adminMenuSeed = null,
}: {
  /** RSC cold authority for store menu CTA — OwnerLite/TTL may be empty on first paint. */
  ownerStoreGateSeed?: MypageOwnerStoreGateSeed | null;
  /** RSC `isRouteAdmin()` fact for this request — admin row in the first render (client re-verifies). */
  adminMenuSeed?: MypageAdminMenuSeed | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname() ?? "";
  const searchQueryString = searchParams.toString();
  const legacyTabParam = searchParams.get("tab")?.trim() ?? "";
  const legacySectionParam = searchParams.get("section");
  const legacyNavParam = searchParams.get(MYPAGE_MOBILE_NAV_QUERY);
  const infoHubOpen =
    searchParams.get(MYPAGE_INFO_HUB_SHEET_PARAM) === MYPAGE_INFO_HUB_SHEET_VALUE;

  const membership = useClientMembershipState("mypage-root"); /* 회원 상태 하나로 — 캐시가 이미 회원이면 첫 화면부터 member(보충 읽기 삭제 · 관심이웃 전체 수정 설계 v2 §6) */
  const treatAsMember =
    membership.status === "member";
  const isConfirmedGuest = membership.status === "guest";

  const membershipCheckFailed = useClientMembershipRecoveryFailed() && !treatAsMember;

  const { projection, refresh, refreshFresh, needsRelogin, loadFailed } = useMypageHomeModel(treatAsMember);

  /**
   * 당겨서 새로고침 (Owner 「설계안대로 구현」 2026-11-27 · docs/audit/mypage-ptr-2026-11-27) — 회원 화면만.
   * 프로필·주소(캐시 건너뜀) · 요약 숫자·배너(force). 고객센터 안 읽음은 대시보드 훅이 따로 등록한다.
   */
  useEffect(() => {
    if (!treatAsMember) return;
    const offProfile = addMypagePullRefreshHandler(() => refreshFresh());
    const offSummary = addMypagePullRefreshHandler(async () => {
      const uid = getCurrentUser()?.id?.trim() ?? "";
      if (!uid) return "cancelled";
      await loadMypageHomeSummary(uid, { force: true });
      const st = getMypageHomeSummaryState();
      if (!st || st.viewerId !== uid) return "cancelled";
      return st.failed ? "error" : "success";
    });
    return () => {
      offProfile();
      offSummary();
    };
  }, [treatAsMember, refreshFresh]);
  /** 1단 바로 아래 슬롯 — 홈·거래와 같은 시그니처 그린 (셸 `AppStickyHeader` 가 `stickyBelow` 로 그림) */
  const ptrSlot = useMemo(
    () => (
      <DibayPtrSlot store={mypagePtrStore} tone="onBrand" className="bg-signature" dataAttribute="data-mypage-ptr-hint" />
    ),
    []
  );

  useEffect(() => {
    if (!pathname) return;
    dibayMyInfoPerfMark("route_start_ms", { pathname });
  }, [pathname]);

  useEffect(() => {
    dibayMyInfoPerfMark("hydration_done_ms", { surface: "mypage_root" });
  }, []);

  useEffect(() => {
    const handler = (ev: PointerEvent) => {
      const target = ev.target as HTMLElement | null;
      const a = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      const href = a?.getAttribute("href") ?? "";
      if (!href) return;
      if (!href.startsWith("/mypage") && !href.startsWith("/my")) return;
      dibayMyInfoPerfNavClick(href);
    };
    window.addEventListener("pointerdown", handler, { capture: true });
    return () => window.removeEventListener("pointerdown", handler, { capture: true } as AddEventListenerOptions);
  }, []);

  useEffect(() => {
    if (!infoHubOpen) return;
    guardedRouterReplace(router, MYPAGE_SETTINGS_HREF, {
      source: "my-content",
      reason: "legacy_info_sheet_to_settings",
    });
  }, [infoHubOpen, router]);

  useEffect(() => {
    if (pathname !== "/mypage" && pathname !== "/my" && !pathname.startsWith("/mypage/") && !pathname.startsWith("/my/")) {
      return;
    }
    const target = resolveLegacyMyPageRedirectTarget({
      tab: legacyTabParam,
      nav: legacyNavParam,
      rawSection: legacySectionParam,
    });
    if (!target) return;
    if (pathname === target && !searchQueryString) {
      logNetworkLoopGuardReplace({
        source: "my-content",
        targetUrl: target,
        reason: "legacy_redirect_skip",
      });
      return;
    }
    guardedRouterReplace(router, target, {
      source: "my-content",
      reason: "legacy_tab_redirect",
    });
  }, [router, legacyTabParam, legacyNavParam, legacySectionParam, pathname, searchQueryString]);

  useEffect(() => {
    if (!treatAsMember) return;
    dibayMyInfoPerfMark("first_shell_visible_ms", { kind: "home_shell" });
    if (projection) {
      dibayMyInfoPerfMark("first_content_visible_ms", { surface: "mypage_root" });
      dibayMyInfoPerfMaybeLogTotal({ surface: "mypage_root" });
    }
  }, [treatAsMember, projection]);

  if (isConfirmedGuest) {
    return (
      <div className={`flex min-h-0 min-w-0 flex-col ${MYPAGE_HOME_PAGE_BG_CLASS}`}>
        <MyPageHeader hideActions />
        <div className={`${APP_MAIN_COLUMN_CLASS} min-h-0 min-w-0 ${MYPAGE_HOME_PAGE_BG_CLASS}`}>
          <MyPageGuestHomeDashboard />
        </div>
      </div>
    );
  }

  /** member or checking-with-session: always show home shell (menus static; profile may skeleton) */
  return (
    <MypageProfileSheetsProvider>
      <div className={`flex min-h-0 min-w-0 flex-col ${MYPAGE_HOME_PAGE_BG_CLASS}`} data-mypage-home-shell="1">
        <MypagePullRefreshHost />
        <MyPageHeader stickyBelow={ptrSlot} />
        <div className={`${APP_MAIN_COLUMN_CLASS} min-h-0 min-w-0 ${MYPAGE_HOME_PAGE_BG_CLASS}`}>
          <MyPageHomeDashboard
            projection={projection}
            onProfileRefresh={
              membershipCheckFailed
                ? () => retryClientMembershipRecovery("mypage-root")
                : () => void refresh()
            }
            needsRelogin={needsRelogin}
            loadFailed={loadFailed || membershipCheckFailed}
            ownerStoreGateSeed={ownerStoreGateSeed}
            adminMenuSeed={adminMenuSeed}
          />
        </div>
      </div>
      <MypageProfileSheetsHost profile={projection?.profile ?? null} />
      {/* `/mypage?edit=profile` → 프로필 수정 시트 1회 열기 후 쿼리 제거 (X1·S01) */}
      <MypageProfileEditQueryOpener enabled={pathname === "/mypage" || pathname === "/my"} />
    </MypageProfileSheetsProvider>
  );
}
