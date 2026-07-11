import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { callPermissionGate } from "@/lib/call/permissions/call-permission-gate";
import {
  isCallMediaGrantedSync,
  openDevicePermissionSettings,
  type DibayDevicePermissionState,
} from "@/lib/permissions/dibay-device-permission-store";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate } from "@/lib/i18n/messages";

export type CallMediaPermissionPreflightResult =
  | { ok: true; state: DibayDevicePermissionState }
  | {
      ok: false;
      reason: "permission_denied" | "permission_blocked" | "permission_unknown";
      state: DibayDevicePermissionState;
    };

function mapGateOsToDeviceState(check: Awaited<ReturnType<typeof callPermissionGate.check>>): DibayDevicePermissionState {
  const mapMic =
    check.os.microphone === "granted"
      ? "granted"
      : check.os.microphone === "permanently_denied"
        ? "denied"
        : "unknown";
  const mapCam =
    check.os.camera === "granted"
      ? "granted"
      : check.os.camera === "permanently_denied"
        ? "denied"
        : "unknown";
  return {
    microphone: mapMic,
    camera: mapCam,
    requestedAt: null,
    grantedAt: check.canVoice || check.canVideo ? Date.now() : null,
    source: null,
  };
}

function blockedReason(
  kind: CommunityMessengerCallKind,
  state: DibayDevicePermissionState,
): Exclude<CallMediaPermissionPreflightResult, { ok: true }>["reason"] {
  const statuses = kind === "video" ? [state.microphone, state.camera] : [state.microphone];
  if (statuses.includes("blocked")) return "permission_blocked";
  if (statuses.includes("denied")) return "permission_denied";
  return "permission_unknown";
}

/** 설정 복귀·온보딩 완료 직후 — gate 캐시 무효화 훅 */
export function invalidateCallMediaPermissionCheckCache(): void {
  /* call-permission-gate 는 OS check 우선 — 별도 TTL 캐시 없음 */
}

export async function ensureCallCanUseMedia(
  kind: CommunityMessengerCallKind,
): Promise<CallMediaPermissionPreflightResult> {
  const check = await callPermissionGate.check(kind);
  const state = mapGateOsToDeviceState(check);
  if (kind === "video" ? check.canVideo : check.canVoice) {
    return { ok: true, state };
  }
  return { ok: false, reason: blockedReason(kind, state), state };
}

/**
 * 사용자 제스처(발신·수락) 시점 — gate.prompt 후 재검사 (GUM probe 없음).
 */
export async function ensureCallMediaForUserGesture(
  kind: CommunityMessengerCallKind,
): Promise<CallMediaPermissionPreflightResult> {
  let result = await ensureCallCanUseMedia(kind);
  if (result.ok) return result;

  await callPermissionGate.prompt(kind, "incoming");
  invalidateCallMediaPermissionCheckCache();
  result = await ensureCallCanUseMedia(kind);
  return result;
}

/** @deprecated 런타임 별칭 — `ensureCallCanUseMedia` 와 동일 */
export const ensureOutgoingCallMediaPermission = ensureCallCanUseMedia;

export function openCallMediaPermissionSettings(): boolean {
  return openDevicePermissionSettings();
}

export function getCallMediaPermissionBlockedMessageKey(
  kind: CommunityMessengerCallKind,
): "cm_ui_call_permission_settings_video" | "cm_ui_call_permission_settings_voice" {
  return kind === "video" ? "cm_ui_call_permission_settings_video" : "cm_ui_call_permission_settings_voice";
}

export function resolveCallMediaPermissionBlockedMessage(kind: CommunityMessengerCallKind): string {
  const lang = getRuntimeAppLanguage();
  return translate(lang, getCallMediaPermissionBlockedMessageKey(kind));
}

/** store·Permissions API 동기 스냅샷 — check-only, GUM/프롬프트 없음 */
export function isCallMediaGrantedForKindSync(kind: CommunityMessengerCallKind): boolean {
  return isCallMediaGrantedSync(kind);
}

const PERMISSION_BLOCKED_UI_KEYS = [
  "cm_ui_call_permission_settings_video",
  "cm_ui_call_permission_settings_voice",
  "cm_ui_camera_prepare_timeout_settings",
  "cm_ui_call_failed_permission_detail_video",
  "cm_ui_call_failed_permission_detail_voice",
] as const;

export function isCallMediaPermissionBlockedUiMessage(message: string | null | undefined): boolean {
  if (!message?.trim()) return false;
  const lang = getRuntimeAppLanguage();
  return PERMISSION_BLOCKED_UI_KEYS.some((key) => translate(lang, key) === message);
}
