/**
 * Outgoing / redial call failure UX — canonical Call in-app notice (not Dibay modal / snackbar).
 */
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import {
  resolveCallInAppNoticeMessage,
  showCallInAppNoticeFromFailureMessage,
} from "@/lib/community-messenger/stores/call-in-app-notice-store";

export function outgoingCallStartFailedMessage(): string {
  return resolveCallInAppNoticeMessage("call_failed");
}

export function outgoingCallVoiceOnlyMessage(): string {
  return safeTranslate(getRuntimeAppLanguage(), "cm_ui_call_voice_only_available");
}

export function outgoingCallMediaPermissionMessage(kind: "voice" | "video"): string {
  if (kind === "video") {
    return safeTranslate(getRuntimeAppLanguage(), "cm_ui_mic_camera_permission_required");
  }
  return resolveCallInAppNoticeMessage("permission_required");
}

/** Canonical Call notice — replaces Dibay alert popup for outgoing call failures. */
export function alertOutgoingCallFailure(message: string): void {
  showCallInAppNoticeFromFailureMessage(message);
}
