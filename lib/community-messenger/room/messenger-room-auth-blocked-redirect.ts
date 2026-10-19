"use client";

import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import { isPhoneVerificationRequiredApiPayload } from "@/lib/auth/phone-verification-required-detect";
import { openPhoneVerificationRequiredSheet } from "@/lib/auth/phone-verification-required-client";
import { pickMessengerApiErrorField } from "@/lib/community-messenger/room/messenger-room-action-error-messages";
import { openProfileCompletionRequiredModal } from "@/lib/profile/profile-completion-modal-client";
import {
  ACTION_PROFILE_REQUIREMENTS,
  type ProfileActionType,
  type ProfileRequirementField,
} from "@/lib/profile/profile-requirements";

export type MessengerRoomAuthRouterLike = { push: (href: string) => void };

/**
 * 메신저 방 API 실패 시 로그인·전화 인증 필요 응답이면 스낵바 대신 전역 다이얼로그/이동 처리.
 */
export function tryRedirectMessengerRoomAuthBlocked(
  router: MessengerRoomAuthRouterLike,
  res: Response,
  json: { error?: unknown; code?: unknown; actionType?: unknown; missingFields?: unknown },
  opts: { pathname: string; streamRoomId?: string | null }
): boolean {
  const picked = pickMessengerApiErrorField(json);
  const errText =
    picked ||
    (typeof json.error === "string" && json.error.trim() ? json.error.trim() : "") ||
    (res.status === 401 ? "로그인이 필요합니다." : "");
  const path = (opts.pathname ?? "").trim();
  const next =
    path.startsWith("/community-messenger") && path.length > 0
      ? `${path}${typeof window !== "undefined" ? window.location.search : ""}`
      : opts.streamRoomId?.trim()
        ? `/community-messenger/rooms/${encodeURIComponent(opts.streamRoomId.trim())}`
        : "/community-messenger";
  /**
   * `requireProfileFieldsForAction` 403 `profile_incomplete` — 전화 미인증이면 전화 인증 시트,
   * 그 외 누락(표시 이름 등)은 프로필 완성 모달로 유도한다. (기본 「작업 실패」 스낵바로 떨어지지 않게)
   */
  if (picked === "profile_incomplete") {
    const missingFields = readProfileMissingFields(json.missingFields);
    if (missingFields.length === 0 || missingFields.every(isPhoneField)) {
      openPhoneVerificationRequiredSheet({ next });
      return true;
    }
    openProfileCompletionRequiredModal({
      actionType: readProfileActionType(json.actionType),
      missingFields,
      next,
    });
    return true;
  }
  if (isPhoneVerificationRequiredApiPayload(json)) {
    return redirectForBlockedAction(router, "PHONE_VERIFICATION_REQUIRED", next);
  }
  return redirectForBlockedAction(router, errText || undefined, next);
}

const PROFILE_REQUIREMENT_FIELDS: readonly ProfileRequirementField[] = [
  "display_name",
  "phone_verified",
  "dibay_id",
  "default_address",
  "recipient_phone",
];

function isPhoneField(field: ProfileRequirementField): boolean {
  return field === "phone_verified" || field === "recipient_phone";
}

function readProfileMissingFields(raw: unknown): ProfileRequirementField[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((f): f is ProfileRequirementField =>
    PROFILE_REQUIREMENT_FIELDS.includes(f as ProfileRequirementField)
  );
}

function readProfileActionType(raw: unknown): ProfileActionType {
  return typeof raw === "string" && raw in ACTION_PROFILE_REQUIREMENTS
    ? (raw as ProfileActionType)
    : "messenger_send_message";
}
