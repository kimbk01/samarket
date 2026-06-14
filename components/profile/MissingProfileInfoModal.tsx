"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ProfileGateAlertDialog } from "@/components/auth/ProfileGateAlertDialog";
import {
  DIBAY_PROFILE_COMPLETION_REQUIRED_EVENT,
  buildProfileEditHref,
  modalVariantForAction,
  type ProfileCompletionRequiredDetail,
} from "@/lib/profile/profile-completion-modal-client";
import { dismissPendingAuthAction } from "@/lib/auth/require-auth-action";
import type { ProfileCompletionModalVariant, ProfileActionType } from "@/lib/profile/profile-requirements";
import { buildRequiredQuery } from "@/lib/profile/profile-requirements";

function titleKey(variant: ProfileCompletionModalVariant): string {
  switch (variant) {
    case "community":
      return "profile_completion_title_community";
    case "trade":
      return "profile_completion_title_trade";
    case "messenger":
      return "profile_completion_title_messenger";
    case "delivery":
      return "profile_completion_title_delivery";
    case "owner":
      return "profile_completion_title_owner";
    default:
      return "profile_completion_title_generic";
  }
}

function bodyKey(variant: ProfileCompletionModalVariant, actionType?: ProfileActionType): string {
  if (actionType === "messenger_add_friend") {
    return "profile_completion_body_messenger_add_friend";
  }
  switch (variant) {
    case "community":
      return "profile_completion_body_community";
    case "trade":
      return "profile_completion_body_trade";
    case "messenger":
      return "profile_completion_body_messenger";
    case "delivery":
      return "profile_completion_body_delivery";
    case "owner":
      return "profile_completion_body_owner";
    default:
      return "profile_completion_body_generic";
  }
}

function secondaryKey(variant: ProfileCompletionModalVariant): string {
  if (variant === "community" || variant === "messenger") {
    return "profile_completion_later";
  }
  return "common_cancel";
}

/**
 * 기능별 프로필 미완 안내 — AuthGateOverlay + ProfileGateAlertDialog 로 로그인 게이트와 동일 셸.
 */
export function MissingProfileInfoModal() {
  const { safeT } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ProfileCompletionRequiredDetail | null>(null);

  useEffect(() => {
    const onReq = (ev: Event) => {
      const ce = ev as CustomEvent<ProfileCompletionRequiredDetail>;
      if (!ce.detail?.actionType) return;
      setDetail(ce.detail);
      setOpen(true);
    };
    window.addEventListener(DIBAY_PROFILE_COMPLETION_REQUIRED_EVENT, onReq as EventListener);
    return () =>
      window.removeEventListener(DIBAY_PROFILE_COMPLETION_REQUIRED_EVENT, onReq as EventListener);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setDetail(null);
  }, []);

  const goProfile = useCallback(() => {
    if (!detail) return;
    const returnTo =
      detail.next?.trim() ||
      `${pathname}${typeof window !== "undefined" ? window.location.search : ""}`;
    const href = buildProfileEditHref({
      required: buildRequiredQuery(detail.missingFields),
      returnTo,
    });
    router.push(href);
    close();
  }, [router, pathname, detail, close]);

  const onLater = useCallback(() => {
    if (detail?.token) {
      dismissPendingAuthAction(detail.token);
    }
    close();
  }, [detail, close]);

  if (!open || !detail) return null;

  const variant = modalVariantForAction(detail.actionType);

  return (
    <ProfileGateAlertDialog
      open={open}
      titleId="profile-completion-title"
      descId="profile-completion-desc"
      title={safeT(titleKey(variant) as never, {
        fallbackKo: "프로필 정보가 필요합니다",
        fallbackEn: "Profile information required",
      })}
      description={safeT(bodyKey(variant, detail.actionType) as never, {
        fallbackKo: "이 기능을 사용하려면 내정보에서 필요한 항목을 설정해 주세요.",
        fallbackEn: "Please set up the required items in My Info to use this feature.",
      })}
      primaryLabel={safeT("profile_completion_go_mypage", {
        fallbackKo: "내정보에서 설정하기",
        fallbackEn: "Set up in My Info",
      })}
      onPrimary={goProfile}
      secondaryLabel={safeT(secondaryKey(variant) as never, {
        fallbackKo: variant === "community" || variant === "messenger" ? "나중에" : "취소",
        fallbackEn: variant === "community" || variant === "messenger" ? "Later" : "Cancel",
      })}
      onSecondary={onLater}
    />
  );
}
