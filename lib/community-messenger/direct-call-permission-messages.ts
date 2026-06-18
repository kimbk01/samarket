/**
 * Client-safe direct call deny copy — API error code · deny code → i18n key.
 */

import type { DirectCallDenyCode } from "@/lib/community-messenger/direct-call-permission";
import { logCallPermission } from "@/lib/community-messenger/direct-call-permission";
import type { MessageKey } from "@/lib/i18n/messages";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";

export const DIRECT_CALL_DENY_MESSAGE_KEYS: Record<DirectCallDenyCode, MessageKey> = {
  deny_pending_friend: "cm_call_deny_pending_friend",
  deny_not_friend: "cm_call_deny_not_friend",
  deny_blocked: "cm_call_deny_blocked",
  deny_privacy: "cm_call_deny_privacy",
  deny_room_state_mismatch: "cm_call_deny_room_mismatch",
  deny_deleted_account: "cm_call_deny_room_mismatch",
  deny_group_room: "cm_call_deny_room_mismatch",
  deny_permission: "cm_ui_call_failed_permission_detail_voice",
};

export const DIRECT_CALL_API_ERROR_TO_DENY_CODE: Record<string, DirectCallDenyCode> = {
  call_denied_pending_friend: "deny_pending_friend",
  call_denied_not_friend: "deny_not_friend",
  call_denied_blocked: "deny_blocked",
  call_denied_privacy: "deny_privacy",
  call_denied_room_state: "deny_room_state_mismatch",
  call_denied_account: "deny_deleted_account",
  call_denied_group_room: "deny_group_room",
  call_denied_permission: "deny_permission",
  blocked_target: "deny_blocked",
};

export function resolveDirectCallDenyCodeFromApiError(error: string | null | undefined): DirectCallDenyCode | null {
  const code = typeof error === "string" ? error.trim() : "";
  if (!code) return null;
  return DIRECT_CALL_API_ERROR_TO_DENY_CODE[code] ?? null;
}

export function directCallDenyMessageKey(code: DirectCallDenyCode): MessageKey {
  return DIRECT_CALL_DENY_MESSAGE_KEYS[code];
}

const DIRECT_CALL_DENY_FALLBACKS: Record<
  DirectCallDenyCode,
  { fallbackKo: string; fallbackEn: string }
> = {
  deny_pending_friend: {
    fallbackKo: "친구 요청이 수락되면 통화할 수 있습니다.",
    fallbackEn: "You can call after the friend request is accepted.",
  },
  deny_not_friend: {
    fallbackKo: "친구만 통화할 수 있습니다.",
    fallbackEn: "Only friends can start a call.",
  },
  deny_blocked: {
    fallbackKo: "차단된 사용자와는 통화할 수 없습니다.",
    fallbackEn: "You cannot call a blocked user.",
  },
  deny_privacy: {
    fallbackKo: "상대방의 통화 설정으로 인해 연결할 수 없습니다.",
    fallbackEn: "The other person's call settings do not allow this call.",
  },
  deny_room_state_mismatch: {
    fallbackKo: "이 대화방 상태에서는 통화를 시작할 수 없습니다.",
    fallbackEn: "You cannot start a call in this room state.",
  },
  deny_deleted_account: {
    fallbackKo: "통화할 수 없는 계정입니다.",
    fallbackEn: "This account cannot receive calls.",
  },
  deny_group_room: {
    fallbackKo: "그룹 통화는 아직 지원하지 않습니다.",
    fallbackEn: "Group calls are not supported yet.",
  },
  deny_permission: {
    fallbackKo: "마이크 또는 카메라 권한이 필요합니다.",
    fallbackEn: "Microphone or camera permission is required.",
  },
};

export function resolveDirectCallDenyUserMessage(code: DirectCallDenyCode): string {
  const key = directCallDenyMessageKey(code);
  const fb = DIRECT_CALL_DENY_FALLBACKS[code];
  return safeTranslate(getRuntimeAppLanguage(), key, fb);
}

export function resolveDirectCallDenyUserMessageFromApiError(error: string | null | undefined): string | null {
  const code = resolveDirectCallDenyCodeFromApiError(error);
  if (!code) return null;
  logCallPermission("ui_gate_start", { code, apiError: error ?? undefined });
  return resolveDirectCallDenyUserMessage(code);
}
