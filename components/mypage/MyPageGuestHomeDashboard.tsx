"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MYPAGE_HOME_BODY_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";
import { MYPAGE_HOME_MENU_FLOW_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";
import { MyInfoGuestProfileCard } from "@/components/mypage/myinfo/MyInfoGuestProfileCard";
import { MyInfoStatGrid } from "@/components/mypage/myinfo/MyInfoStatGrid";
import { MyInfoQuickAccessSection } from "@/components/mypage/myinfo/MyInfoQuickAccessSection";
import {
  MyInfoAccountMenuSection,
  MyInfoDangerMenuSection,
  MyInfoPolicyMenuSection,
  MyInfoServiceMenuSection,
  MyInfoStoreMenuSection,
  MyInfoSupportMenuSection,
} from "@/components/mypage/myinfo/MyInfoHomeMenuSections";
import { useMypageGuestMenuNav } from "@/hooks/use-mypage-guest-menu-nav";
import { buildMypageAddressesHrefFromPath } from "@/lib/addresses/mypage-addresses-return-to";
import { buildMypageHomeStatRows } from "@/lib/mypage/mypage-home-stat-config";

/**
 * 비로그인 `/mypage` — 로그인과 동일 1열 behavior-flow (grid catalog 금지).
 */
export function MyPageGuestHomeDashboard() {
  const { t } = useI18n();
  const pathname = usePathname() ?? "/mypage";
  const guestNav = useMypageGuestMenuNav();
  const addressesMenuHref = buildMypageAddressesHrefFromPath(pathname, "");

  const dash = t("mypage_comp_placeholder_dash");

  const statRows = useMemo(
    () =>
      buildMypageHomeStatRows({
        values: {
          points: dash,
          activeTrade: null,
          orderCount: null,
          unreadChat: null,
          favoriteCount: null,
        },
        formatCount: () => dash,
        labelForKey: (key) => t(key),
      }),
    [t, dash],
  );

  return (
    <div className={MYPAGE_HOME_BODY_CLASS} data-mypage-ia="legacy-flow-guest">
      <div className={MYPAGE_HOME_MENU_FLOW_CLASS}>
        <MyInfoGuestProfileCard nextHref={pathname || "/mypage"} />
        <MyInfoStatGrid items={statRows} onItemPress={guestNav} />
        <MyInfoQuickAccessSection variant="icons" onItemPress={guestNav} />
        <MyInfoStoreMenuSection onItemPress={guestNav} />
        <MyInfoAccountMenuSection addressesMenuHref={addressesMenuHref} onItemPress={guestNav} />
        <MyInfoServiceMenuSection onItemPress={guestNav} />
        <MyInfoSupportMenuSection onItemPress={guestNav} />
        <MyInfoPolicyMenuSection onItemPress={guestNav} />
        <MyInfoDangerMenuSection onItemPress={guestNav} />
      </div>
    </div>
  );
}
