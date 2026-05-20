"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { LogoutActionTrigger } from "@/components/my/settings/LogoutContent";
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
import {
  PHILIFE_FB_CARD_CLASS,
  PHILIFE_FEED_INSET_X_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";
import { fetchMeStoreOrdersListDeduped } from "@/lib/stores/store-delivery-api-client";
import { useRepresentativeFullAddressLine } from "@/hooks/use-representative-address-line";
import { formatAtUsername, resolveDisplayName } from "@/lib/users/user-label";
import { MyInfoProfileCard } from "@/components/mypage/myinfo/MyInfoProfileCard";
import { MyInfoStatGrid } from "@/components/mypage/myinfo/MyInfoStatGrid";
import { MyInfoMenuSection } from "@/components/mypage/myinfo/MyInfoMenuSection";
import { MyInfoMenuItem } from "@/components/mypage/myinfo/MyInfoMenuItem";
import {
  Bell,
  BookOpen,
  CalendarDays,
  CreditCard,
  Globe,
  Heart,
  HelpCircle,
  Languages,
  MapPin,
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
import { MYINFO_SURFACE } from "@/components/mypage/myinfo/myinfo-theme";
import { dibayMyInfoPerfMark, dibayMyInfoPerfMaybeLogTotal } from "@/lib/runtime/dibay-myinfo-perf";


function icon(el: ReactNode) {
  return el;
}

export function MyPageHomeDashboard({
  profile,
  mannerScore,
  overviewCounts,
  showBanner,
  bannerSlot,
  homeDashboardCounts = null,
}: {
  profile: ProfileRow;
  mannerScore: number;
  overviewCounts: MyPageOverviewCounts;
  showBanner?: boolean;
  bannerSlot?: React.ReactNode;
  /** From RSC — skips client list fetches for order/post counts. */
  homeDashboardCounts?: MyPageHomeDashboardCounts | null;
}) {
  const { t, safeT } = useI18n();
  const formatCount = (n: number | null | undefined): string => {
    if (n == null || Number.isNaN(n)) return t("mypage_comp_placeholder_dash");
    if (n > 99) return t("mypage_comp_stat_overflow_99plus");
    return String(n);
  };
  const { count: favoriteCount } = useMyFavoriteCount();
  const ownerHub = useOwnerHubBadgeBreakdown();
  const [orderCount, setOrderCount] = useState<number | null>(() => homeDashboardCounts?.storeOrderCount ?? null);
  const [postCount, setPostCount] = useState<number | null>(() => homeDashboardCounts?.communityPostCount ?? null);
  const representativeAddress = useRepresentativeFullAddressLine();
  const countsFetchScheduledRef = useRef(false);

  const viewerId = profile.id?.trim() ?? "";

  /** RSC counts when present; otherwise capped list endpoints as fallback. */
  useEffect(() => {
    if (!viewerId) {
      setOrderCount(null);
      setPostCount(null);
      return;
    }
    if (homeDashboardCounts != null) {
      setOrderCount(homeDashboardCounts.storeOrderCount);
      setPostCount(homeDashboardCounts.communityPostCount);
      return;
    }
    if (countsFetchScheduledRef.current) return;
    countsFetchScheduledRef.current = true;
    let cancelled = false;
    const run = async () => {
      try {
        dibayMyInfoPerfMark("api_start_ms", { api: "mypage_home_counts_fallback" });
        const [ordersWrapped, postsRes] = await Promise.all([
          fetchMeStoreOrdersListDeduped("?limit=100"),
          runSingleFlight("me:community-posts:limit=20", () =>
            fetch("/api/me/community-posts?limit=20", { credentials: "include", cache: "no-store" })
          ),
        ]);
        dibayMyInfoPerfMark("api_done_ms", { api: "mypage_home_counts_fallback" });
        const oj =
          ordersWrapped.status >= 200 && ordersWrapped.status < 300
            ? (ordersWrapped.json as { ok?: boolean; orders?: unknown[] })
            : null;
        const pj = postsRes.ok ? ((await postsRes.json()) as { ok?: boolean; posts?: unknown[] }) : null;
        if (cancelled) return;
        setOrderCount(Array.isArray(oj?.orders) ? oj.orders.length : 0);
        const plen = Array.isArray(pj?.posts) ? pj.posts.length : 0;
        setPostCount(plen);
      } catch {
        if (!cancelled) {
          setOrderCount(null);
          setPostCount(null);
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
    let t: ReturnType<typeof setTimeout> | null = null;

    if (idle) {
      idleId = idle(schedule, { timeout: 1200 });
    } else {
      t = setTimeout(schedule, 350);
    }

    return () => {
      cancelled = true;
      if (idleId != null && cancelIdle) cancelIdle(idleId);
      if (t) clearTimeout(t);
    };
  }, [viewerId, homeDashboardCounts]);

  useEffect(() => {
    dibayMyInfoPerfMark("profile_card_visible_ms", { surface: "mypage_root" });
    dibayMyInfoPerfMark("menu_visible_ms", { surface: "mypage_root" });
    dibayMyInfoPerfMaybeLogTotal({ surface: "mypage_root" });
  }, []);

  const profileAddressLine = resolveProfileLocationAddressLines(profile).join(" · ").trim();
  const representativeFullAddressLine =
    representativeAddress.status === "ready" ? (representativeAddress.line ?? "").trim() : "";
  const regionLine =
    representativeFullAddressLine ||
    profileAddressLine ||
    (representativeAddress.status === "loading"
      ? t("mypage_comp_address_loading")
      : t("mypage_comp_address_empty"));
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
        value: profile.points != null ? String(profile.points) : "—",
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
    postCount,
    favoriteCount,
    ownerHub,
    profile.points,
    t,
  ]);

  /** 거래 홈 `HomeProductList` — `PHILIFE_FEED_INSET_X` + 카드 간 `gap-1` 과 동일 축 */
  return (
    <div className={`min-h-0 min-w-0 flex-1 ${PHILIFE_FEED_INSET_X_CLASS} pt-1 pb-1`}>
      {showBanner && bannerSlot ? <div className="mb-1 shrink-0">{bannerSlot}</div> : null}

      <div className="flex min-h-0 min-w-0 flex-col gap-4">
        <MyInfoProfileCard
          avatarUrl={profile.avatar_url}
          displayName={displayName}
          atUsername={atUsername}
          addressLine={regionLine}
          addressHref="/mypage/addresses"
          editHref={MYPAGE_PROFILE_EDIT_HREF}
          rightMetaSlot={
            <div className="pt-1">
              <MannerBatteryDisplay raw={mannerScore} size="sm" layout="inline" className="gap-1.5" />
            </div>
          }
        />

        <MyInfoStatGrid items={statRows} />

        <div className="space-y-4">
          <MyInfoMenuSection title={safeT("mypage_comp_section_trade")}>
            <MyInfoMenuItem
              href="/mypage/section/trade/sales"
              title={safeT("mypage_comp_menu_trade_active_title")}
              description={t("mypage_comp_menu_trade_active_desc")}
              icon={icon(<Package className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/trade/favorites"
              title={safeT("mypage_comp_menu_trade_favorites_title")}
              description={t("mypage_comp_menu_trade_favorites_desc")}
              icon={icon(<Heart className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/my/offers"
              title={safeT("mypage_comp_menu_trade_offers_title")}
              description={t("mypage_comp_menu_trade_offers_desc")}
              icon={icon(<ReceiptText className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
          </MyInfoMenuSection>

          <MyInfoMenuSection title={safeT("mypage_comp_section_community")}>
            <MyInfoMenuItem
              href="/mypage/section/community/posts"
              title={safeT("mypage_comp_menu_community_posts_title")}
              description={t("mypage_comp_menu_community_posts_desc")}
              icon={icon(<BookOpen className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/community/comments"
              title={safeT("mypage_comp_menu_community_activity_title")}
              description={t("mypage_comp_menu_community_activity_desc")}
              icon={icon(<MessageCircle className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
          </MyInfoMenuSection>

          <MyInfoMenuSection title={safeT("mypage_comp_section_store_orders")}>
            <MyInfoMenuItem
              href="/mypage/section/store/manage"
              title={safeT("mypage_comp_menu_store_register_title")}
              description={t("mypage_comp_menu_store_register_desc")}
              icon={icon(<Store className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/store/orders"
              title={safeT("mypage_comp_menu_store_order_history_title")}
              description={t("mypage_comp_menu_store_order_history_desc")}
              icon={icon(<ShoppingBag className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/store/rider"
              title={safeT("mypage_comp_menu_store_rider_title")}
              description={t("mypage_comp_menu_store_rider_desc")}
              icon={icon(<Truck className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
          </MyInfoMenuSection>

          <MyInfoMenuSection title={safeT("mypage_comp_section_account_menu")}>
            <MyInfoMenuItem
              href="/mypage/addresses"
              title={safeT("mypage_comp_menu_account_address_title")}
              description={t("mypage_comp_menu_account_address_desc")}
              icon={icon(<MapPin className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/store/payment"
              title={safeT("mypage_comp_menu_account_payment_title")}
              description={t("mypage_comp_menu_account_payment_desc")}
              icon={icon(<CreditCard className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/settings/device-permissions"
              title={safeT("mypage_comp_menu_account_security_title")}
              description={t("mypage_comp_menu_account_security_desc")}
              icon={icon(<Shield className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/settings/notifications"
              title={safeT("mypage_comp_menu_account_notifications_title")}
              description={t("mypage_comp_menu_account_notifications_desc")}
              icon={icon(<Bell className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/settings/language"
              title={safeT("mypage_comp_menu_account_language_title")}
              description={t("mypage_comp_menu_account_language_desc")}
              icon={icon(<Languages className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/settings/country"
              title={safeT("mypage_comp_menu_account_region_title")}
              description={t("mypage_comp_menu_account_region_desc")}
              icon={icon(<Globe className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/settings"
              title={safeT("mypage_comp_menu_account_settings_title")}
              description={t("mypage_comp_menu_account_settings_desc")}
              icon={icon(<Settings className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
          </MyInfoMenuSection>

          <MyInfoMenuSection title={safeT("mypage_comp_section_support")}>
            <MyInfoMenuItem
              href="/mypage/section/settings/support"
              title={safeT("mypage_comp_menu_support_cs_title")}
              description={t("mypage_comp_menu_support_cs_desc")}
              icon={icon(<HelpCircle className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/settings/notices"
              title={safeT("mypage_comp_menu_support_notices_title")}
              description={t("mypage_comp_menu_support_notices_desc")}
              icon={icon(<UserRound className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/settings/events"
              title={safeT("mypage_comp_menu_support_events_title")}
              description={t("mypage_comp_menu_support_events_desc")}
              icon={icon(<CalendarDays className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/settings/terms"
              title={safeT("mypage_comp_menu_support_terms_title")}
              description={t("mypage_comp_menu_support_terms_desc")}
              icon={icon(<Shield className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
          </MyInfoMenuSection>

          <MyPageAdminMenuEntry asListItem />

          <div className="pt-2">
            <div className={`${MYINFO_SURFACE.card} overflow-hidden`}>
              <LogoutActionTrigger variant="menu_row" surface="grouped" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

