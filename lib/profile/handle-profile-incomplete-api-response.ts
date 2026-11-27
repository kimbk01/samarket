"use client";

import { openPhoneVerificationRequiredSheet } from "@/lib/auth/phone-verification-required-client";
import { openProfileCompletionRequiredModal } from "@/lib/profile/profile-completion-modal-client";
import type { ProfileActionType, ProfileRequirementField } from "@/lib/profile/profile-requirements";
import type { MessageKey } from "@/lib/i18n/messages";

export type ProfileIncompleteApiPayload = {
  ok?: boolean;
  error?: string;
  code?: string;
  actionType?: ProfileActionType;
  missingFields?: ProfileRequirementField[];
};

/**
 * 반환 `error` = 코드(언어 재감사 2026-11-27). 화면 문구는 `errorKey`(`api_err_profile_incomplete`)를 `t()` 로 그린다.
 */
const PROFILE_INCOMPLETE_ERROR_CODE = "profile_incomplete";
const PROFILE_INCOMPLETE_ERROR_KEY: MessageKey = "api_err_profile_incomplete";

export function isProfileIncompleteApiPayload(
  data: ProfileIncompleteApiPayload | null | undefined
): data is ProfileIncompleteApiPayload & {
  actionType: ProfileActionType;
  missingFields: ProfileRequirementField[];
} {
  if (!data) return false;
  const codeHit =
    data.code === "profile_incomplete" || data.error === "profile_incomplete";
  return (
    codeHit &&
    typeof data.actionType === "string" &&
    Array.isArray(data.missingFields)
  );
}

/**
 * API 403 `profile_incomplete` — 모달 오픈 + 오류 코드·문구 키 반환.
 * 처리했으면 `{ handled: true, error }`, 아니면 `{ handled: false }`.
 */
export function handleProfileIncompleteApiResponse(
  data: ProfileIncompleteApiPayload | null | undefined,
  opts?: { returnTo?: string | null }
): { handled: true; error: string; errorKey: MessageKey } | { handled: false } {
  if (!isProfileIncompleteApiPayload(data)) {
    return { handled: false };
  }
  const returnTo =
    opts?.returnTo ??
    (typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : undefined);
  const missingFields = data.missingFields.filter((field) => field !== "dibay_id");
  const phoneOnly =
    missingFields.length > 0 &&
    missingFields.every((field) => field === "phone_verified" || field === "recipient_phone");
  if (phoneOnly) {
    openPhoneVerificationRequiredSheet({ next: returnTo ?? undefined });
  } else {
    openProfileCompletionRequiredModal({
      actionType: data.actionType,
      missingFields,
      next: returnTo ?? undefined,
    });
  }
  return { handled: true, error: PROFILE_INCOMPLETE_ERROR_CODE, errorKey: PROFILE_INCOMPLETE_ERROR_KEY };
}
