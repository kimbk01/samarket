"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";
import { isClientSignupComplete } from "@/lib/auth/client-signup-gate";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { evaluatePublicIdProfileView } from "@/lib/auth/dibay-public-id-ssot";
import { buildAddressEditHref, buildDibayIdHref } from "@/lib/auth/client-access-flow";
import { useMyFavoriteCount } from "@/hooks/useMyFavoriteCount";
import { useOwnerHubBadgeBreakdown } from "@/lib/chats/use-owner-hub-badge-total";
import { resolveUnifiedChatUnreadHintForDashboard } from "@/lib/notifications/samarket-messenger-notification-regulations";
import { resolveProfileLocationAddressLines } from "@/lib/profile/profile-location";
import { resolveDisplayName } from "@/lib/users/user-label";
import { useRepresentativeAddressPresentation } from "@/hooks/use-representative-address-line";
import {
  buildMypageHomeStatRows,
  resolveActiveTradeCount,
  type MypageHomeStatRow,
} from "@/lib/mypage/mypage-home-stat-config";
import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-mobile-nav-registry";
import type { MyPageOverviewCounts } from "@/components/mypage/types";
import type { ProfileRow } from "@/lib/profile/types";
import type { MyPageHomeDashboardCounts } from "@/lib/my/types";
import { dibayMyInfoPerfMark, dibayMyInfoPerfMaybeLogTotal } from "@/lib/runtime/dibay-myinfo-perf";
import {
  deriveProfileCompletionState,
  type ProfileCompletionState,
} from "@/lib/profile/profile-completion-state";
import { readMandatoryAddressGateNeedsBlock } from "@/lib/addresses/mandatory-address-gate-client";
import { hasVerifiedPhone, hasValidDisplayName } from "@/lib/auth/post-login-profile-policy";
import { isPublicIdSetupComplete } from "@/lib/auth/dibay-public-id-ssot";
import { useMypageProfileSheets } from "@/components/mypage/profile-settings/mypage-profile-sheets-context";

export type MypageHomeDashboardModelInput = {
  profile: ProfileRow;
  overviewCounts: MyPageOverviewCounts;
  homeDashboardCounts?: MyPageHomeDashboardCounts | null;
  addressDefaultsSnapshot?: AddressDefaultsSnapshot | null;
  initialCompletion?: ProfileCompletionState | null;
  onProfileRefresh?: () => void;
};

