import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

/** UX·저장 기반 권한 상태 머신 */
export type CallPermissionStoreState =
  | "unknown"
  | "granted_audio"
  | "granted_audio_video"
  | "denied_once"
  | "denied_permanently"
  | "system_revoked";

export type CallOsPermissionSnapshot = {
  microphone: "granted" | "denied" | "prompt" | "unknown";
  camera: "granted" | "denied" | "prompt" | "unknown";
};

export type CallPermissionCheckResult = {
  storeState: CallPermissionStoreState;
  os: CallOsPermissionSnapshot;
  /** OS check 우선 반영된 실효 상태 */
  effectiveState: CallPermissionStoreState;
  microphoneGranted: boolean;
  cameraGranted: boolean;
  canVoice: boolean;
  canVideo: boolean;
  /** 카메라만 없고 마이크는 있음 — 음성 전환 가능 */
  canFallbackToVoice: boolean;
  isPermanentlyDenied: boolean;
};

export type CallPermissionGateContext = "onboarding" | "outgoing" | "incoming";

export type CallPermissionRequireResult =
  | { ok: true; check: CallPermissionCheckResult }
  | {
      ok: false;
      check: CallPermissionCheckResult;
      reason: "microphone_required" | "camera_required" | "permanently_denied";
      canFallbackToVoice?: boolean;
    };

export function requiredPermissionsForKind(kind: CommunityMessengerCallKind): {
  microphone: boolean;
  camera: boolean;
} {
  return {
    microphone: true,
    camera: kind === "video",
  };
}
