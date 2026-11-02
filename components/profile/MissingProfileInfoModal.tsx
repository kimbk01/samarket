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
    ? safeT("popup_q_verify_phone", {
        fallbackKo: "전화번호를 인증할까요?",
        fallbackEn: "Verify your phone number?",
      })
    : addressOnly
      ? safeT("popup_q_register_address", {
          fallbackKo: "기본 주소를 등록할까요?",
          fallbackEn: "Add your main address?",
        })
      : displayNameOnly
        ? safeT("popup_q_set_profile_name", {
            fallbackKo: "프로필 이름을 설정할까요?",
            fallbackEn: "Set your profile name?",
          })
        : safeT("popup_q_fill_required_info", {
            fallbackKo: "필요한 정보를 입력할까요?",
            fallbackEn: "Fill in the required info?",
          });

  const description = phoneOnly || addressOnly || displayNameOnly ? undefined : missingItemLabels.join(" · ");

  const primaryLabel = phoneOnly
    ? safeT("popup_btn_verify", { fallbackKo: "인증하기", fallbackEn: "Verify" })
    : addressOnly
      ? safeT("popup_btn_register_address", { fallbackKo: "주소 등록", fallbackEn: "Add address" })
      : displayNameOnly
        ? safeT("popup_btn_set_name", { fallbackKo: "이름 설정", fallbackEn: "Set name" })
        : safeT("popup_btn_go_my_info", {
            fallbackKo: "내정보로 이동",
            fallbackEn: "Go to My info",
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
