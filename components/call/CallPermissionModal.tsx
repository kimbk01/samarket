"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import type { CallPermissionStoreState } from "@/lib/call/permissions/call-permission-types";
import { Sam } from "@/lib/ui/sam-component-classes";

export type CallPermissionModalMode =
  | "onboarding"
  | "outgoing_voice"
  | "outgoing_video"
  | "incoming_voice"
  | "incoming_video"
  | "camera_fallback";

export type CallPermissionModalProps = {
  mode: CallPermissionModalMode;
  effectiveState?: CallPermissionStoreState;
  onConfirm: () => void;
  onDecline: () => void;
  onOpenSettings?: () => void;
  onSwitchToVoice?: () => void;
};

function resolveTitleKey(mode: CallPermissionModalMode): MessageKey {
  if (mode === "onboarding") return "call_permission_modal_onboarding_title";
  if (mode === "camera_fallback") return "call_permission_modal_camera_title";
  return "call_permission_modal_title";
}

function resolveBodyKey(mode: CallPermissionModalMode): MessageKey {
  if (mode === "onboarding") return "call_permission_modal_onboarding_body";
  if (mode === "outgoing_video" || mode === "incoming_video") return "call_permission_modal_body_video";
  if (mode === "camera_fallback") return "call_permission_modal_camera_body";
  return "call_permission_modal_body_voice";
}

export function CallPermissionModal({
  mode,
  effectiveState,
  onConfirm,
  onDecline,
  onOpenSettings,
  onSwitchToVoice,
}: CallPermissionModalProps) {
  const { t: _t, safeT } = useI18n();
  const showSettings = effectiveState === "denied_permanently" || effectiveState === "system_revoked";
  const showVoiceFallback = mode === "camera_fallback" && typeof onSwitchToVoice === "function";

  return (
    <div
      className="fixed inset-0 z-[127] flex items-center justify-center bg-black/45 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dibay-call-permission-modal-title"
    >
      <div className="w-full max-w-sm rounded-ui-rect bg-sam-surface p-5 shadow-xl">
        <h2 id="dibay-call-permission-modal-title" className={`${Sam.text.sectionTitle} text-sam-fg`}>
          {safeT(resolveTitleKey(mode), {
            fallbackKo: "통화 권한 안내",
            fallbackEn: "Call permission",
          })}
        </h2>
        <p className={`mt-3 ${Sam.text.bodySecondary} leading-relaxed text-sam-muted`}>
          {safeT(resolveBodyKey(mode), {
            fallbackKo: "통화를 위해 마이크·카메라 권한이 필요합니다.",
            fallbackEn: "Microphone and camera access are required for calls.",
          })}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button type="button" className={`${Sam.btn.primaryCombo} ${Sam.btn.block} min-h-[48px]`} onClick={onConfirm}>
            {safeT("call_permission_modal_confirm", {
              fallbackKo: "권한 허용",
              fallbackEn: "Allow access",
            })}
          </button>
          {showVoiceFallback ? (
            <button
              type="button"
              className={`${Sam.btn.secondaryCombo} ${Sam.btn.block} min-h-[48px]`}
              onClick={onSwitchToVoice}
            >
              {safeT("call_permission_modal_switch_voice", {
                fallbackKo: "음성통화로 전환",
                fallbackEn: "Switch to voice call",
              })}
            </button>
          ) : null}
          {showSettings && onOpenSettings ? (
            <button
              type="button"
              className={`${Sam.btn.secondaryCombo} ${Sam.btn.block} min-h-[48px]`}
              onClick={onOpenSettings}
            >
              {safeT("call_permission_modal_open_settings", {
                fallbackKo: "설정에서 허용",
                fallbackEn: "Open settings",
              })}
            </button>
          ) : null}
          <button type="button" className={`${Sam.btn.ghostCombo} ${Sam.btn.block} min-h-[44px]`} onClick={onDecline}>
            {safeT("call_permission_modal_later", {
              fallbackKo: "나중에",
              fallbackEn: "Not now",
            })}
          </button>
        </div>
      </div>
    </div>
  );
}

export function resolveCallPermissionModalMode(input: {
  context: "onboarding" | "outgoing" | "incoming";
  kind: CommunityMessengerCallKind;
  cameraFallback?: boolean;
}): CallPermissionModalMode {
  if (input.cameraFallback) return "camera_fallback";
  if (input.context === "onboarding") return "onboarding";
  if (input.context === "outgoing") return input.kind === "video" ? "outgoing_video" : "outgoing_voice";
  return input.kind === "video" ? "incoming_video" : "incoming_voice";
}
