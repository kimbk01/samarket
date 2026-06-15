import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import { queryCommunityMessengerMediaPermissions } from "@/lib/community-messenger/media-permissions-query";
import { checkAndroidNativeDevicePermission, openAndroidNativeAppSettings, requestAndroidNativeDevicePermission, shouldUseAndroidNativeDevicePermissionBridge } from "@/lib/permissions/native-device-permissions-plugin";
import { setCachedPermissionState, markPermissionFeatureCompleted } from "@/lib/permissions/device-permission-manager";

export type DibayDevicePermissionStatus = "unknown" | "granted" | "denied" | "blocked";

export type DibayDevicePermissionSource = "signup_complete" | "first_login" | "app_entry";

export type DibayDevicePermissionState = {
  camera: DibayDevicePermissionStatus;
  microphone: DibayDevicePermissionStatus;
  requestedAt: number | null;
  grantedAt: number | null;
  source: DibayDevicePermissionSource | null;
};

const ANONYMOUS_PERMISSION_USER_ID = "anonymous";
const STABLE_CLIENT_ID_KEY = "dibay.device.stableClientId";
const STATE_VERSION = 1;
const LS_AUDIO = "cm_messenger_preferred_audio_input_id";
const LS_VIDEO = "cm_messenger_preferred_video_input_id";

const DEFAULT_STATE: DibayDevicePermissionState = {
  camera: "unknown",
  microphone: "unknown",
  requestedAt: null,
  grantedAt: null,
  source: null,
};

type StoredState = DibayDevicePermissionState & { v?: number };

const subscribers = new Set<() => void>();
let memoryState: DibayDevicePermissionState | null = null;

function logDevicePermission(event: string, payload?: Record<string, unknown>): void {
  console.info(`[device-permission] ${event}`, payload ?? {});
}

function sanitizePermissionKeyPart(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "unknown";
  return encodeURIComponent(trimmed).replace(/\./g, "%2E");
}

