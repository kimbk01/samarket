/**
 * DiBaY 기기 단위 권한 정책 (localStorage + 브라우저 Permissions API).
 * 실제 API 호출(getCurrentPosition / getUserMedia)은 사용자 제스처 이후·중앙 모듈에서만 수행.
 */

import { getBestCurrentPosition, type GeolocationResult } from "@/lib/map/geolocation";
import {
  openPermissionGuideModal,
  type PermissionGuideChoice,
} from "@/lib/permissions/permission-ui-bridge";
import type { DevicePermissionKind } from "@/lib/permissions/device-permission-kind";
import { queryCommunityMessengerMediaPermissions } from "@/lib/community-messenger/media-permissions-query";
import { applyPreferredSinkToHtmlAudioElement } from "@/lib/permissions/speaker-output-preference";
import {
  DIBAY_MIC_ABORT_MESSAGE_DEFERRED,
  DIBAY_MIC_ABORT_MESSAGE_LATER,
} from "@/lib/permissions/dibay-mic-gate-messages";
import { DIBAY_PERMISSION_SESSION_STORAGE_KEY_PREFIX } from "@/lib/permissions/device-permission-session-prefix";

export type BrowserPermissionState = PermissionState | "unknown";

const LS = {
  guideSeen: (k: DevicePermissionKind) => `dibay.permission.${k}.guideSeen`,
  lastState: (k: DevicePermissionKind) => `dibay.permission.${k}.lastState`,
  dismissedAt: (k: DevicePermissionKind) => `dibay.permission.dismissedAt.${k}`,
} as const;

/** 같은 탭 세션에서「나중에」직후 동일 화면 반복 방지 */
const SS_LATER = (k: DevicePermissionKind) => `${DIBAY_PERMISSION_SESSION_STORAGE_KEY_PREFIX}later.${k}`;

const memoryCache = new Map<DevicePermissionKind, BrowserPermissionState>();

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

export function markGuideSeen(kind: DevicePermissionKind): void {
  writeLs(LS.guideSeen(kind), "1");
}

export function isGuideSeen(kind: DevicePermissionKind): boolean {
  return readLs(LS.guideSeen(kind)) === "1";
}

function markSessionLater(kind: DevicePermissionKind): void {
  writeSs(SS_LATER(kind), "1");
  writeLs(LS.dismissedAt(kind), new Date().toISOString());
}

export function wasSessionLater(kind: DevicePermissionKind): boolean {
  return readSs(SS_LATER(kind)) === "1";
}

export function setCachedPermissionState(kind: DevicePermissionKind, state: BrowserPermissionState): void {
  memoryCache.set(kind, state);
  writeLs(LS.lastState(kind), state);
}

export function getCachedPermissionState(kind: DevicePermissionKind): BrowserPermissionState | null {
  const m = memoryCache.get(kind);
  if (m) return m;
  const ls = readLs(LS.lastState(kind));
  if (ls === "granted" || ls === "denied" || ls === "prompt") return ls;
  return null;
}

/** 설정「권한 다시 확인」: 안내 추적만 초기화(브라우저 권한은 건드리지 않음). */
export function resetPermissionGuideTracking(kind: DevicePermissionKind): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LS.guideSeen(kind));
    window.localStorage.removeItem(LS.dismissedAt(kind));
    window.sessionStorage.removeItem(SS_LATER(kind));
  } catch {
    /* ignore */
  }
  memoryCache.delete(kind);
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

export async function refreshPermissionState(kind: DevicePermissionKind): Promise<BrowserPermissionState> {
  if (typeof window === "undefined") return "unknown";

  if (kind === "location") {
    const st = await queryGeolocationPermission();
    setCachedPermissionState("location", st);
    return st;
  }

  if (kind === "microphone") {
    const perms = await queryCommunityMessengerMediaPermissions();
    const st = perms.microphone ?? "unknown";
    setCachedPermissionState("microphone", st);
    return st;
  }

  // speaker: 브라우저 권한 API 없음 — 마지막 테스트 결과만 LS 에 유지
  {
    const ls = readLs(LS.lastState("speaker"));
    if (ls === "granted" || ls === "denied" || ls === "prompt") {
      memoryCache.set("speaker", ls);
      return ls;
    }
    return "unknown";
  }
}

