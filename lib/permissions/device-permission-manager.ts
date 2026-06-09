/**
 * DiBaY 기기 단위 권한 정책 (localStorage + 브라우저 Permissions API).
 * 실제 API 호출(getCurrentPosition / getUserMedia)은 사용자 제스처 이후·중앙 모듈에서만 수행.
 */

import { getBestCurrentPosition, type GeolocationResult } from "@/lib/map/geolocation";
import {
  openPermissionGuideModal,
  type PermissionGuideChoice,
} from "@/lib/permissions/permission-ui-bridge";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import type {
  DevicePermissionFeatureKey,
  DevicePermissionGuideKind,
  DevicePermissionKind,
} from "@/lib/permissions/device-permission-kind";
import { queryCommunityMessengerMediaPermissions } from "@/lib/community-messenger/media-permissions-query";
import { applyPreferredSinkToHtmlAudioElement } from "@/lib/permissions/speaker-output-preference";
import {
  DIBAY_MIC_ABORT_MESSAGE_DEFERRED,
  DIBAY_MIC_ABORT_MESSAGE_LATER,
} from "@/lib/permissions/dibay-mic-gate-messages";
import { DIBAY_PERMISSION_SESSION_STORAGE_KEY_PREFIX } from "@/lib/permissions/device-permission-session-prefix";

export type BrowserPermissionState = PermissionState | "unknown";

const STABLE_CLIENT_ID_KEY = "dibay.device.stableClientId";
const ANONYMOUS_PERMISSION_USER_ID = "anonymous";

const LEGACY_LS = {
  guideSeen: (k: DevicePermissionGuideKind) => `dibay.permission.${k}.guideSeen`,
  lastState: (k: DevicePermissionGuideKind) => `dibay.permission.${k}.lastState`,
  dismissedAt: (k: DevicePermissionGuideKind) => `dibay.permission.dismissedAt.${k}`,
} as const;

const LS = {
  guideSeen: (userId: string, deviceId: string, k: DevicePermissionGuideKind) =>
    `dibay.permission.${userId}.${deviceId}.${k}.guideSeen`,
  status: (userId: string, deviceId: string, k: DevicePermissionGuideKind) =>
    `dibay.permission.${userId}.${deviceId}.${k}.status`,
  dismissedAt: (userId: string, deviceId: string, k: DevicePermissionGuideKind) =>
    `dibay.permission.${userId}.${deviceId}.${k}.dismissedAt`,
  featureCompleted: (userId: string, deviceId: string, featureKey: DevicePermissionFeatureKey) =>
    `dibay.permission.${userId}.${deviceId}.${featureKey}.completed`,
} as const;

/** 같은 탭 세션에서「나중에」직후 동일 화면 반복 방지 */
const SS_LATER = (userId: string, deviceId: string, k: DevicePermissionGuideKind) =>
  `${DIBAY_PERMISSION_SESSION_STORAGE_KEY_PREFIX}${userId}.${deviceId}.later.${k}`;
const LEGACY_SS_LATER = (k: DevicePermissionGuideKind) => `${DIBAY_PERMISSION_SESSION_STORAGE_KEY_PREFIX}later.${k}`;

const memoryCache = new Map<string, BrowserPermissionState>();

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

