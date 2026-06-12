"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildMypageSectionHref } from "@/lib/mypage/mypage-mobile-nav-registry";
import { MYPAGE_HOME_BODY_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";
import { MyInfoGuestProfileCard } from "@/components/mypage/myinfo/MyInfoGuestProfileCard";
import { MyInfoStatGrid } from "@/components/mypage/myinfo/MyInfoStatGrid";
import { MyInfoQuickAccessSection } from "@/components/mypage/myinfo/MyInfoQuickAccessSection";
import {
  MyInfoAccountMenuSection,
  MyInfoServiceMenuSection,
  MyInfoStoreMenuSection,
  MyInfoSupportMenuSection,
} from "@/components/mypage/myinfo/MyInfoHomeMenuSections";
import { useMypageGuestMenuNav } from "@/hooks/use-mypage-guest-menu-nav";
import { buildMypageAddressesHrefFromPath } from "@/lib/addresses/mypage-addresses-return-to";

const COLUMN_STACK_CLASS = "flex min-w-0 flex-col gap-3 md:gap-4";

/**
 * 비로그인 `/mypage` — 로그인 UI와 동일한 프로필·통계·메뉴 레이아웃.
 * 메뉴·통계 탭 시에만 로그인 모달(카톡·배민식).
 */
export function MyPageGuestHomeDashboard() {
  const { t } = useI18n();
  const pathname = usePathname() ?? "/mypage";
  const guestNav = useMypageGuestMenuNav();
  const addressesMenuHref = buildMypageAddressesHrefFromPath(pathname, "");

  const dash = t("mypage_comp_placeholder_dash");

  const statRows = useMemo(
    () => [
      { label: t("mypage_comp_stat_points"), value: dash, href: "/mypage/points", accent: true },
      { label: t("mypage_comp_stat_active_trade"), value: dash, href: buildMypageSectionHref("trade") },
      { label: t("mypage_comp_stat_orders"), value: dash, href: buildMypageSectionHref("store") },
      { label: t("mypage_comp_stat_unread_chat"), value: dash, href: buildMypageSectionHref("messenger") },
      { label: t("mypage_comp_stat_favorites_short"), value: dash, href: "/mypage/section/trade/favorites" },
    ],
    [t, dash],
  );

  return (
    <div className={MYPAGE_HOME_BODY_CLASS}>
      <div className="flex min-h-0 min-w-0 flex-col gap-3 sm:gap-4">
        <MyInfoGuestProfileCard nextHref={pathname || "/mypage"} />

        <MyInfoStatGrid items={statRows} onItemPress={guestNav} />

        <div className="flex flex-col gap-3 md:hidden">
          <MyInfoQuickAccessSection variant="icons" onItemPress={guestNav} />
          <MyInfoStoreMenuSection onItemPress={guestNav} />
          <MyInfoAccountMenuSection addressesMenuHref={addressesMenuHref} onItemPress={guestNav} />
          <MyInfoServiceMenuSection onItemPress={guestNav} />
          <MyInfoSupportMenuSection onItemPress={guestNav} />
        </div>

        <div className="hidden md:max-[1025px]:grid md:max-[1025px]:grid-cols-2 md:max-[1025px]:gap-4">
          <div className={COLUMN_STACK_CLASS}>
            <MyInfoQuickAccessSection variant="list" onItemPress={guestNav} />
            <MyInfoSupportMenuSection onItemPress={guestNav} />
            <MyInfoServiceMenuSection onItemPress={guestNav} />
          </div>
          <div className={COLUMN_STACK_CLASS}>
            <MyInfoStoreMenuSection onItemPress={guestNav} />
            <MyInfoAccountMenuSection addressesMenuHref={addressesMenuHref} onItemPress={guestNav} />
          </div>
        </div>

        <div className="hidden min-[1025px]:grid min-[1025px]:grid-cols-3 min-[1025px]:gap-4">
          <div className={COLUMN_STACK_CLASS}>
            <MyInfoQuickAccessSection variant="list" onItemPress={guestNav} />
            <MyInfoSupportMenuSection onItemPress={guestNav} />
          </div>
          <div className={COLUMN_STACK_CLASS}>
            <MyInfoStoreMenuSection onItemPress={guestNav} />
          </div>
          <div className={COLUMN_STACK_CLASS}>
            <MyInfoAccountMenuSection addressesMenuHref={addressesMenuHref} onItemPress={guestNav} />
            <MyInfoServiceMenuSection onItemPress={guestNav} />
          </div>
        </div>
      </div>
    </div>
  );
}