function readLs(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLs(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function removeLs(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function persistDeviceIdsFromInitialStream(stream: MediaStream): void {
  const audioDeviceId = stream.getAudioTracks()[0]?.getSettings().deviceId ?? null;
  const videoDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? null;
  if (audioDeviceId) writeLs(LS_AUDIO, audioDeviceId);
  if (videoDeviceId) writeLs(LS_VIDEO, videoDeviceId);
}

async function refreshPreferredDevicesFromEnumerate(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audio = devices.find((d) => d.kind === "audioinput" && d.deviceId)?.deviceId ?? null;
    const video = devices.find((d) => d.kind === "videoinput" && d.deviceId)?.deviceId ?? null;
    if (audio) writeLs(LS_AUDIO, audio);
    else removeLs(LS_AUDIO);
    if (video) writeLs(LS_VIDEO, video);
    else removeLs(LS_VIDEO);
  } catch {
    /* ignore */
  }
}

function createStableClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getDiBaYStableClientId(): string {
  if (typeof window === "undefined") return "server";
  const existing = readLs(STABLE_CLIENT_ID_KEY)?.trim();
  if (existing) return existing;
  const next = createStableClientId();
  writeLs(STABLE_CLIENT_ID_KEY, next);
  return next;
}

function getPermissionStorageScope(): { userId: string; deviceId: string } {
  const userId = sanitizePermissionKeyPart(getSyncViewerUserIdForClient() ?? ANONYMOUS_PERMISSION_USER_ID);
  const deviceId = sanitizePermissionKeyPart(getDiBaYStableClientId());
  return { userId, deviceId };
}

function stateStorageKey(userId: string, deviceId: string): string {
  return `dibay.permission.${userId}.${deviceId}.call_media.state`;
}

function normalizeState(raw: Partial<StoredState> | null): DibayDevicePermissionState {
  const camera = normalizeStatus(raw?.camera);
  const microphone = normalizeStatus(raw?.microphone);
  const requestedAt = typeof raw?.requestedAt === "number" && Number.isFinite(raw.requestedAt) ? raw.requestedAt : null;
  const grantedAt = typeof raw?.grantedAt === "number" && Number.isFinite(raw.grantedAt) ? raw.grantedAt : null;
  const source = normalizeSource(raw?.source ?? null);
  return { camera, microphone, requestedAt, grantedAt, source };
}

function normalizeStatus(value: unknown): DibayDevicePermissionStatus {
  if (value === "granted" || value === "denied" || value === "blocked") return value;
  return "unknown";
}

function normalizeSource(value: unknown): DibayDevicePermissionSource | null {
  if (value === "signup_complete" || value === "first_login" || value === "app_entry") return value;
  return null;
}

function readStoredState(): DibayDevicePermissionState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  const { userId, deviceId } = getPermissionStorageScope();
  const raw = readLs(stateStorageKey(userId, deviceId));
  if (!raw) return DEFAULT_STATE;
  try {
    return normalizeState(JSON.parse(raw) as Partial<StoredState>);
  } catch {
    return DEFAULT_STATE;
  }
}

function persistState(next: DibayDevicePermissionState): void {
  memoryState = next;
  if (typeof window !== "undefined") {
    const { userId, deviceId } = getPermissionStorageScope();
    writeLs(stateStorageKey(userId, deviceId), JSON.stringify({ ...next, v: STATE_VERSION }));
  }
  for (const cb of subscribers) cb();
}

function mergeState(patch: Partial<DibayDevicePermissionState>): DibayDevicePermissionState {
  const prev = getDibayDevicePermissionState();
  const next = normalizeState({ ...prev, ...patch });
  persistState(next);
  return next;
}

function toDibayStatus(
  state: PermissionState | null,
  prev: DibayDevicePermissionStatus,
): DibayDevicePermissionStatus {
  if (state === "granted") return "granted";
  if (state === "denied") return "denied";
  /**
   * 온보딩 1회 요청 후 WebView Permissions API 가 prompt 인 경우 — 통화 중 GUM 팝업 유발 방지.
   * Android 네이티브 셸에서는 OS 허용·store granted 가 WebView prompt 와 어긋날 수 있어 granted 유지.
   */
  if (state === "prompt" && hasRequestedInitialDevicePermissions()) {
    if (shouldUseAndroidNativeDevicePermissionBridge() && prev === "granted") return "granted";
    return "denied";
  }
  return "unknown";
}

/** Permissions API·store 스냅샷 — 통화 진입 동기 판정(요청/프롬프트 없음) */
export function isCallMediaGrantedSync(kind: "voice" | "video"): boolean {
  const state = getDibayDevicePermissionState();
  if (state.microphone !== "granted") return false;
  if (kind === "video" && state.camera !== "granted") return false;
  return true;
}

function syncLegacyCache(state: DibayDevicePermissionState): void {
  setCachedPermissionState("camera", state.camera === "blocked" ? "denied" : state.camera);
  setCachedPermissionState("microphone", state.microphone === "blocked" ? "denied" : state.microphone);
}

async function checkNativeStatus(kind: "camera" | "microphone"): Promise<DibayDevicePermissionStatus | null> {
  if (!shouldUseAndroidNativeDevicePermissionBridge()) return null;
  const state = await checkAndroidNativeDevicePermission(kind);
  if (state === "granted") return "granted";
  if (state === "denied") return "denied";
  /** prompt·브릿지 미준비 — WebView Permissions API·store 로 폴백(null) */
  return null;
}

function mergeDevicePermissionStatus(
  native: DibayDevicePermissionStatus | null,
  browser: PermissionState | null,
  prev: DibayDevicePermissionStatus,
): DibayDevicePermissionStatus {
  if (native === "granted") return "granted";
  if (native === "denied") return "denied";
  return toDibayStatus(browser, prev);
}

async function requestNativeInitialPermissions(): Promise<{ camera: DibayDevicePermissionStatus | null; microphone: DibayDevicePermissionStatus | null }> {
  if (!shouldUseAndroidNativeDevicePermissionBridge()) return { camera: null, microphone: null };
  const mic = await requestAndroidNativeDevicePermission("microphone");
  const cam = await requestAndroidNativeDevicePermission("camera");
  return {
    microphone: mic === "granted" ? "granted" : mic === "denied" ? "denied" : "unknown",
    camera: cam === "granted" ? "granted" : cam === "denied" ? "denied" : "unknown",
  };
}

export function getDibayDevicePermissionState(): DibayDevicePermissionState {
  if (memoryState) return memoryState;
  memoryState = readStoredState();
  return memoryState;
}

export function subscribeDibayDevicePermissionState(callback: () => void): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

export function hasRequestedInitialDevicePermissions(): boolean {
  return getDibayDevicePermissionState().requestedAt != null;
}

export async function checkDevicePermissions(): Promise<DibayDevicePermissionState> {
  const [browser, nativeMic, nativeCam] = await Promise.all([
    queryCommunityMessengerMediaPermissions(),
    checkNativeStatus("microphone"),
    checkNativeStatus("camera"),
  ]);
  const prev = getDibayDevicePermissionState();
  const microphone = mergeDevicePermissionStatus(nativeMic, browser.microphone, prev.microphone);
  const camera = mergeDevicePermissionStatus(nativeCam, browser.camera, prev.camera);
  const next = mergeState({
    microphone,
    camera,
    grantedAt: microphone === "granted" && camera === "granted" ? (prev.grantedAt ?? Date.now()) : null,
  });
  syncLegacyCache(next);
  return next;
}

export async function syncDevicePermissionState(): Promise<DibayDevicePermissionState> {
  return checkDevicePermissions();
}

/**
 * Android OS 런타임 권한 결과를 call_media store 에 반영한다.
 * WebView Permissions API·localStorage 와 OS 설정 불일치 보정(통화 발신·재다이얼).
 */
export async function syncCallMediaPermissionFromNativeOs(): Promise<DibayDevicePermissionState> {
  const prev = getDibayDevicePermissionState();
  const [nativeMic, nativeCam] = await Promise.all([
    checkNativeStatus("microphone"),
    checkNativeStatus("camera"),
  ]);
  const microphone =
    nativeMic === "granted" ? "granted" : nativeMic === "denied" ? "denied" : prev.microphone;
  const camera =
    nativeCam === "granted" ? "granted" : nativeCam === "denied" ? "denied" : prev.camera;
  const grantedPair = microphone === "granted" && camera === "granted";
  const next = mergeState({
    microphone,
    camera,
    grantedAt: grantedPair ? (prev.grantedAt ?? Date.now()) : prev.grantedAt,
  });
  syncLegacyCache(next);
  if (microphone === "granted") {
    markPermissionFeatureCompleted("messenger_voice_call");
  }
  if (grantedPair) {
    markPermissionFeatureCompleted("messenger_video_call");
  }
  logDevicePermission("native_os_sync", {
    microphone: next.microphone,
    camera: next.camera,
  });
  return next;
}

/** `requestCallMediaPermissions` 등 OS 일괄 허용 직후 — 재조회 없이 store 를 granted 로 맞춘다 */
export function applyOutgoingNativeOsGrantToCallMediaStore(
  kind: "voice" | "video",
): DibayDevicePermissionState {
  const prev = getDibayDevicePermissionState();
  const next = mergeState({
    microphone: "granted",
    camera: kind === "video" ? "granted" : prev.camera,
    grantedAt: Date.now(),
    requestedAt: prev.requestedAt ?? Date.now(),
  });
  syncLegacyCache(next);
  markPermissionFeatureCompleted("messenger_voice_call");
  if (kind === "video") {
    markPermissionFeatureCompleted("messenger_video_call");
  }
  logDevicePermission("native_os_grant_applied", {
    kind,
    microphone: next.microphone,
    camera: next.camera,
  });
  return next;
}

/**
 * 온보딩 「나중에」— OS 권한 팝업 없이 1회 시도 완료로 기록(재표시 금지).
 * 통화 시점에는 check-only → 설정 안내.
 */
export function markInitialDevicePermissionsDeferred(
  source: DibayDevicePermissionSource,
): DibayDevicePermissionState {
  const prev = getDibayDevicePermissionState();
  if (prev.requestedAt != null) return prev;
  const requestedAt = Date.now();
  const next = mergeState({ requestedAt, source });
  logDevicePermission("denied", { source, deferred: true });
  return next;
}

async function requestOnboardingSingleDevicePermission(
  kind: "camera" | "microphone",
  source: DibayDevicePermissionSource,
): Promise<DibayDevicePermissionState> {
  const prev = getDibayDevicePermissionState();
  const requestedAt = prev.requestedAt ?? Date.now();
  logDevicePermission("request_start", { source, kind });
  mergeState({ requestedAt, source });

  const nativeResult = await requestAndroidNativeDevicePermission(kind);
  let status: DibayDevicePermissionStatus | null =
    nativeResult === "granted" ? "granted" : nativeResult === "denied" ? "denied" : null;

  if (status !== "granted" && status !== "denied") {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      status = "blocked";
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(
          kind === "camera" ? { video: true } : { audio: true },
        );
        persistDeviceIdsFromInitialStream(stream);
        stream.getTracks().forEach((track) => track.stop());
        void refreshPreferredDevicesFromEnumerate();
        status = "granted";
      } catch (error) {
        const alreadyRequested = getDibayDevicePermissionState().requestedAt != null;
        const blocked = error instanceof DOMException && error.name === "NotAllowedError" && alreadyRequested;
        status = blocked ? "blocked" : "denied";
      }
    }
  }

  const patch =
    kind === "camera"
      ? { camera: status ?? "unknown" }
      : { microphone: status ?? "unknown" };
  const next = mergeState(patch);
  const granted = next.camera === "granted" && next.microphone === "granted";
  if (granted) {
    mergeState({ grantedAt: Date.now() });
  }
  syncLegacyCache(getDibayDevicePermissionState());
  logDevicePermission("request_result", {
    source,
    kind,
    camera: getDibayDevicePermissionState().camera,
    microphone: getDibayDevicePermissionState().microphone,
  });
  return getDibayDevicePermissionState();
}