function readSs(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSs(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function removeSs(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function sanitizePermissionKeyPart(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "unknown";
  return encodeURIComponent(trimmed).replace(/\./g, "%2E");
}

function createStableClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getDiBaYStableClientId(): string {
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

/** 로그인 전 anonymous 키에 저장된 통화 trusted mark 를 실제 userId 로 승격 */
function promoteAnonymousFeatureMarksIfNeeded(featureKey: DevicePermissionFeatureKey): void {
  if (typeof window === "undefined") return;
  const { userId, deviceId } = getPermissionStorageScope();
  const anonUserId = sanitizePermissionKeyPart(ANONYMOUS_PERMISSION_USER_ID);
  if (userId === anonUserId) return;
  const anonCompleted = readLs(LS.featureCompleted(anonUserId, deviceId, featureKey));
  if (!anonCompleted) return;
  const userKey = LS.featureCompleted(userId, deviceId, featureKey);
  if (!readLs(userKey)) {
    writeLs(userKey, anonCompleted);
  }
}

function isCallMediaFeatureKey(featureKey?: DevicePermissionFeatureKey): boolean {
  return featureKey === "messenger_video_call" || featureKey === "messenger_voice_call";
}

function scopedCacheKey(kind: DevicePermissionGuideKind): string {
  const { userId, deviceId } = getPermissionStorageScope();
  return `${userId}:${deviceId}:${kind}`;
}

export function markGuideSeen(kind: DevicePermissionGuideKind): void {
  const { userId, deviceId } = getPermissionStorageScope();
  writeLs(LS.guideSeen(userId, deviceId, kind), "1");
}

export function isGuideSeen(kind: DevicePermissionGuideKind): boolean {
  const { userId, deviceId } = getPermissionStorageScope();
  return readLs(LS.guideSeen(userId, deviceId, kind)) === "1";
}

function markSessionLater(kind: DevicePermissionGuideKind): void {
  const { userId, deviceId } = getPermissionStorageScope();
  writeSs(SS_LATER(userId, deviceId, kind), "1");
  writeLs(LS.dismissedAt(userId, deviceId, kind), new Date().toISOString());
}

export function wasSessionLater(kind: DevicePermissionGuideKind): boolean {
  const { userId, deviceId } = getPermissionStorageScope();
  return readSs(SS_LATER(userId, deviceId, kind)) === "1";
}

export function setCachedPermissionState(kind: DevicePermissionGuideKind, state: BrowserPermissionState): void {
  const { userId, deviceId } = getPermissionStorageScope();
  memoryCache.set(scopedCacheKey(kind), state);
  writeLs(LS.status(userId, deviceId, kind), state);
}

export function getCachedPermissionState(kind: DevicePermissionGuideKind): BrowserPermissionState | null {
  const { userId, deviceId } = getPermissionStorageScope();
  const m = memoryCache.get(scopedCacheKey(kind));
  if (m) return m;
  const ls = readLs(LS.status(userId, deviceId, kind));
  if (ls === "granted" || ls === "denied" || ls === "prompt") return ls;
  return null;
}

/** 설정「권한 다시 확인」: 안내 추적만 초기화(브라우저 권한은 건드리지 않음). */
export function resetPermissionGuideTracking(kind: DevicePermissionGuideKind): void {
  if (typeof window === "undefined") return;
  const { userId, deviceId } = getPermissionStorageScope();
  removeLs(LS.guideSeen(userId, deviceId, kind));
  removeLs(LS.dismissedAt(userId, deviceId, kind));
  removeLs(LEGACY_LS.guideSeen(kind));
  removeLs(LEGACY_LS.dismissedAt(kind));
  removeSs(SS_LATER(userId, deviceId, kind));
  removeSs(LEGACY_SS_LATER(kind));
  memoryCache.delete(scopedCacheKey(kind));
}

export function markPermissionFeatureCompleted(featureKey: DevicePermissionFeatureKey): void {
  const { userId, deviceId } = getPermissionStorageScope();
  writeLs(LS.featureCompleted(userId, deviceId, featureKey), new Date().toISOString());
}

export function isPermissionFeatureCompleted(featureKey: DevicePermissionFeatureKey): boolean {
  promoteAnonymousFeatureMarksIfNeeded(featureKey);
  const { userId, deviceId } = getPermissionStorageScope();
  return Boolean(readLs(LS.featureCompleted(userId, deviceId, featureKey)));
}

export async function queryGeolocationPermission(): Promise<BrowserPermissionState> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return "unknown";
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state;
  } catch {
    return "unknown";
  }
}

export function queryNotificationPermission(): BrowserPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unknown";
  const state = Notification.permission;
  if (state === "default") return "prompt";
  return state;
}

export async function refreshPermissionState(kind: DevicePermissionKind): Promise<BrowserPermissionState> {
  if (typeof window === "undefined") return "unknown";

  if (kind === "location") {
    const st = await queryGeolocationPermission();
    setCachedPermissionState("location", st);
    return st;
  }

  if (kind === "microphone" || kind === "camera") {
    const perms = await queryCommunityMessengerMediaPermissions();
    const st = (kind === "microphone" ? perms.microphone : perms.camera) ?? "unknown";
    setCachedPermissionState(kind, st);
    return st;
  }

  const st = queryNotificationPermission();
  setCachedPermissionState("notification", st);
  return st;
}

export function refreshSpeakerOutputState(): BrowserPermissionState {
  const ls = getCachedPermissionState("speaker");
  if (ls === "granted" || ls === "denied" || ls === "prompt") return ls;
  return "unknown";
}

export function getPermissionState(kind: DevicePermissionKind): BrowserPermissionState {
  return getCachedPermissionState(kind) ?? "unknown";
}

export function shouldShowGuide(kind: DevicePermissionGuideKind, browserState: BrowserPermissionState): boolean {
  if (browserState === "granted" || browserState === "denied") return false;
  if (wasSessionLater(kind)) return false;
  if (isGuideSeen(kind)) return false;
  return browserState === "prompt" || browserState === "unknown";
}

async function requestGuideChoice(kind: DevicePermissionGuideKind): Promise<PermissionGuideChoice> {
  return openPermissionGuideModal(kind);
}

export type LocationRequestResult =
  | { ok: true; position: Extract<GeolocationResult, { ok: true }> }
  | {
      ok: false;
      reason: "denied" | "deferred" | "later" | "no_api" | "position_error";
      message?: string;
      positionError?: GeolocationResult & { ok: false };
    };

/**
 * 위치 사용 직전 호출(버튼 탭 스택). 브라우저가 prompt 일 때만 앱 안내 1회.
 * explicitRetry: 설정「권한 다시 확인」등 — 안내 없이 getCurrentPosition만 시도.
 */
export async function requestLocationWithDiBaYGate(options?: {
  explicitRetry?: boolean;
  featureKey?: DevicePermissionFeatureKey;
}): Promise<LocationRequestResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { ok: false, reason: "no_api", message: "이 환경에서는 위치를 사용할 수 없습니다." };
  }

  const browserState = await refreshPermissionState("location");
  const explicitRetry = !!options?.explicitRetry;

  if (browserState === "denied") {
    return { ok: false, reason: "denied", message: "브라우저·기기 설정에서 위치 권한을 허용해 주세요." };
  }

  if (browserState === "granted") {
    const pos = await getBestCurrentPosition();
    if (pos.ok) {
      if (options?.featureKey) markPermissionFeatureCompleted(options.featureKey);
      return { ok: true, position: pos };
    }
    return {
      ok: false,
      reason: "position_error",
      message: pos.message,
      positionError: pos,
    };
  }

  // prompt 또는 unknown
  if (!explicitRetry) {
    if (shouldShowGuide("location", browserState)) {
      const choice = await requestGuideChoice("location");
      markGuideSeen("location");
      if (choice === "later") {
        markSessionLater("location");
        return { ok: false, reason: "later" };
      }
    } else if (isGuideSeen("location") || wasSessionLater("location")) {
      return {
        ok: false,
        reason: "deferred",
        message: "설정에서 권한을 다시 확인하거나 주소를 직접 입력해 주세요.",
      };
    }
  }

  const pos = await getBestCurrentPosition();
  if (pos.ok) {
    void refreshPermissionState("location");
    if (options?.featureKey) markPermissionFeatureCompleted(options.featureKey);
    return { ok: true, position: pos };
  }
  if (pos.code === 1) {
    void refreshPermissionState("location");
    return {
      ok: false,
      reason: "denied",
      message: pos.message,
      positionError: pos,
    };
  }
  return {
    ok: false,
    reason: "position_error",
    message: pos.message,
    positionError: pos,
  };
}