export function useMypageHomeDashboardModel({
  profile,
  overviewCounts,
  homeDashboardCounts = null,
  addressDefaultsSnapshot = null,
  initialCompletion = null,
  onProfileRefresh,
}: MypageHomeDashboardModelInput) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const router = useRouter();
  const { openSheet, setOnProfileUpdated } = useMypageProfileSheets();

  const [completion, setCompletion] = useState<ProfileCompletionState>(
    () =>
      initialCompletion ??
      deriveProfileCompletionState(profile, { hasDefaultAddress: false }),
  );

  const refreshCompletion = useCallback(async () => {
    const needsBlock = await readMandatoryAddressGateNeedsBlock();
    setCompletion(
      deriveProfileCompletionState(profile, {
        hasDefaultAddress: !needsBlock,
      }),
    );
    onProfileRefresh?.();
  }, [profile, onProfileRefresh]);

  useEffect(() => {
    setOnProfileUpdated(() => {
      void refreshCompletion();
    });
  }, [setOnProfileUpdated, refreshCompletion]);

  useEffect(() => {
    setCompletion((prev) => ({
      hasNickname: hasValidDisplayName(profile),
      hasDibayId: isPublicIdSetupComplete(profile),
      hasVerifiedPhone: hasVerifiedPhone(profile),
      hasDefaultAddress: prev.hasDefaultAddress,
    }));
  }, [profile]);

  useEffect(() => {
    if (initialCompletion) {
      setCompletion(initialCompletion);
      return;
    }
    void refreshCompletion();
  }, [initialCompletion, refreshCompletion]);

  const formatCount = useCallback(
    (n: number | null | undefined): string => {
      if (n == null || Number.isNaN(n)) return t("mypage_comp_placeholder_dash");
      if (n > 99) return t("mypage_comp_stat_overflow_99plus");
      return String(n);
    },
    [t],
  );

  const initialFavoriteTotal =
    homeDashboardCounts?.tradeFavoriteCount != null ||
    homeDashboardCounts?.storeFavoriteCount != null
      ? Math.max(
          0,
          (homeDashboardCounts?.tradeFavoriteCount ?? 0) + (homeDashboardCounts?.storeFavoriteCount ?? 0),
        )
      : null;

  const { count: favoriteCount } = useMyFavoriteCount({
    initialTotal: initialFavoriteTotal,
    initialTrade: homeDashboardCounts?.tradeFavoriteCount ?? null,
    initialStore: homeDashboardCounts?.storeFavoriteCount ?? null,
  });

  const ownerHub = useOwnerHubBadgeBreakdown();
  const orderCount = homeDashboardCounts?.storeOrderCount ?? null;

  const signupComplete = useMemo(
    () => isClientSignupComplete(profileRowToClientProfile(profile)),
    [profile],
  );

  const representativeAddressPresentation = useRepresentativeAddressPresentation({
    initialSnapshot: signupComplete ? addressDefaultsSnapshot : null,
  });

  useEffect(() => {
    dibayMyInfoPerfMark("profile_card_visible_ms", { surface: "mypage_root" });
    dibayMyInfoPerfMark("menu_visible_ms", { surface: "mypage_root" });
    dibayMyInfoPerfMaybeLogTotal({ surface: "mypage_root" });
  }, []);

  const profileAddressLine = signupComplete
    ? resolveProfileLocationAddressLines(profile).join(" · ").trim()
    : "";

  const addressFallbackLine = signupComplete
    ? representativeAddressPresentation.status === "loading"
      ? profileAddressLine || t("mypage_comp_address_loading")
      : t("mypage_comp_address_empty")
    : t("mypage_comp_address_empty");

  const displayName = resolveDisplayName(profile) || t("mypage_comp_display_name_empty");
  const publicIdView = evaluatePublicIdProfileView(profile);
  const atUsername = publicIdView.atDisplay;
  const usernameSlug = (profile.username ?? profile.dibay_id ?? "").trim().toLowerCase();
  const publicProfileHref = usernameSlug ? `/u/${encodeURIComponent(usernameSlug)}` : null;

  const profileEditReturnNext = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");
  const addressesMenuHref = "/mypage?sheet=address";

  const addressReady =
    signupComplete &&
    representativeAddressPresentation.status === "ready" &&
    Boolean(representativeAddressPresentation.presentation);

  const addressEmpty =
    signupComplete &&
    representativeAddressPresentation.status === "ready" &&
    !representativeAddressPresentation.presentation &&
    !profileAddressLine;

  const statRows: MypageHomeStatRow[] = useMemo(
    () =>
      buildMypageHomeStatRows({
        values: {
          points: profile.points != null ? String(profile.points) : t("mypage_comp_placeholder_dash"),
          activeTrade: resolveActiveTradeCount(overviewCounts.purchases, overviewCounts.sales),
          orderCount,
          unreadChat: resolveUnifiedChatUnreadHintForDashboard(ownerHub),
          favoriteCount,
        },
        formatCount,
        labelForKey: (key) => t(key),
      }),
    [
      profile.points,
      overviewCounts.purchases,
      overviewCounts.sales,
      orderCount,
      favoriteCount,
      ownerHub,
      formatCount,
      t,
    ],
  );

  useEffect(() => {
    const sheet = searchParams.get("sheet")?.trim();
    if (!sheet) return;
    if (sheet === "settings") openSheet("settings");
    else if (sheet === "profile-edit") openSheet("profile-edit");
    else if (sheet === "dibay-id") openSheet("dibay-id");
    else if (sheet === "phone") openSheet("phone");
    else if (sheet === "address") openSheet("address");
    router.replace("/mypage", { scroll: false });
  }, [searchParams, openSheet, router]);

  const addressPresentation =
    addressReady && representativeAddressPresentation.status === "ready"
      ? representativeAddressPresentation.presentation
      : null;

  return useMemo(
    () => ({
      miniProfile: {
        avatarUrl: profile.avatar_url,
        displayName,
        atUsername,
        publicProfileHref,
        onSettingsPress: () => openSheet("settings"),
      },
      completion,
      statRows,
      addressesMenuHref,
      profileCard: {
        avatarUrl: profile.avatar_url,
        displayName,
        atUsername,
        dibayIdIncomplete: signupComplete && !publicIdView.setupComplete,
        dibayIdSetupHref: buildDibayIdHref(profileEditReturnNext),
        addressPresentation,
        addressFallbackLine: addressReady ? profileAddressLine : addressFallbackLine,
        addressEmpty,
        addressEditHref: buildAddressEditHref(profileEditReturnNext),
        editHref: MYPAGE_PROFILE_EDIT_HREF,
      },
      openDibayIdSheet: () => openSheet("dibay-id"),
      openPhoneSheet: () => openSheet("phone"),
      openAddress: () => openSheet("address"),
      openProfileEditSheet: () => openSheet("profile-edit"),
    }),
    [
      profile.avatar_url,
      displayName,
      atUsername,
      publicProfileHref,
      completion,
      statRows,
      addressesMenuHref,
      signupComplete,
      publicIdView.setupComplete,
      profileEditReturnNext,
      addressReady,
      addressPresentation,
      profileAddressLine,
      addressFallbackLine,
      addressEmpty,
      openSheet,
    ],
  );
}
