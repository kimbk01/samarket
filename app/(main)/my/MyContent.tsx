"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MyPageData } from "@/lib/my/types";
import { MyPageHeader } from "@/components/my/MyPageHeader";
import { MyPageHomeDashboard } from "@/components/mypage/MyPageHomeDashboard";
import { useMypageHubModel } from "@/hooks/use-mypage-hub-model";
import { MYPAGE_MOBILE_NAV_QUERY, normalizeMyPageTab } from "@/components/mypage/mypage-nav";
import { mapLegacyMyPageItemSlug } from "@/lib/mypage/mypage-mobile-nav-registry";
import { APP_MAIN_COLUMN_CLASS, APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import {
  PHILIFE_FB_CARD_CLASS,
  PHILIFE_FEED_INSET_X_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";
import { MYPAGE_HOME_PAGE_BG_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";
import {
  MYPAGE_INFO_HUB_SHEET_PARAM,
  MYPAGE_INFO_HUB_SHEET_VALUE,
} from "@/lib/my/mypage-info-hub";
import { MYPAGE_SETTINGS_HREF } from "@/lib/mypage/mypage-profile-routes";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import { fetchMeProfileDeduped } from "@/lib/profile/fetch-me-profile-deduped";
import {
  dibayMyInfoPerfMark,
  dibayMyInfoPerfMaybeLogTotal,
  dibayMyInfoPerfNavClick,
} from "@/lib/runtime/dibay-myinfo-perf";
import { guardedRouterReplace, logNetworkLoopGuardReplace } from "@/lib/dev/network-loop-guard";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyPageGuestHomeDashboard } from "@/components/mypage/MyPageGuestHomeDashboard";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";

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

export function MyContent({ initialMyPageData }: { initialMyPageData?: MyPageData | null } = {}) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname() ?? "";
  /** `useSearchParams` 객체는 렌더마다 참조가 바뀔 수 있어 router.replace effect 가 무한 재실행됨 → 문자열만 의존 */
  const searchQueryString = searchParams.toString();
  const legacyTabParam = searchParams.get("tab")?.trim() ?? "";
  const legacySectionParam = searchParams.get("section");
  const legacyNavParam = searchParams.get(MYPAGE_MOBILE_NAV_QUERY);
  const infoHubOpen =
    searchParams.get(MYPAGE_INFO_HUB_SHEET_PARAM) === MYPAGE_INFO_HUB_SHEET_VALUE;
  const recoveryTriggeredRef = useRef(false);
  const ensureRetriedRef = useRef(false);

  const membership = useClientMembershipState("mypage-root");
  const hasServerProfile = Boolean(initialMyPageData?.profile);
  const hubEnabled = hasServerProfile || membership.status === "member";
  const { data, loading, load } = useMypageHubModel(initialMyPageData ?? undefined, {
    enabled: hubEnabled,
  });

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
    return () => window.removeEventListener("pointerdown", handler, { capture: true } as any);
  }, []);

  useEffect(() => {
    if (!hasServerProfile && membership.status !== "member") return;
    if (loading || recoveryTriggeredRef.current) return;
    if (data?.profile) return;
    /**
     * 세션은 있으나 `profiles` 행이 비어 있는 첫 진입을 자동 회복.
     * `GET /api/me/profile` 단일 파이프라인(`runMeProfileReadPipeline`)으로 행이 만들어지면
     * 메인 데이터를 다시 로드해 화면을 정상화한다.
     */
    if (data && !data.profile && !ensureRetriedRef.current) {
      ensureRetriedRef.current = true;
      (async () => {
        try {
          await fetchMeProfileDeduped();
          invalidateMeProfileDedupedCache();
          await load({ silent: true });
        } catch {
          /* guest 또는 일시 실패 — 허브 UI fallback */
        }
      })();
      return;
    }
    recoveryTriggeredRef.current = true;
  }, [hasServerProfile, membership.status, loading, data, load]);

  useEffect(() => {
    if (!infoHubOpen) return;
    guardedRouterReplace(router, MYPAGE_SETTINGS_HREF, {
      source: "my-content",
      reason: "legacy_info_sheet_to_settings",
    });
  }, [infoHubOpen, router]);

  /** 레거시 `?tab=&section=` → 계층형 경로 */
  useEffect(() => {
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
    if (loading) {
      dibayMyInfoPerfMark("first_shell_visible_ms", { kind: "loading_shell" });
      return;
    }
    if (data?.profile) {
      dibayMyInfoPerfMark("rsc_done_ms", { hasProfile: true });
      dibayMyInfoPerfMark("first_content_visible_ms", { surface: "mypage_root" });
      dibayMyInfoPerfMaybeLogTotal({ surface: "mypage_root" });
      return;
    }
    if (data) {
      dibayMyInfoPerfMark("rsc_done_ms", { hasProfile: false });
    }
  }, [loading, data]);

  if (!hasServerProfile && membership.status === "checking") {
    return (
      <div className={`flex min-h-0 min-w-0 flex-col ${MYPAGE_HOME_PAGE_BG_CLASS}`}>
        <MyPageHeader />
        <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
          <div className={`${PHILIFE_FB_CARD_CLASS} sam-card__body py-10 text-center sam-text-body-secondary`}>
            {t("mypage_comp_loading_hub")}
          </div>
        </div>
      </div>
    );
  }

  /** 비회원 — 허브 레이아웃만. 진입 시 AuthModal 자동 오픈 금지(메뉴·CTA 탭 시만). */
  if (!hasServerProfile && membership.status === "guest") {
    return (
      <div className={`flex min-h-0 min-w-0 flex-col ${MYPAGE_HOME_PAGE_BG_CLASS}`}>
        <MyPageHeader />
        <div className={`${APP_MAIN_COLUMN_CLASS} min-h-0 min-w-0 ${MYPAGE_HOME_PAGE_BG_CLASS}`}>
          <MyPageGuestHomeDashboard />
        </div>
      </div>
    );
  }

  /** RSC 프로필이 있으면 백그라운드 refresh 중에도 셸 유지 */
  if (loading && !(hasServerProfile && data?.profile)) {
    return (
      <div className={`flex min-h-0 min-w-0 flex-col ${MYPAGE_HOME_PAGE_BG_CLASS}`}>
        <MyPageHeader />
        <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
          <div className={`${PHILIFE_FB_CARD_CLASS} sam-card__body py-10 text-center sam-text-body-secondary`}>
            {t("mypage_comp_loading_hub")}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`flex min-h-0 min-w-0 flex-col ${MYPAGE_HOME_PAGE_BG_CLASS}`}>
        <MyPageHeader />
        <div className={`${PHILIFE_FEED_INSET_X_CLASS} pt-1 ${APP_MAIN_TAB_SCROLL_BODY_CLASS}`}>
          <div className={`${PHILIFE_FB_CARD_CLASS} sam-card__body py-10 text-center sam-text-body-secondary`}>
            {t("mypage_comp_profile_load_failed_short")}
          </div>
        </div>
      </div>
    );
  }

  const { profile } = data;

  if (!profile) {
    return (
      <div className={`flex min-h-0 min-w-0 flex-col ${MYPAGE_HOME_PAGE_BG_CLASS}`}>
        <MyPageHeader />
        <div className={`${PHILIFE_FEED_INSET_X_CLASS} pt-1 ${APP_MAIN_TAB_SCROLL_BODY_CLASS}`}>
          <div className={`${PHILIFE_FB_CARD_CLASS} sam-card__body py-10 text-center sam-text-body-secondary`}>
            {t("mypage_comp_profile_load_failed_short")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 min-w-0 flex-col ${MYPAGE_HOME_PAGE_BG_CLASS}`}>
      <MyPageHeader />
      <div className={`${APP_MAIN_COLUMN_CLASS} min-h-0 min-w-0 ${MYPAGE_HOME_PAGE_BG_CLASS}`}>
        <MyPageHomeDashboard
          profile={profile}
          profileCompletion={data.profileCompletion ?? null}
          onProfileRefresh={() => void load({ silent: true })}
        />
      </div>
    </div>
  );
}