export type MicrophoneEnsureResult =
  | { ok: true }
  | { ok: false; reason: "denied" | "deferred" | "later" | "insecure" | "no_api" };

export type DevicePermissionEnsureResult = MicrophoneEnsureResult;

async function ensureDevicePermissionsWithDiBaYGate(
  kinds: readonly DevicePermissionKind[],
  options?: {
    explicitRetry?: boolean;
    guideKind?: DevicePermissionGuideKind;
    featureKey?: DevicePermissionFeatureKey;
  },
): Promise<DevicePermissionEnsureResult> {
  if (typeof window === "undefined") return { ok: false, reason: "no_api" };
  if ((kinds.includes("microphone") || kinds.includes("camera")) && !window.isSecureContext) {
    return { ok: false, reason: "insecure" };
  }
  if ((kinds.includes("microphone") || kinds.includes("camera")) && !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: "no_api" };
  }
  if (kinds.includes("notification") && !("Notification" in window)) {
    return { ok: false, reason: "no_api" };
  }

  const states = await Promise.all(kinds.map((kind) => refreshPermissionState(kind)));
  if (states.some((state) => state === "denied")) {
    return { ok: false, reason: "denied" };
  }
  if (states.every((state) => state === "granted")) {
    return { ok: true };
  }
  if (options?.featureKey && isPermissionFeatureCompleted(options.featureKey)) {
    return { ok: true };
  }

  const explicitRetry = !!options?.explicitRetry || isCallMediaFeatureKey(options?.featureKey);
  const guideKind = options?.guideKind ?? kinds[0] ?? "microphone";

  if (!explicitRetry) {
    if (shouldShowGuide(guideKind, states.find((state) => state !== "granted") ?? "unknown")) {
      const choice = await requestGuideChoice(guideKind);
      for (const kind of kinds) markGuideSeen(kind);
      if (choice === "later") {
        for (const kind of kinds) markSessionLater(kind);
        return { ok: false, reason: "later" };
      }
    } else if (kinds.some((kind) => isGuideSeen(kind) || wasSessionLater(kind))) {
      return { ok: false, reason: "deferred" };
    }
  }

  return { ok: true };
}

