import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import {
  checkDevicePermissions,
  isCallMediaGrantedSync,
  openDevicePermissionSettings,
  syncCallMediaPermissionFromNativeOs,
  applyOutgoingNativeOsGrantToCallMediaStore,
  type DibayDevicePermissionState,
} from "@/lib/permissions/dibay-device-permission-store";
import { ensureAndroidNativeCallMediaPermissions } from "@/lib/permissions/android-native-device-permissions";
import { shouldUseAndroidNativeDevicePermissionBridge } from "@/lib/permissions/native-device-permissions-plugin";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate } from "@/lib/i18n/messages";

/**
 * 통화 미디어 권한 — 단일 계약
 *
 * - `ensureCallCanUseMedia` — 조회만(OS→store 동기화, 팝업 없음). 수동 UI·그룹 passive 판정.
 * - `ensureOutgoingCallMediaPermission` — 발신·수락·조인·재다이얼(사용자 제스처). Android OS 확인·요청 후 store 반영.
 */

export type CallMediaPermissionPreflightResult =
  | { ok: true; state: DibayDevicePermissionState }
  | {
      ok: false;
      reason: "permission_denied" | "permission_blocked" | "permission_unknown";
      state: DibayDevicePermissionState;
    };

const PREFLIGHT_CACHE_TTL_MS = 1200;

let inflightPermissionCheck: Promise<DibayDevicePermissionState> | null = null;
let cachedPermissionState: DibayDevicePermissionState | null = null;
let cachedPermissionStateAt = 0;

function logCallPermission(event: string, payload?: Record<string, unknown>): void {
  console.info(`[call-permission] ${event}`, payload ?? {});
}

function hasRequiredMediaPermission(kind: CommunityMessengerCallKind, state: DibayDevicePermissionState): boolean {
  if (state.microphone !== "granted") return false;
  if (kind === "video" && state.camera !== "granted") return false;
  return true;
}

function blockedReason(
  kind: CommunityMessengerCallKind,
  state: DibayDevicePermissionState
): Exclude<CallMediaPermissionPreflightResult, { ok: true }>["reason"] {
  const statuses = kind === "video" ? [state.microphone, state.camera] : [state.microphone];
  if (statuses.includes("blocked")) return "permission_blocked";
  if (statuses.includes("denied")) return "permission_denied";
  return "permission_unknown";
}

/** 설정 복귀·온보딩 완료 직후 — 짧은 TTL 캐시 무효화 */
export function invalidateCallMediaPermissionCheckCache(): void {
  cachedPermissionState = null;
  cachedPermissionStateAt = 0;
  inflightPermissionCheck = null;
}

async function resolveDevicePermissionStateForCall(): Promise<DibayDevicePermissionState> {
  const now = Date.now();
  if (cachedPermissionState && now - cachedPermissionStateAt < PREFLIGHT_CACHE_TTL_MS) {
    return cachedPermissionState;
  }
  if (!inflightPermissionCheck) {
    inflightPermissionCheck = checkDevicePermissions()
      .then((state) => {
        cachedPermissionState = state;
        cachedPermissionStateAt = Date.now();
        return state;
      })
      .finally(() => {
        inflightPermissionCheck = null;
      });
  }
  return inflightPermissionCheck;
}

/** 조회만 — Android 는 OS→store 동기화 후 판정(팝업 없음) */
export async function ensureCallCanUseMedia(
  kind: CommunityMessengerCallKind,
): Promise<CallMediaPermissionPreflightResult> {
  if (shouldUseAndroidNativeDevicePermissionBridge()) {
    await syncCallMediaPermissionFromNativeOs();
    invalidateCallMediaPermissionCheckCache();
  }
  logCallPermission("check_only_start", { kind });
  const state = await resolveDevicePermissionStateForCall();
  logCallPermission("check_only_result", {
    kind,
    camera: state.camera,
    microphone: state.microphone,
  });
  if (hasRequiredMediaPermission(kind, state)) {
    logCallPermission("call_allowed", { kind });
    return { ok: true, state };
  }
  const reason = blockedReason(kind, state);
  logCallPermission("call_blocked_by_permission", {
    kind,
    reason,
    camera: state.camera,
    microphone: state.microphone,
  });
  return { ok: false, reason, state };
}

/** 사용자 제스처 통화 — Android OS 권한 1회 확인·요청 → store granted 반영 */
export async function ensureOutgoingCallMediaPermission(
  kind: CommunityMessengerCallKind,
): Promise<CallMediaPermissionPreflightResult> {
  if (shouldUseAndroidNativeDevicePermissionBridge()) {
    logCallPermission("outgoing_native_os_first", { kind });
    const os = await ensureAndroidNativeCallMediaPermissions(kind);
    logCallPermission("outgoing_native_os_result", { kind, os });
    if (os === "granted") {
      invalidateCallMediaPermissionCheckCache();
      const state = applyOutgoingNativeOsGrantToCallMediaStore(kind);
      logCallPermission("outgoing_native_os_granted", {
        kind,
        camera: state.camera,
        microphone: state.microphone,
      });
      return { ok: true, state };
    }
    if (os === "denied") {
      invalidateCallMediaPermissionCheckCache();
      const state = await syncCallMediaPermissionFromNativeOs();
      const reason = blockedReason(kind, state);
      logCallPermission("call_blocked_by_permission", {
        kind,
        reason,
        camera: state.camera,
        microphone: state.microphone,
        source: "native_os_denied",
      });
      return { ok: false, reason, state };
    }
  }
  return ensureCallCanUseMedia(kind);
}

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
