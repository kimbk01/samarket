/**
 * Outgoing / redial call failure UX — Dibay popup only (no bottom snackbar banner).
 */
import { dibayAlert } from "@/components/ui/dibay-overlay/DibayAppDialogProvider";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import { useMessengerSnackbarStore } from "@/lib/community-messenger/stores/messenger-snackbar-store";

export function outgoingCallStartFailedMessage(): string {
  return safeTranslate(getRuntimeAppLanguage(), "cm_ui_call_start_failed", {
    fallbackKo: "통화를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    fallbackEn: "Could not start the call. Please try again.",
  });
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
  return safeTranslate(getRuntimeAppLanguage(), "cm_ui_mic_permission_required", {
    fallbackKo: "마이크 권한이 필요합니다",
    fallbackEn: "Microphone access required",
  });
}

/** Clear any lingering bottom snackbar, then show canonical Dibay alert popup. */
export function alertOutgoingCallFailure(message: string): void {
  const text = message.trim();
  if (!text) return;
  try {
    useMessengerSnackbarStore.getState().dismiss();
  } catch {
    /* store may be unavailable outside client */
  }
  void dibayAlert({ title: text });
}
