"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { LogoutConfirmModal } from "@/components/auth/LogoutConfirmModal";
import { logoutDiBaYAppSession } from "@/lib/auth/logout";
import { resolveProfileLocationAddressLines } from "@/lib/profile/profile-location";
import { MannerBatteryDisplay } from "@/components/trust/MannerBatteryDisplay";
import { MYPAGE_PROFILE_EDIT_HREF, buildMypageSectionHref } from "@/lib/mypage/mypage-mobile-nav-registry";
import { MyPageAdminMenuEntry } from "@/components/mypage/MyPageAdminMenuEntry";
import { useMyFavoriteCount } from "@/hooks/useMyFavoriteCount";
import { useOwnerHubBadgeBreakdown } from "@/lib/chats/use-owner-hub-badge-total";
import { resolveUnifiedChatUnreadHintForDashboard } from "@/lib/notifications/samarket-messenger-notification-regulations";
import type { MyPageOverviewCounts } from "@/components/mypage/types";
import type { ProfileRow } from "@/lib/profile/types";
import type { MyPageHomeDashboardCounts } from "@/lib/my/types";
import { MYPAGE_HOME_BODY_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";
import { fetchMeStoreOrdersListDeduped } from "@/lib/stores/store-delivery-api-client";
import { useRepresentativeAddressPresentation } from "@/hooks/use-representative-address-line";
import { formatAtUsername, resolveDisplayName } from "@/lib/users/user-label";
import { MyInfoProfileCard } from "@/components/mypage/myinfo/MyInfoProfileCard";
import { DeliveryStyleAddressPickerSheet } from "@/components/addresses/DeliveryStyleAddressPickerSheet";
import { buildMypageAddressesHrefFromPath, resolveAddressFlowEntryPath } from "@/lib/addresses/mypage-addresses-return-to";
import { MyInfoStatGrid } from "@/components/mypage/myinfo/MyInfoStatGrid";
import { MyInfoQuickAccessSection } from "@/components/mypage/myinfo/MyInfoQuickAccessSection";
import {
  MyInfoAccountMenuSection,
  MyInfoServiceMenuSection,
  MyInfoStoreMenuSection,
  MyInfoSupportMenuSection,
} from "@/components/mypage/myinfo/MyInfoHomeMenuSections";
import { dibayMyInfoPerfMark, dibayMyInfoPerfMaybeLogTotal } from "@/lib/runtime/dibay-myinfo-perf";
import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";

const COLUMN_STACK_CLASS = "flex min-w-0 flex-col gap-3 md:gap-4";

export function MyPageHomeDashboard({
  profile,
  mannerScore,
  overviewCounts,
  showBanner,
  bannerSlot,
  homeDashboardCounts = null,
  addressDefaultsSnapshot = null,
}: {
  profile: ProfileRow;
  mannerScore: number;
  overviewCounts: MyPageOverviewCounts;
  showBanner?: boolean;
  bannerSlot?: React.ReactNode;
  homeDashboardCounts?: MyPageHomeDashboardCounts | null;
  addressDefaultsSnapshot?: AddressDefaultsSnapshot | null;
}) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const addressesMenuHref = buildMypageAddressesHrefFromPath(
    pathname,
    searchParams?.toString() ? `?${searchParams.toString()}` : ""
  );
  const formatCount = (n: number | null | undefined): string => {
    if (n == null || Number.isNaN(n)) return t("mypage_comp_placeholder_dash");
    if (n > 99) return t("mypage_comp_stat_overflow_99plus");
    return String(n);
  };
  const { count: favoriteCount } = useMyFavoriteCount();
  const ownerHub = useOwnerHubBadgeBreakdown();
  const [orderCount, setOrderCount] = useState<number | null>(() => homeDashboardCounts?.storeOrderCount ?? null);
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutSubmitting, setLogoutSubmitting] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const representativeAddressPresentation = useRepresentativeAddressPresentation({
    initialSnapshot: addressDefaultsSnapshot,
  });
  const countsFetchScheduledRef = useRef(false);
  const hasRscStoreOrderCount = typeof homeDashboardCounts?.storeOrderCount === "number";

  const viewerId = profile.id?.trim() ?? "";

  useEffect(() => {
    if (!viewerId) {
      setOrderCount(null);
      return;
    }
    if (hasRscStoreOrderCount) {
      setOrderCount(homeDashboardCounts!.storeOrderCount);
      return;
    }
    if (countsFetchScheduledRef.current) return;
    countsFetchScheduledRef.current = true;
    let cancelled = false;
    const run = async () => {
      try {
        dibayMyInfoPerfMark("api_start_ms", { api: "mypage_home_counts_fallback" });
        const ordersWrapped = await fetchMeStoreOrdersListDeduped("?limit=100");
        dibayMyInfoPerfMark("api_done_ms", { api: "mypage_home_counts_fallback" });
        const oj =
          ordersWrapped.status >= 200 && ordersWrapped.status < 300
            ? (ordersWrapped.json as { ok?: boolean; orders?: unknown[] })
            : null;
        if (cancelled) return;
        setOrderCount(Array.isArray(oj?.orders) ? oj.orders.length : 0);
      } catch {
        if (!cancelled) setOrderCount(null);
      }
    };

    const schedule = () => {
      if (cancelled) return;
      void run();
    };

    const w = typeof window !== "undefined" ? (window as Window & { requestIdleCallback?: typeof requestIdleCallback; cancelIdleCallback?: typeof cancelIdleCallback }) : null;
    const idle = w?.requestIdleCallback?.bind(w) ?? null;
    const cancelIdle = w?.cancelIdleCallback?.bind(w) ?? null;

    let idleId: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    if (idle) {
      idleId = idle(schedule, { timeout: 1200 });
    } else {
      timeoutHandle = setTimeout(schedule, 350);
    }

    return () => {
      cancelled = true;
      if (idleId != null && cancelIdle) cancelIdle(idleId);
      if (timeoutHandle) clearTimeout(timeoutHandle);
    };
  }, [viewerId, homeDashboardCounts, hasRscStoreOrderCount]);

  useEffect(() => {
    dibayMyInfoPerfMark("profile_card_visible_ms", { surface: "mypage_root" });
    dibayMyInfoPerfMark("menu_visible_ms", { surface: "mypage_root" });
    dibayMyInfoPerfMaybeLogTotal({ surface: "mypage_root" });
  }, []);

  const profileAddressLine = resolveProfileLocationAddressLines(profile).join(" · ").trim();
  const addressFallbackLine =
    representativeAddressPresentation.status === "loading"
      ? profileAddressLine || t("mypage_comp_address_loading")
      : t("mypage_comp_address_empty");
  const displayName = resolveDisplayName(profile) || t("mypage_comp_display_name_empty");
  const atUsername = formatAtUsername(profile.username ?? null);

  const statRows = useMemo((): { label: string; value: string; href: string; accent?: boolean }[] => {
    const activeTrade =
      overviewCounts.purchases != null && overviewCounts.sales != null
        ? Math.max(0, overviewCounts.purchases) + Math.max(0, overviewCounts.sales)
        : null;
    return [
      {
        label: t("mypage_comp_stat_points"),
        value: profile.points != null ? String(profile.points) : t("mypage_comp_placeholder_dash"),
        href: "/mypage/points",
        accent: true,
      },
      {
        label: t("mypage_comp_stat_active_trade"),
        value: formatCount(activeTrade),
        href: buildMypageSectionHref("trade"),
      },
      {
        label: t("mypage_comp_stat_orders"),
        value: formatCount(orderCount),
        href: buildMypageSectionHref("store"),
      },
      {
        label: t("mypage_comp_stat_unread_chat"),
        value: formatCount(resolveUnifiedChatUnreadHintForDashboard(ownerHub)),
        href: buildMypageSectionHref("messenger"),
      },
      {
        label: t("mypage_comp_stat_favorites_short"),
        value: formatCount(favoriteCount ?? null),
        href: "/mypage/section/trade/favorites",
      },
    ];
  }, [
    overviewCounts.purchases,
    overviewCounts.sales,
    orderCount,
    favoriteCount,
    ownerHub,
    profile.points,
    t,
  ]);

  return (
    <div className={MYPAGE_HOME_BODY_CLASS}>
      {showBanner && bannerSlot ? <div className="mb-3 shrink-0">{bannerSlot}</div> : null}

      <div className="flex min-h-0 min-w-0 flex-col gap-3 sm:gap-4">
        <MyInfoProfileCard
          avatarUrl={profile.avatar_url}
          displayName={displayName}
          atUsername={atUsername}
          addressPresentation={
            representativeAddressPresentation.status === "ready"
              ? representativeAddressPresentation.presentation
              : null
          }
          addressFallbackLine={
            representativeAddressPresentation.status === "ready" &&
            !representativeAddressPresentation.presentation
              ? profileAddressLine || addressFallbackLine
              : addressFallbackLine
          }
          onAddressPress={() => setAddressSheetOpen(true)}
          editHref={MYPAGE_PROFILE_EDIT_HREF}
          onLogoutPress={() => {
            setLogoutError(null);
            setLogoutOpen(true);
          }}
          rightMetaSlot={
            <MannerBatteryDisplay raw={mannerScore} size="sm" layout="inline" className="gap-1.5" />
          }
        />

        <MyInfoStatGrid items={statRows} />

        {/* Mobile: icon quick access + full-width list sections */}
        <div className="flex flex-col gap-3 md:hidden">
          <MyInfoQuickAccessSection variant="icons" />
          <MyInfoStoreMenuSection />
          <MyInfoAccountMenuSection addressesMenuHref={addressesMenuHref} />
          <MyInfoServiceMenuSection />
          <MyInfoSupportMenuSection />
          <MyPageAdminMenuEntry starbucks />
        </div>

        {/*
         * Tablet 768–1024px: `md:grid` + `min-[1025px]:hidden` 은 Tailwind v4 에서
         * `.md\:grid` 규칙이 `.min-\[1025px\]\:hidden` 보다 뒤에 생성되어 1025px+ 에도
         * 2열 블록이 남고, 데스크톱 3열과 메뉴가 중복된다. 상한은 `md:max-[1025px]:*`.
         */}
        <div className="hidden md:max-[1025px]:grid md:max-[1025px]:grid-cols-2 md:max-[1025px]:gap-4">
          <div className={COLUMN_STACK_CLASS}>
            <MyInfoQuickAccessSection variant="list" />
            <MyInfoSupportMenuSection />
            <MyInfoServiceMenuSection />
          </div>
          <div className={COLUMN_STACK_CLASS}>
            <MyInfoStoreMenuSection />
            <MyInfoAccountMenuSection addressesMenuHref={addressesMenuHref} />
          </div>
          <div className="md:max-[1025px]:col-span-2">
            <MyPageAdminMenuEntry starbucks />
          </div>
        </div>

        {/* Desktop: 3-column column stacks */}
        <div className="hidden min-[1025px]:grid min-[1025px]:grid-cols-3 min-[1025px]:gap-4">
          <div className={COLUMN_STACK_CLASS}>
            <MyInfoQuickAccessSection variant="list" />
            <MyInfoSupportMenuSection />
          </div>
          <div className={COLUMN_STACK_CLASS}>
            <MyInfoStoreMenuSection />
            <MyPageAdminMenuEntry starbucks />
          </div>
          <div className={COLUMN_STACK_CLASS}>
            <MyInfoAccountMenuSection addressesMenuHref={addressesMenuHref} />
            <MyInfoServiceMenuSection />
          </div>
        </div>
      </div>

      <DeliveryStyleAddressPickerSheet
        open={addressSheetOpen}
        onClose={() => setAddressSheetOpen(false)}
        purpose="master"
        managementReturnTo={resolveAddressFlowEntryPath(
          pathname,
          searchParams?.toString() ? `?${searchParams.toString()}` : ""
        )}
      />

      <LogoutConfirmModal
        open={logoutOpen}
        submitting={logoutSubmitting}
        error={logoutError}
        onCancel={() => {
          if (logoutSubmitting) return;
          setLogoutOpen(false);
        }}
        onConfirm={async () => {
          setLogoutSubmitting(true);
          setLogoutError(null);
          const safety = window.setTimeout(() => {
            setLogoutSubmitting(false);
            setLogoutOpen(false);
            window.location.replace("/");
          }, 6_000);
          try {
            const result = await logoutDiBaYAppSession();
            window.clearTimeout(safety);
            setLogoutSubmitting(false);
            if (!result.ok) {
              setLogoutError(result.message);
              return;
            }
            setLogoutOpen(false);
            window.location.replace("/");
          } catch (e) {
            window.clearTimeout(safety);
            setLogoutSubmitting(false);
            setLogoutError(e instanceof Error ? e.message : t("auth_logout_err_failed"));
          }
        }}
      />
    </div>
  );
}
