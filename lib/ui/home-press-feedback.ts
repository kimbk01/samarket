"use client";

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { playLightTapClickSound } from "@/lib/ui/light-tap-feedback";
import { getNotificationSoundGateSnapshot } from "@/lib/notifications/notification-sound-gate-snapshot";
import {
  fetchMeNotificationSettingsSnapshot,
  peekMeNotificationSettingsSnapshotCached,
} from "@/lib/me/fetch-me-notification-settings-client";
import { getCurrentUser } from "@/lib/auth/get-current-user";

/**
 * 홈 누름 피드백 단일 정의 — 설계 v2 §4 (Owner 「v2대로 구현」 2026-11-26).
 *
 * | 종류 | 진동 | 소리 |
 * | tap (홈의 모든 누름 — 칸·배너·피드·공지·종·머리글) | 가벼움 | 딸깍 |
 * | call (통화 버튼 — 요소에 `data-home-press="call"`) | 가벼움 | 없음 |
 * | swipe (배너 손으로 넘김 — 장 바뀜) | 선택 | 없음 |
 * | refresh (당겨서 새로고침 시작) | 가벼움 | 없음 |
 * 요소에 `data-home-press="none"` = 피드백 없음(숫자 입력 등).
 *
 * - 홈 전체에 위임: `HomeScreen` 뿌리에서 `onClickCapture={homePressDelegate}` — 공용 부품(종 등)을 고치지 않고 홈 안 모든 누름에 같은 피드백.
 * - 진동: 네이티브 앱(Haptics 플러그인) = `impact(Light)`·선택 햅틱, 없으면 `navigator.vibrate`(iPhone 웹은 없음).
 * - 소리 끔·진동 끔(내정보 알림 설정): 회원은 설정을 알기 전까지 **소리 없음**(진동만). 첫 누름 때 기존 설정 조회를 한 번 불러
 *   그 뒤부터 따른다(앱 열 때 요청 증가 없음). 비로그인은 설정이 없어 켬.
 * - 통화 중 소리 없음: 통화 상태 모듈은 손가락이 닿을 때(`homePressPointerDown`) 불러온다 — 홈을 열 때 미리 불러오지 않음.
 *   아직 못 불러왔으면 통화 중일 수 있어 소리 없음.
 * - 마우스·펜: 진동·소리 없음(눈 눌림만, CSS `.home-press`).
 */
export type HomePressKind = "tap" | "call" | "swipe" | "refresh";

type HapticsModule = typeof import("@capacitor/haptics");
type OwnLiveCallModule = typeof import("@/lib/call/own-live-call");

let haptics: HapticsModule | null = null;
let hapticsLoading = false;
let ownLiveCall: OwnLiveCallModule | null = null;
let ownLiveCallLoading = false;
let settingsRequested = false;

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

/** 홈이 그려질 때 — 진동 모듈만 미리 (통화 모듈은 불러오지 않음) */
export function prewarmHomePressFeedback(): void {
  if (haptics || hapticsLoading || !nativeHapticsAvailable()) return;
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

function prewarmOwnLiveCall(): void {
  if (ownLiveCall || ownLiveCallLoading) return;
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

/** 내 알림 설정 — 이미 받아 둔 값만. 모르면 null */
export function readHomePressPrefs(): { sound: boolean; vibration: boolean } | null {
  const gate = getNotificationSoundGateSnapshot()?.userNotificationSettings;
  if (gate) return { sound: gate.sound_enabled !== false, vibration: gate.vibration_enabled !== false };
  try {
    const s = peekMeNotificationSettingsSnapshotCached()?.settings;
    if (s) return { sound: s.sound_enabled !== false, vibration: s.vibration_enabled !== false };
  } catch {
    /* noop */
  }
  return null;
}

/** 소리·진동 허용 — 회원이 설정을 아직 모르면 소리 없음 + 설정 1회 불러오기 */
export function resolveHomePressPermission(
  prefs: { sound: boolean; vibration: boolean } | null,
  isMember: boolean
): { sound: boolean; vibration: boolean; needSettings: boolean } {
  if (prefs) return { ...prefs, needSettings: false };
  if (isMember) return { sound: false, vibration: true, needSettings: true };
  return { sound: true, vibration: true, needSettings: false };
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

/** 누름 확정 때 1회 */
export function homePressFeedback(kind: HomePressKind, ev?: { pointerType?: string } | null): void {
  try {
    if (!isTouchPress(ev)) return;
    const perm = resolveHomePressPermission(readHomePressPrefs(), Boolean(getCurrentUser()?.id));
    if (perm.needSettings && !settingsRequested) {
      settingsRequested = true;
      void fetchMeNotificationSettingsSnapshot().catch(() => {
        settingsRequested = false;
      });
    }
    if (perm.vibration) vibrate(kind);
    if (kind === "tap" && perm.sound && !inCallOrUnknown()) playLightTapClickSound();
  } catch {
    /* noop */
  }
}

const PRESSABLE = 'button, a[href], [role="button"], [role="tab"], [data-home-press]';

/** 홈 뿌리 `onPointerDownCapture` — 통화 상태 모듈을 이때 불러 둔다 */
export function homePressPointerDown(e: ReactPointerEvent<HTMLElement>): void {
  if (e.pointerType !== "touch") return;
  prewarmOwnLiveCall();
}

/** 홈 뿌리 `onClickCapture` — 누른 요소의 종류(`data-home-press`)로 피드백 1회 */
export function homePressDelegate(e: ReactMouseEvent<HTMLElement>): void {
  const target = e.target as Element | null;
  const el = target?.closest?.(PRESSABLE);
  if (!el || !e.currentTarget.contains(el)) return;
  if ((el as HTMLButtonElement).disabled) return;
  const kind = el.getAttribute("data-home-press");
  if (kind === "none") return;
  const pointerType = (e.nativeEvent as PointerEvent | undefined)?.pointerType;
  homePressFeedback(kind === "call" ? "call" : "tap", pointerType ? { pointerType } : null);
}

/** 포털(시트) 안 버튼처럼 홈 뿌리 밖에서 — click 이벤트에서 직접 */
export function homePressFromClick(kind: HomePressKind, e?: ReactMouseEvent<Element> | null): void {
  const pointerType = (e?.nativeEvent as PointerEvent | undefined)?.pointerType;
  homePressFeedback(kind, pointerType ? { pointerType } : null);
}