/**
 * getUserMedia 직전: 마이크 DiBaY 안내 (prompt + 미안내 시에만 모달).
 */
export async function ensureMicrophoneWithDiBaYGate(options?: {
  explicitRetry?: boolean;
  featureKey?: DevicePermissionFeatureKey;
}): Promise<MicrophoneEnsureResult> {
  return ensureDevicePermissionsWithDiBaYGate(["microphone"], {
    explicitRetry: options?.explicitRetry === true,
    featureKey: options?.featureKey,
    guideKind: "microphone",
  });
}

export async function ensureCameraWithDiBaYGate(options?: {
  explicitRetry?: boolean;
  featureKey?: DevicePermissionFeatureKey;
}): Promise<DevicePermissionEnsureResult> {
  return ensureDevicePermissionsWithDiBaYGate(["camera"], {
    explicitRetry: options?.explicitRetry === true,
    featureKey: options?.featureKey,
    guideKind: "camera",
  });
}

export async function ensureMicrophoneCameraWithDiBaYGate(options?: {
  explicitRetry?: boolean;
  featureKey?: DevicePermissionFeatureKey;
}): Promise<DevicePermissionEnsureResult> {
  return ensureDevicePermissionsWithDiBaYGate(["microphone", "camera"], {
    explicitRetry: options?.explicitRetry === true,
    featureKey: options?.featureKey,
    guideKind: "camera",
  });
}

/**
 * `{ audio: true, video: false }` 만 — DiBaY 게이트 + GUM 을 한 함수로 묶어 프리플라이트·프로브에서 이중 gate 방지.
 */
export async function acquireSimpleMicStreamWithDiBaYGate(options?: {
  explicitRetry?: boolean;
  featureKey?: DevicePermissionFeatureKey;
}): Promise<MediaStream> {
  const gate = await ensureMicrophoneWithDiBaYGate({
    explicitRetry: options?.explicitRetry === true,
    featureKey: options?.featureKey,
  });
  if (!gate.ok) {
    if (gate.reason === "denied") {
      throw new DOMException("Microphone permission denied", "NotAllowedError");
    }
    if (gate.reason === "no_api") {
      throw new DOMException("getUserMedia unavailable", "NotSupportedError");
    }
    if (gate.reason === "insecure") {
      throw new DOMException("insecure context", "SecurityError");
    }
    if (gate.reason === "later") {
      throw new DOMException(DIBAY_MIC_ABORT_MESSAGE_LATER, "AbortError");
    }
    if (gate.reason === "deferred") {
      throw new DOMException(DIBAY_MIC_ABORT_MESSAGE_DEFERRED, "AbortError");
    }
    throw new DOMException("Microphone request aborted", "AbortError");
  }
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new DOMException("getUserMedia unavailable", "NotSupportedError");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  if (options?.featureKey) markPermissionFeatureCompleted(options.featureKey);
  return stream;
}

/**
 * 영상 통화용 mic+cam — DiBaY 게이트 + GUM 단일 경로 (프리플라이트·온보딩).
 */
