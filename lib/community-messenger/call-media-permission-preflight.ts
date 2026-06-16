import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import {
  checkDevicePermissions,
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

export async function ensureCallCanUseMedia(
  kind: CommunityMessengerCallKind,
): Promise<CallMediaPermissionPreflightResult> {
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
