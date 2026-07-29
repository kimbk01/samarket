"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MyPageHeader } from "@/components/my/MyPageHeader";
import { MyPageHomeDashboard } from "@/components/mypage/MyPageHomeDashboard";
import { useMypageHomeModel } from "@/hooks/use-mypage-home-model";
import { MYPAGE_MOBILE_NAV_QUERY, normalizeMyPageTab } from "@/components/mypage/mypage-nav";
import { mapLegacyMyPageItemSlug } from "@/lib/mypage/mypage-mobile-nav-registry";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { MYPAGE_HOME_PAGE_BG_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";
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
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { getCurrentUser } from "@/lib/auth/get-current-user";

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
export function MyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname() ?? "";
  const searchQueryString = searchParams.toString();
  const legacyTabParam = searchParams.get("tab")?.trim() ?? "";
  const legacySectionParam = searchParams.get("section");
  const legacyNavParam = searchParams.get(MYPAGE_MOBILE_NAV_QUERY);
  const infoHubOpen =
    searchParams.get(MYPAGE_INFO_HUB_SHEET_PARAM) === MYPAGE_INFO_HUB_SHEET_VALUE;

  const sessionUser = getCurrentUser();
  const membership = useClientMembershipState("mypage-root");
  const treatAsMember =
    Boolean(sessionUser?.id) || membership.status === "member";
  const isConfirmedGuest = !sessionUser?.id && membership.status === "guest";

  const { projection, refresh } = useMypageHomeModel(treatAsMember);

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
        <MyPageHeader />
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
        <MyPageHeader />
        <div className={`${APP_MAIN_COLUMN_CLASS} min-h-0 min-w-0 ${MYPAGE_HOME_PAGE_BG_CLASS}`}>
          <MyPageHomeDashboard
            projection={projection}
            onProfileRefresh={() => void refresh()}
          />
        </div>
      </div>
      <MypageProfileSheetsHost profile={projection?.profile ?? null} />
    </MypageProfileSheetsProvider>
  );
}