export async function acquireVideoCallStreamWithDiBaYGate(options?: {
  explicitRetry?: boolean;
}): Promise<MediaStream> {
  const gate = await ensureMicrophoneCameraWithDiBaYGate({
    explicitRetry: options?.explicitRetry === true,
    featureKey: "messenger_video_call",
  });
  if (!gate.ok) {
    if (gate.reason === "denied") {
      throw new DOMException("Camera or microphone permission denied", "NotAllowedError");
    }
    if (gate.reason === "no_api") {
      throw new DOMException("getUserMedia unavailable", "NotSupportedError");
    }
    if (gate.reason === "insecure") {
      throw new DOMException("insecure context", "SecurityError");
    }
    if (gate.reason === "later") {
      throw new DOMException(DIBAY_MIC_ABORT_MESSAGE_LATER, "AbortError");
    }
    if (gate.reason === "deferred") {
      throw new DOMException(DIBAY_MIC_ABORT_MESSAGE_DEFERRED, "AbortError");
    }
    throw new DOMException("Media permission request aborted", "AbortError");
  }
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new DOMException("getUserMedia unavailable", "NotSupportedError");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  markPermissionFeatureCompleted("messenger_video_call");
  markPermissionFeatureCompleted("messenger_voice_call");
  return stream;
}

/**
 * 마이크 허용 확인용으로만 짧게 GUM 후 트랙 정리 (안내 이후「허용하기」경로).
 */
export async function probeMicrophoneWithGetUserMedia(options?: {
  explicitRetry?: boolean;
  featureKey?: DevicePermissionFeatureKey;
}): Promise<MicrophoneEnsureResult> {
  try {
    const stream = await acquireSimpleMicStreamWithDiBaYGate({
      explicitRetry: options?.explicitRetry === true,
      featureKey: options?.featureKey,
    });
    for (const t of stream.getTracks()) {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    }
    void refreshPermissionState("microphone");
    return { ok: true };
  } catch (e) {
    void refreshPermissionState("microphone");
    if (e instanceof DOMException) {
      if (e.name === "AbortError") {
        if (e.message === DIBAY_MIC_ABORT_MESSAGE_DEFERRED) return { ok: false, reason: "deferred" };
        if (e.message === DIBAY_MIC_ABORT_MESSAGE_LATER) return { ok: false, reason: "later" };
        return { ok: false, reason: "later" };
      }
      if (e.name === "SecurityError") return { ok: false, reason: "insecure" };
      if (e.name === "NotAllowedError") return { ok: false, reason: "denied" };
      if (e.name === "NotSupportedError") return { ok: false, reason: "no_api" };
    }
    return { ok: false, reason: "denied" };
  }
}

export async function probeCameraWithGetUserMedia(options?: {
  explicitRetry?: boolean;
  featureKey?: DevicePermissionFeatureKey;
}): Promise<DevicePermissionEnsureResult> {
  const gate = await ensureCameraWithDiBaYGate({
    explicitRetry: options?.explicitRetry === true,
    featureKey: options?.featureKey,
  });
  if (!gate.ok) return gate;
  try {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return { ok: false, reason: "no_api" };
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    for (const t of stream.getTracks()) {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    }
    void refreshPermissionState("camera");
    if (options?.featureKey) markPermissionFeatureCompleted(options.featureKey);
    return { ok: true };
  } catch (e) {
    void refreshPermissionState("camera");
    if (e instanceof DOMException) {
      if (e.name === "SecurityError") return { ok: false, reason: "insecure" };
      if (e.name === "NotAllowedError") return { ok: false, reason: "denied" };
      if (e.name === "NotSupportedError") return { ok: false, reason: "no_api" };
    }
    return { ok: false, reason: "denied" };
  }
}

export type NotificationPermissionRequestResult =
  | { ok: true; permission: NotificationPermission }
  | { ok: false; reason: "denied" | "deferred" | "later" | "no_api"; permission?: NotificationPermission };

export async function requestNotificationWithDiBaYGate(options?: {
  explicitRetry?: boolean;
  featureKey?: DevicePermissionFeatureKey;
}): Promise<NotificationPermissionRequestResult> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return { ok: false, reason: "no_api" };
  }
  const gate = await ensureDevicePermissionsWithDiBaYGate(["notification"], {
    explicitRetry: options?.explicitRetry === true,
    featureKey: options?.featureKey,
    guideKind: "notification",
  });
  if (!gate.ok) {
    return {
      ok: false,
      reason: gate.reason === "insecure" ? "no_api" : gate.reason,
      permission: Notification.permission,
    };
  }
  if (Notification.permission === "granted") {
    setCachedPermissionState("notification", "granted");
    return { ok: true, permission: "granted" };
  }
  if (Notification.permission === "denied") {
    setCachedPermissionState("notification", "denied");
    return { ok: false, reason: "denied", permission: "denied" };
  }
  const permission = await Notification.requestPermission();
  setCachedPermissionState("notification", permission === "default" ? "prompt" : permission);
  if (permission === "granted") {
    if (options?.featureKey) markPermissionFeatureCompleted(options.featureKey);
    return { ok: true, permission };
  }
  return {
    ok: false,
    reason: permission === "denied" ? "denied" : "deferred",
    permission,
  };
}

