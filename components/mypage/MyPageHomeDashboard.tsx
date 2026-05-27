"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { LogoutConfirmModal } from "@/components/auth/LogoutConfirmModal";
import { logoutDiBaYAppSession } from "@/lib/auth/logout";
import { buildLoginPath } from "@/lib/auth/safe-next-path";
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
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";
import { MyInfoStatGrid } from "@/components/mypage/myinfo/MyInfoStatGrid";
import { MyInfoMenuSection } from "@/components/mypage/myinfo/MyInfoMenuSection";
import { MyInfoMenuItem } from "@/components/mypage/myinfo/MyInfoMenuItem";
import { MyInfoLanguageToggleRow } from "@/components/mypage/myinfo/MyInfoLanguageToggleRow";
import {
  Bell,
  BookOpen,
  CalendarDays,
  CreditCard,
  Globe,
  Heart,
  HelpCircle,
  Languages,
  MessageCircle,
  Package,
  ReceiptText,
  Settings,
  Shield,
  ShoppingBag,
  Store,
  Truck,
  UserRound,
} from "lucide-react";
import { dibayMyInfoPerfMark, dibayMyInfoPerfMaybeLogTotal } from "@/lib/runtime/dibay-myinfo-perf";
import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";


const ICON = "h-[18px] w-[18px]";

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
  /** From RSC — skips client list fetches for order/post counts. */
  homeDashboardCounts?: MyPageHomeDashboardCounts | null;
  /** From RSC — 대표 주소 첫 페인트(클라 fetch 대기 없음). */
  addressDefaultsSnapshot?: AddressDefaultsSnapshot | null;
}) {
  const { t, safeT } = useI18n();
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

  const viewerId = profile.id?.trim() ?? "";

  /** RSC counts when present; otherwise capped list endpoints as fallback. */
  useEffect(() => {
    if (!viewerId) {
      setOrderCount(null);
      return;
    }
    if (homeDashboardCounts != null) {
      setOrderCount(homeDashboardCounts.storeOrderCount);
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
        if (!cancelled) {
          setOrderCount(null);
        }
      }
    };

    /**
     * MI2: fallback count fetch must not compete with first visible paint.
     * - schedule after hydration on an idle slice (or short delay fallback)
     * - failure must never block UI
     */
    const schedule = () => {
      if (cancelled) return;
      void run();
    };

    const w = typeof window !== "undefined" ? (window as any) : null;
    const idle: ((cb: () => void, opts?: { timeout?: number }) => number) | null =
      w && typeof w.requestIdleCallback === "function" ? w.requestIdleCallback.bind(w) : null;
    const cancelIdle: ((id: number) => void) | null =
      w && typeof w.cancelIdleCallback === "function" ? w.cancelIdleCallback.bind(w) : null;

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
  }, [viewerId, homeDashboardCounts]);

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

  /** 스타벅스형 내정보 — 프로필 편집과 동일 크림·카드·섹션 */
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

        <div className="grid grid-cols-1 items-start gap-3 sm:gap-4 lg:grid-cols-2">
          <MyInfoMenuSection title={safeT("mypage_comp_section_trade")}>
            <MyInfoMenuItem
              first
              href="/mypage/section/trade/sales"
              title={safeT("mypage_comp_menu_trade_active_title")}
              icon={<Package className={ICON} strokeWidth={2} />}
            />
            <MyInfoMenuItem
              href="/mypage/section/trade/favorites"
              title={safeT("mypage_comp_menu_trade_favorites_title")}
              icon={<Heart className={ICON} strokeWidth={2} />}
            />
            <MyInfoMenuItem
              href="/my/offers"
              title={safeT("mypage_comp_menu_trade_offers_title")}
              icon={<ReceiptText className={ICON} strokeWidth={2} />}
            />
          </MyInfoMenuSection>

          <MyInfoMenuSection title={safeT("mypage_comp_section_community")}>
            <MyInfoMenuItem
              first
              href="/mypage/section/community/posts"
              title={safeT("mypage_comp_menu_community_posts_title")}
              icon={<BookOpen className={ICON} strokeWidth={2} />}
            />
            <MyInfoMenuItem
              href="/mypage/section/community/comments"
              title={safeT("mypage_comp_menu_community_activity_title")}
              icon={<MessageCircle className={ICON} strokeWidth={2} />}
            />
          </MyInfoMenuSection>

          <MyInfoMenuSection title={safeT("mypage_comp_section_store_orders")}>
            <MyInfoMenuItem
              first
              href="/stores/owner/apply"
              title={safeT("mypage_comp_menu_store_register_title")}
              icon={<Store className={ICON} strokeWidth={2} />}
            />
            <MyInfoMenuItem
              href="/mypage/section/store/orders"
              title={safeT("mypage_comp_menu_store_order_history_title")}
              icon={<ShoppingBag className={ICON} strokeWidth={2} />}
            />
            <MyInfoMenuItem
              href="/mypage/section/store/rider"
              title={safeT("mypage_comp_menu_store_rider_title")}
              icon={<Truck className={ICON} strokeWidth={2} />}
            />
          </MyInfoMenuSection>

          <MyInfoMenuSection title={safeT("mypage_comp_section_account_menu")}>
            <MyInfoMenuItem
              first
              href={addressesMenuHref}
              title={safeT("mypage_comp_menu_account_address_title")}
              icon={
                <AddressKindHeadPin kind="general" className={`${ICON} [&_svg]:h-[18px] [&_svg]:w-[15px]`} />
              }
            />
            <MyInfoMenuItem
              href="/mypage/section/store/payment"
              title={safeT("mypage_comp_menu_account_payment_title")}
              icon={<CreditCard className={ICON} strokeWidth={2} />}
            />
            <MyInfoMenuItem
              href="/mypage/section/settings/device-permissions"
              title={safeT("mypage_comp_menu_account_security_title")}
              icon={<Shield className={ICON} strokeWidth={2} />}
            />
            <MyInfoMenuItem
              href="/mypage/section/settings/notifications"
              title={safeT("mypage_comp_menu_account_notifications_title")}
              icon={<Bell className={ICON} strokeWidth={2} />}
            />
            <MyInfoLanguageToggleRow icon={<Languages className={ICON} strokeWidth={2} />} />
            <MyInfoMenuItem
              href="/mypage/section/settings/country"
              title={safeT("mypage_comp_menu_account_region_title")}
              icon={<Globe className={ICON} strokeWidth={2} />}
            />
            <MyInfoMenuItem
              href="/mypage/settings"
              title={safeT("mypage_comp_menu_account_settings_title")}
              icon={<Settings className={ICON} strokeWidth={2} />}
            />
          </MyInfoMenuSection>

          <MyInfoMenuSection title={safeT("mypage_comp_section_support")}>
            <MyInfoMenuItem
              first
              href="/mypage/section/settings/support"
              title={safeT("mypage_comp_menu_support_cs_title")}
              icon={<HelpCircle className={ICON} strokeWidth={2} />}
            />
            <MyInfoMenuItem
              href="/mypage/section/settings/notices"
              title={safeT("mypage_comp_menu_support_notices_title")}
              icon={<UserRound className={ICON} strokeWidth={2} />}
            />
            <MyInfoMenuItem
              href="/mypage/section/settings/events"
              title={safeT("mypage_comp_menu_support_events_title")}
              icon={<CalendarDays className={ICON} strokeWidth={2} />}
            />
            <MyInfoMenuItem
              href="/mypage/section/settings/terms"
              title={safeT("mypage_comp_menu_support_terms_title")}
              icon={<Shield className={ICON} strokeWidth={2} />}
            />
          </MyInfoMenuSection>
        </div>

        <MyPageAdminMenuEntry starbucks />
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
            window.location.replace(buildLoginPath());
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
            window.location.replace(buildLoginPath());
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

