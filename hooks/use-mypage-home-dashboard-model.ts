"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deriveProfileCompletionState,
  type ProfileCompletionState,
} from "@/lib/profile/profile-completion-state";
import { readMandatoryAddressGateNeedsBlock } from "@/lib/addresses/mandatory-address-gate-client";
import { hasVerifiedPhone, hasValidDisplayName } from "@/lib/auth/post-login-profile-policy";
import { evaluatePublicIdProfileView } from "@/lib/auth/dibay-public-id-ssot";
import type { ProfileRow } from "@/lib/profile/types";
import { dibayMyInfoPerfMark, dibayMyInfoPerfMaybeLogTotal } from "@/lib/runtime/dibay-myinfo-perf";
import { MYPAGE_ADDRESSES_HREF } from "@/lib/mypage/mypage-profile-routes";

export function useMypageHomeDashboardModel({
  profile,
  initialCompletion = null,
  onProfileRefresh,
}: {
  profile: ProfileRow;
  initialCompletion?: ProfileCompletionState | null;
  onProfileRefresh?: () => void;
}) {
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
    setCompletion((prev) => ({
      hasNickname: hasValidDisplayName(profile),
      hasDibayId: evaluatePublicIdProfileView(profile).setupComplete,
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

  useEffect(() => {
    dibayMyInfoPerfMark("profile_card_visible_ms", { surface: "mypage_root" });
    dibayMyInfoPerfMark("menu_visible_ms", { surface: "mypage_root" });
    dibayMyInfoPerfMaybeLogTotal({ surface: "mypage_root" });
  }, []);

  return {
    completion,
    addressesMenuHref: MYPAGE_ADDRESSES_HREF,
  };
}