/** 스피커: 소리 테스트. 반복 모달 없음 — 설정에서만 안내 모달 병행 가능 */
export async function runSpeakerTestWithOptionalGuide(options?: {
  /** 첫 안내(1회)까지 모달 사용 */
  showFirstGuide?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const showFirst = !!options?.showFirstGuide;
  if (showFirst && !isGuideSeen("speaker") && !wasSessionLater("speaker")) {
    const choice = await requestGuideChoice("speaker");
    markGuideSeen("speaker");
    if (choice === "later") {
      markSessionLater("speaker");
      return { ok: false, error: "later" };
    }
  }

  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.08;
      osc.frequency.value = 880;
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
      window.setTimeout(() => {
        try {
          osc.stop();
          void ctx.close();
        } catch {
          /* ignore */
        }
      }, 220);
      setCachedPermissionState("speaker", "granted");
      return { ok: true };
    }
  } catch {
    /* fall through */
  }

  try {
    const audio = new Audio(
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA",
    );
    audio.volume = 0.2;
    await applyPreferredSinkToHtmlAudioElement(audio);
    await audio.play();
    setCachedPermissionState("speaker", "granted");
    return { ok: true };
  } catch (e) {
    setCachedPermissionState("speaker", "denied");
    return { ok: false, error: e instanceof Error ? e.message : "play_failed" };
  }
}

export type DevicePermissionRequestResult =
  | { kind: "location"; result: LocationRequestResult }
  | { kind: "camera"; result: DevicePermissionEnsureResult }
  | { kind: "microphone"; result: MicrophoneEnsureResult }
  | { kind: "notification"; result: NotificationPermissionRequestResult }
  | { kind: "speaker"; result: { ok: boolean; error?: string } };

/** 타입별 진입점 — UI·설정에서 공통 호출 */
export async function requestPermission(
  kind: DevicePermissionGuideKind,
  opts?: {
    explicitRetry?: boolean;
    speakerShowFirstGuide?: boolean;
    featureKey?: DevicePermissionFeatureKey;
  },
): Promise<DevicePermissionRequestResult> {
  switch (kind) {
    case "location":
      return {
        kind: "location",
        result: await requestLocationWithDiBaYGate({
          explicitRetry: opts?.explicitRetry === true,
          featureKey: opts?.featureKey,
        }),
      };
    case "camera":
      return {
        kind: "camera",
        result: await probeCameraWithGetUserMedia({
          explicitRetry: opts?.explicitRetry === true,
          featureKey: opts?.featureKey,
        }),
      };
    case "microphone":
      return {
        kind: "microphone",
        result: await probeMicrophoneWithGetUserMedia({
          explicitRetry: opts?.explicitRetry === true,
          featureKey: opts?.featureKey,
        }),
      };
    case "notification":
      return {
        kind: "notification",
        result: await requestNotificationWithDiBaYGate({
          explicitRetry: opts?.explicitRetry === true,
          featureKey: opts?.featureKey,
        }),
      };
    case "speaker":
      return {
        kind: "speaker",
        result: await runSpeakerTestWithOptionalGuide({
          showFirstGuide: opts?.speakerShowFirstGuide === true,
        }),
      };
  }
}

let lastDevicePermissionWarmAt = 0;
const DEVICE_PERMISSION_WARM_DEBOUNCE_MS = 2200;

/** 앱 부팅 시 가벼운 상태 동기화(요청 없음). React Strict Mode 이중 마운트 등으로 동일 구간 중복 호출 완화 */
export async function warmDevicePermissionCache(): Promise<void> {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastDevicePermissionWarmAt < DEVICE_PERMISSION_WARM_DEBOUNCE_MS) {
    return;
  }
  lastDevicePermissionWarmAt = now;
  await Promise.all([
    refreshPermissionState("location").catch(() => {}),
    refreshPermissionState("microphone").catch(() => {}),
    refreshPermissionState("camera").catch(() => {}),
    refreshPermissionState("notification").catch(() => {}),
  ]);
}
