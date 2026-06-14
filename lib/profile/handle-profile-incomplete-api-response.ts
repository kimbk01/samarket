"use client";

import { openProfileCompletionRequiredModal } from "@/lib/profile/profile-completion-modal-client";
import type { ProfileActionType, ProfileRequirementField } from "@/lib/profile/profile-requirements";

export type ProfileIncompleteApiPayload = {
  ok?: boolean;
  error?: string;
  code?: string;
  actionType?: ProfileActionType;
  missingFields?: ProfileRequirementField[];
};

const PROFILE_INCOMPLETE_USER_MESSAGE = "프로필 정보를 먼저 완성해 주세요.";

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
 * API 403 `profile_incomplete` — 모달 오픈 + 사용자 문장 반환.
 * 처리했으면 `{ handled: true, error }`, 아니면 `{ handled: false }`.
 */
export function handleProfileIncompleteApiResponse(
  data: ProfileIncompleteApiPayload | null | undefined,
  opts?: { returnTo?: string | null }
): { handled: true; error: string } | { handled: false } {
  if (!isProfileIncompleteApiPayload(data)) {
    return { handled: false };
  }
  const returnTo =
    opts?.returnTo ??
    (typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : undefined);
  openProfileCompletionRequiredModal({
    actionType: data.actionType,
    missingFields: data.missingFields,
    next: returnTo ?? undefined,
  });
  return { handled: true, error: PROFILE_INCOMPLETE_USER_MESSAGE };
}
