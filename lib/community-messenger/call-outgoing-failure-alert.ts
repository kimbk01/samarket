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
  return safeTranslate(getRuntimeAppLanguage(), "cm_ui_call_voice_only_available", {
    fallbackKo: "지금은 음성 통화만 사용할 수 있습니다.",
    fallbackEn: "Only voice calls are available right now.",
  });
}

export function outgoingCallMediaPermissionMessage(kind: "voice" | "video"): string {
  if (kind === "video") {
    return safeTranslate(getRuntimeAppLanguage(), "cm_ui_mic_camera_permission_required", {
      fallbackKo: "마이크·카메라 권한이 필요합니다",
      fallbackEn: "Microphone and camera access required",
    });
  }
  return resolveCallInAppNoticeMessage("permission_required");
}

/** Canonical Call notice — replaces Dibay alert popup for outgoing call failures. */
export function alertOutgoingCallFailure(message: string): void {
  showCallInAppNoticeFromFailureMessage(message);
}