export function getPermissionState(kind: DevicePermissionKind): BrowserPermissionState {
  return getCachedPermissionState(kind) ?? "unknown";
}

export function shouldShowGuide(kind: DevicePermissionKind, browserState: BrowserPermissionState): boolean {
  if (browserState === "granted" || browserState === "denied") return false;
  if (wasSessionLater(kind)) return false;
  if (isGuideSeen(kind)) return false;
  return browserState === "prompt" || browserState === "unknown";
}

async function requestGuideChoice(kind: DevicePermissionKind): Promise<PermissionGuideChoice> {
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
    if (pos.ok) return { ok: true, position: pos };
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

/**
 * getUserMedia 직전: 마이크 DiBaY 안내 (prompt + 미안내 시에만 모달).
 */
export async function ensureMicrophoneWithDiBaYGate(options?: {
  explicitRetry?: boolean;
}): Promise<MicrophoneEnsureResult> {
  if (typeof window === "undefined") return { ok: false, reason: "no_api" };
  if (!window.isSecureContext) return { ok: false, reason: "insecure" };
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, reason: "no_api" };

  const browserState = await refreshPermissionState("microphone");
  const explicitRetry = !!options?.explicitRetry;

  if (browserState === "denied") {
    return { ok: false, reason: "denied" };
  }

  if (browserState === "granted") {
    return { ok: true };
  }

  if (!explicitRetry) {
    if (shouldShowGuide("microphone", browserState)) {
      const choice = await requestGuideChoice("microphone");
      markGuideSeen("microphone");
      if (choice === "later") {
        markSessionLater("microphone");
        return { ok: false, reason: "later" };
      }
    } else if (isGuideSeen("microphone") || wasSessionLater("microphone")) {
      return { ok: false, reason: "deferred" };
    }
  }

  return { ok: true };
}

/**
 * `{ audio: true, video: false }` 만 — DiBaY 게이트 + GUM 을 한 함수로 묶어 프리플라이트·프로브에서 이중 gate 방지.
 */
export async function acquireSimpleMicStreamWithDiBaYGate(options?: {
  explicitRetry?: boolean;
}): Promise<MediaStream> {
  const gate = await ensureMicrophoneWithDiBaYGate({ explicitRetry: options?.explicitRetry === true });
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
  return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
}

/**
 * 마이크 허용 확인용으로만 짧게 GUM 후 트랙 정리 (안내 이후「허용하기」경로).
 */
export async function probeMicrophoneWithGetUserMedia(options?: {
  explicitRetry?: boolean;
}): Promise<MicrophoneEnsureResult> {
  try {
    const stream = await acquireSimpleMicStreamWithDiBaYGate({
      explicitRetry: options?.explicitRetry === true,
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
  | { kind: "microphone"; result: MicrophoneEnsureResult }
  | { kind: "speaker"; result: { ok: boolean; error?: string } };

/** 타입별 진입점 — UI·설정에서 공통 호출 */
export async function requestPermission(
  kind: DevicePermissionKind,
  opts?: { explicitRetry?: boolean; speakerShowFirstGuide?: boolean },
): Promise<DevicePermissionRequestResult> {
  switch (kind) {
    case "location":
      return {
        kind: "location",
        result: await requestLocationWithDiBaYGate({ explicitRetry: opts?.explicitRetry === true }),
      };
    case "microphone":
      return {
        kind: "microphone",
        result: await probeMicrophoneWithGetUserMedia({ explicitRetry: opts?.explicitRetry === true }),
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
  ]);
}