/** 통합 온보딩 — 카메라 단계 */
export async function requestOnboardingCameraPermission(
  source: DibayDevicePermissionSource,
): Promise<DibayDevicePermissionState> {
  return requestOnboardingSingleDevicePermission("camera", source);
}

/** 통합 온보딩 — 마이크 단계 */
export async function requestOnboardingMicrophonePermission(
  source: DibayDevicePermissionSource,
): Promise<DibayDevicePermissionState> {
  return requestOnboardingSingleDevicePermission("microphone", source);
}

export async function requestInitialDevicePermissions(
  source: DibayDevicePermissionSource,
): Promise<DibayDevicePermissionState> {
  const prev = getDibayDevicePermissionState();
  const requestedAt = prev.requestedAt ?? Date.now();
  logDevicePermission("request_start", { source });
  mergeState({ requestedAt, source });

  const native = await requestNativeInitialPermissions();
  let camera = native.camera;
  let microphone = native.microphone;

  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    camera ??= "blocked";
    microphone ??= "blocked";
  } else if (camera !== "denied" && microphone !== "denied") {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      persistDeviceIdsFromInitialStream(stream);
      stream.getTracks().forEach((track) => track.stop());
      void refreshPreferredDevicesFromEnumerate();
      camera = "granted";
      microphone = "granted";
    } catch (error) {
      const blocked = error instanceof DOMException && error.name === "NotAllowedError" && prev.requestedAt != null;
      camera ??= blocked ? "blocked" : "denied";
      microphone ??= blocked ? "blocked" : "denied";
    }
  }

  const granted = camera === "granted" && microphone === "granted";
  const next = mergeState({
    camera: camera ?? "unknown",
    microphone: microphone ?? "unknown",
    requestedAt,
    grantedAt: granted ? Date.now() : null,
    source,
  });
  syncLegacyCache(next);
  logDevicePermission("request_result", {
    source,
    camera: next.camera,
    microphone: next.microphone,
  });
  if (granted) {
    logDevicePermission("granted_persisted", { source });
  } else if (next.camera === "blocked" || next.microphone === "blocked") {
    logDevicePermission("blocked", { source, camera: next.camera, microphone: next.microphone });
  } else {
    logDevicePermission("denied", { source, camera: next.camera, microphone: next.microphone });
  }
  return next;
}

export function openDevicePermissionSettings(): boolean {
  logDevicePermission("settings_open");
  if (typeof window === "undefined") return false;
  if (shouldUseAndroidNativeDevicePermissionBridge()) {
    void openAndroidNativeAppSettings();
    return true;
  }
  const origin = window.location.origin;
  const ua = window.navigator.userAgent.toLowerCase();
  try {
    if (ua.includes("edg/")) {
      window.open(`edge://settings/content/siteDetails?site=${encodeURIComponent(origin)}`, "_blank", "noopener,noreferrer");
      return true;
    }
    if (ua.includes("chrome") || ua.includes("whale") || ua.includes("opr/")) {
      window.open(`chrome://settings/content/siteDetails?site=${encodeURIComponent(origin)}`, "_blank", "noopener,noreferrer");
      return true;
    }
    if (ua.includes("firefox")) {
      window.open("about:preferences#privacy", "_blank", "noopener,noreferrer");
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
