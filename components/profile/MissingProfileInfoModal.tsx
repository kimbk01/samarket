"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ProfileGateAlertDialog } from "@/components/auth/ProfileGateAlertDialog";
import {
  DIBAY_PROFILE_COMPLETION_REQUIRED_EVENT,
  buildProfileEditHref,
  type ProfileCompletionRequiredDetail,
} from "@/lib/profile/profile-completion-modal-client";
import { dismissPendingAuthAction } from "@/lib/auth/require-auth-action";
import { buildAddressEditHref, buildPhoneVerificationHref } from "@/lib/auth/client-access-flow";
import { MYPAGE_MAIN_HREF } from "@/lib/my/mypage-info-hub";
import type { ProfileRequirementField } from "@/lib/profile/profile-requirements";

function withoutHandle(fields: ProfileRequirementField[]): ProfileRequirementField[] {
  return fields.filter((field) => field !== "dibay_id");
}

function hasPhoneMissing(fields: ProfileRequirementField[]): boolean {
  return fields.includes("phone_verified") || fields.includes("recipient_phone");
}

function hasAddressMissing(fields: ProfileRequirementField[]): boolean {
  return fields.includes("default_address");
}

/**
 * ACTION 미충족 안내. @아이디는 목록에 넣지 않는다.
 * Overlay SSOT via ProfileGateAlertDialog → DibayDialog (no local modal chrome).
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
      const missingFields = withoutHandle(ce.detail.missingFields);
      if (missingFields.length === 0) return;
      setDetail({ ...ce.detail, missingFields });
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

  const returnTo =
    detail?.next?.trim() ||
    `${pathname}${typeof window !== "undefined" ? window.location.search : ""}`;

  const missing = detail ? withoutHandle(detail.missingFields) : [];
  const phoneMissing = hasPhoneMissing(missing);
  const addressMissing = hasAddressMissing(missing);
  const displayNameMissing = missing.includes("display_name");
  const phoneOnly =
    phoneMissing &&
    !addressMissing &&
    !displayNameMissing &&
    missing.every((f) => f === "phone_verified" || f === "recipient_phone");
  const addressOnly =
    addressMissing && !phoneMissing && !displayNameMissing && missing.every((f) => f === "default_address");
  const displayNameOnly =
    displayNameMissing && !phoneMissing && !addressMissing && missing.every((f) => f === "display_name");

  const goPrimary = useCallback(() => {
    if (phoneOnly) {
      router.push(buildPhoneVerificationHref(returnTo));
    } else if (addressOnly) {
      router.push(buildAddressEditHref(returnTo));
    } else if (displayNameOnly) {
      router.push(buildProfileEditHref({ required: missing, returnTo }));
    } else {
      router.push(`${MYPAGE_MAIN_HREF}?returnTo=${encodeURIComponent(returnTo)}`);
    }
    close();
  }, [addressOnly, close, displayNameOnly, missing, phoneOnly, returnTo, router]);

  const onLater = useCallback(() => {
    if (detail?.token) {
      dismissPendingAuthAction(detail.token);
    }
    close();
  }, [detail, close]);

  if (!open || !detail) return null;

  const missingItemLabels = [
    displayNameMissing
      ? safeT("profile_gate_item_display_name", {
          fallbackKo: "프로필 이름 설정 필요",
          fallbackEn: "Display name needed",
        })
      : null,
    phoneMissing
      ? safeT("profile_gate_item_phone", {
          fallbackKo: "전화번호 인증 필요",
          fallbackEn: "Phone verification needed",
        })
      : null,
    addressMissing
      ? safeT("profile_gate_item_address", {
          fallbackKo: "기본주소 등록 필요",
          fallbackEn: "Default address needed",
        })
      : null,
  ].filter((label): label is string => Boolean(label));

  const title = phoneOnly
    ? safeT("profile_gate_title_phone", {
        fallbackKo: "전화번호 인증이 필요합니다",
        fallbackEn: "Phone verification required",
      })
    : addressOnly
      ? safeT("profile_gate_title_address", {
          fallbackKo: "기본 주소 등록이 필요합니다",
          fallbackEn: "Default address required",
        })
      : displayNameOnly
        ? safeT("profile_gate_title_display_name", {
            fallbackKo: "프로필 이름 설정이 필요합니다",
            fallbackEn: "Display name required",
          })
        : safeT("profile_gate_title_mixed", {
            fallbackKo: "이 기능을 사용하려면 아래 정보를 완료해 주세요",
            fallbackEn: "Complete the information below to use this feature",
          });

  const description = phoneOnly
    ? safeT("profile_gate_body_phone", {
        fallbackKo: "이 기능을 사용하려면 전화번호 인증이 필요합니다.",
        fallbackEn: "Phone verification is required to use this feature.",
      })
    : addressOnly
      ? safeT("profile_gate_body_address", {
          fallbackKo: "이 기능을 사용하려면 기본 주소를 등록해 주세요.",
          fallbackEn: "A default address is required to use this feature.",
        })
      : displayNameOnly
        ? safeT("profile_gate_body_display_name", {
            fallbackKo: "이 기능을 사용하려면 프로필 이름을 설정해 주세요.",
            fallbackEn: "Set a display name to use this feature.",
          })
        : missingItemLabels.join(" · ");

  const primaryLabel = phoneOnly
    ? safeT("profile_gate_cta_phone", { fallbackKo: "전화번호 인증", fallbackEn: "Verify phone" })
    : addressOnly
      ? safeT("profile_gate_cta_address", { fallbackKo: "주소 등록", fallbackEn: "Add address" })
      : displayNameOnly
        ? safeT("profile_gate_cta_display_name", { fallbackKo: "이름 설정", fallbackEn: "Set name" })
        : safeT("profile_completion_go_mypage", {
            fallbackKo: "내정보에서 확인",
            fallbackEn: "Open My Info",
          });

  return (
    <ProfileGateAlertDialog
      open={open}
      titleId="profile-completion-title"
      descId="profile-completion-desc"
      title={title}
      description={description}
      primaryLabel={primaryLabel}
      onPrimary={goPrimary}
      secondaryLabel={safeT("common_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" })}
      onSecondary={onLater}
    />
  );
}
