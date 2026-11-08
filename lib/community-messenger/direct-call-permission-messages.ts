/**
 * Client-safe direct call deny copy — API error code · deny code → i18n key.
 */

import type { DirectCallDenyCode } from "@/lib/community-messenger/direct-call-permission";
import { logCallPermission } from "@/lib/community-messenger/direct-call-permission";
import type { MessageKey } from "@/lib/i18n/messages";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";

export const DIRECT_CALL_DENY_MESSAGE_KEYS: Record<DirectCallDenyCode, MessageKey> = {
  deny_blocked: "cm_call_deny_blocked",
  deny_privacy: "cm_call_deny_privacy",
  deny_room_state_mismatch: "cm_call_deny_room_mismatch",
  deny_deleted_account: "cm_call_deny_room_mismatch",
  deny_group_room: "cm_call_deny_room_mismatch",
  deny_permission: "cm_ui_call_failed_permission_detail_voice",
  deny_peer_rejected: "cm_call_deny_peer_rejected",
};

/** 레거시 API error → deny code (구 friends_only 거부 코드 포함) */
export const DIRECT_CALL_API_ERROR_TO_DENY_CODE: Record<string, DirectCallDenyCode> = {
  call_denied_blocked: "deny_blocked",
  call_denied_privacy: "deny_privacy",
  call_denied_room_state: "deny_room_state_mismatch",
  call_denied_account: "deny_deleted_account",
  call_denied_group_room: "deny_group_room",
  call_denied_permission: "deny_permission",
  call_denied_peer_rejected: "deny_peer_rejected",
  call_denied_pending_friend: "deny_privacy",
  call_denied_not_friend: "deny_privacy",
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

export function resolveDirectCallDenyUserMessage(code: DirectCallDenyCode): string {
  const key = directCallDenyMessageKey(code);
  return safeTranslate(getRuntimeAppLanguage(), key);
}

export function resolveDirectCallDenyUserMessageFromApiError(error: string | null | undefined): string | null {
  const code = resolveDirectCallDenyCodeFromApiError(error);
  if (!code) return null;
  logCallPermission("ui_gate_start", { code, apiError: error ?? undefined });
  return resolveDirectCallDenyUserMessage(code);
}
