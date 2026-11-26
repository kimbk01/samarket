"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { playLightTapClickSound } from "@/lib/ui/light-tap-feedback";
import { getNotificationSoundGateSnapshot } from "@/lib/notifications/notification-sound-gate-snapshot";
import { peekMeNotificationSettingsSnapshotCached } from "@/lib/me/fetch-me-notification-settings-client";

/**
 * 홈 누름 피드백 단일 정의 — 설계 `docs/design/home-superapp-redesign-design-2026-11-26.md` §5
 * (Owner 「제안대로 승인」 2026-11-26).
 *
 * | 종류 | 진동 | 소리 |
 * | tap (서비스 칸·배너·카드·전체보기·지역·종) | 가벼움 | 딸깍 |
 * | call (다시 걸기 등 통화 시작) | 가벼움 | 없음 |
 * | swipe (배너 손으로 넘김 — 장 바뀜) | 선택 | 없음 |
 * | refresh (당겨서 새로고침 시작) | 가벼움 | 없음 |
 *
 * - 진동: 네이티브 앱(Haptics 플러그인 있음) = `impact(Light)`/선택 햅틱, 없으면 `navigator.vibrate`(iPhone 웹은 없음).
 * - 끄기: 알림 설정 `vibration_enabled`·`sound_enabled` 가 꺼져 있으면 그 쪽을 안 한다 — 새 요청 없이
 *   이미 받아 둔 값(소리 게이트 스냅샷 → 세션 캐시)만 읽고, 아무 값도 없으면 켬.
 * - 통화 중: 소리 없음(진동만). 통화 상태 모듈은 정적으로 가져오지 않는다(`header-back-press-feedback.ts` 와 같은 이유) —
 *   아직 못 불러왔으면 통화 중일 수 있어 소리를 내지 않는다.
 * - 마우스(PC): 진동·소리 없음(눈 눌림만, CSS `.home-press`).
 */
export type HomePressKind = "tap" | "call" | "swipe" | "refresh";

type HapticsModule = typeof import("@capacitor/haptics");
type OwnLiveCallModule = typeof import("@/lib/call/own-live-call");

let haptics: HapticsModule | null = null;
let hapticsLoading = false;
let ownLiveCall: OwnLiveCallModule | null = null;
let ownLiveCallLoading = false;

function nativeHapticsAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean; isPluginAvailable?: (name: string) => boolean };
  }).Capacitor;
  try {
    return cap?.isNativePlatform?.() === true && cap.isPluginAvailable?.("Haptics") === true;
  } catch {
    return false;
  }
}

function coarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

/** 홈이 그려질 때 한 번 — 첫 누름부터 네이티브 진동·통화 판정 */
export function prewarmHomePressFeedback(): void {
  if (!haptics && !hapticsLoading && nativeHapticsAvailable()) {
    hapticsLoading = true;
    import("@capacitor/haptics")
      .then((m) => {
        haptics = m;
      })
      .catch(() => {})
      .finally(() => {
        hapticsLoading = false;
      });
  }
  if (!ownLiveCall && !ownLiveCallLoading) {
    ownLiveCallLoading = true;
    import("@/lib/call/own-live-call")
      .then((m) => {
        ownLiveCall = m;
      })
      .catch(() => {})
      .finally(() => {
        ownLiveCallLoading = false;
      });
  }
}

/** 내 알림 설정 — 이미 받아 둔 값만 (없으면 켬) */
export function readHomePressPrefs(): { sound: boolean; vibration: boolean } {
  const gate = getNotificationSoundGateSnapshot()?.userNotificationSettings;
  if (gate) return { sound: gate.sound_enabled !== false, vibration: gate.vibration_enabled !== false };
  try {
    const s = peekMeNotificationSettingsSnapshotCached()?.settings;
    if (s) return { sound: s.sound_enabled !== false, vibration: s.vibration_enabled !== false };
  } catch {
    /* noop */
  }
  return { sound: true, vibration: true };
}

function inCallOrUnknown(): boolean {
  if (!ownLiveCall) return true;
  try {
    return ownLiveCall.readOwnLiveCall() != null;
  } catch {
    return true;
  }
}

function vibrate(kind: HomePressKind): void {
  if (nativeHapticsAvailable()) {
    const m = haptics;
    if (m) {
      const { Haptics, ImpactStyle } = m;
      const p =
        kind === "swipe"
          ? Haptics.selectionStart().then(() => Haptics.selectionChanged()).then(() => Haptics.selectionEnd())
          : Haptics.impact({ style: ImpactStyle.Light });
      void p.catch(() => {});
      return;
    }
    prewarmHomePressFeedback();
  }
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(kind === "swipe" ? 6 : 10);
  } catch {
    /* noop */
  }
}

/** 손가락 누름인가 — 마우스·펜은 아님. 이벤트에 종류가 없으면 기기 판정 */
function isTouchPress(ev?: { pointerType?: string } | null): boolean {
  const pt = ev?.pointerType;
  if (pt) return pt === "touch";
  return coarsePointer();
}

/** 누름 확정(click) 때 1회 */
export function homePressFeedback(kind: HomePressKind, ev?: { pointerType?: string } | null): void {
  try {
    if (!isTouchPress(ev)) return;
    const prefs = readHomePressPrefs();
    if (prefs.vibration) vibrate(kind);
    if (kind === "tap" && prefs.sound && !inCallOrUnknown()) playLightTapClickSound();
  } catch {
    /* noop */
  }
}

/** React click 이벤트에서 손가락 종류를 꺼낸다 */
export function homePressFromClick(kind: HomePressKind, e?: ReactMouseEvent<Element> | null): void {
  const pointerType = (e?.nativeEvent as PointerEvent | undefined)?.pointerType;
  homePressFeedback(kind, pointerType ? { pointerType } : null);
}
