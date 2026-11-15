"use client";

import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";
import { triggerInteractionFeedback } from "@/lib/ui/light-tap-feedback";

/**
 * 헤더 뒤로 원형 버튼 — 눌림·소리 (설계 docs/design/header-back-round-design-2026-11-16.md R2·R3).
 *
 * 눌림: 손가락이 닿는 순간(pointerdown) 버튼에 `data-pressed` 를 직접 붙인다 — React 상태를 거치지 않아 같은 프레임에 그려진다.
 *       떼기·취소·밖으로 나가기에서 뗀다. 이동은 지금처럼 click 에서(지연 추가 없음).
 * 소리: 앱 기존 「딸깍」(`triggerInteractionFeedback("light")` — 920Hz 55ms + Android 진동 10ms, 터치에서만).
 *       손을 떼서 눌림이 확정된 click 에서 1회. 내 통화가 울리거나 진행 중이면 내지 않는다(통화 오디오 보호 — 통화 상태는 읽기만).
 * 통화 상태 판정(`readOwnLiveCall`)은 통화 저장소 전체를 끌어오므로 정적으로 가져오지 않는다 —
 * 뒤로 버튼을 쓰는 모든 화면 번들·시험에 통화 모듈이 붙는 것을 막는다. 누르는 순간(pointerdown) 불러 두고,
 * 아직 못 불러왔으면 통화 중일 수 있으므로 소리를 내지 않는다(통화 보호 쪽).
 */

type OwnLiveCallModule = typeof import("@/lib/call/own-live-call");
let ownLiveCallModule: OwnLiveCallModule | null = null;
let ownLiveCallLoading: Promise<void> | null = null;

/** 통화 상태 판정 모듈을 미리 불러 둔다 (pointerdown) */
export function prewarmHeaderBackPressFeedback(): Promise<void> {
  if (ownLiveCallModule) return Promise.resolve();
  if (!ownLiveCallLoading) {
    ownLiveCallLoading = import("@/lib/call/own-live-call")
      .then((m) => {
        ownLiveCallModule = m;
      })
      .catch(() => {
        /* 불러오기 실패 — 판정 불가로 두고 소리 없음 */
      })
      .finally(() => {
        ownLiveCallLoading = null;
      });
  }
  return ownLiveCallLoading;
}

function setPressed(el: Element | null, on: boolean): void {
  if (!el) return;
  if (on) el.setAttribute("data-pressed", "");
  else el.removeAttribute("data-pressed");
}

function onPointerDown(e: ReactPointerEvent<HTMLElement>): void {
  if (e.button !== 0) return;
  setPressed(e.currentTarget, true);
  void prewarmHeaderBackPressFeedback();
}

function onPointerRelease(e: ReactPointerEvent<HTMLElement>): void {
  setPressed(e.currentTarget, false);
}

/** 버튼·링크에 그대로 펼친다 */
export const headerBackPressHandlers = {
  onPointerDown,
  onPointerUp: onPointerRelease,
  onPointerCancel: onPointerRelease,
  onPointerLeave: onPointerRelease,
} as const;

/** 연타 간격 — `AppBackButton` 연타 잠금(`BACK_PRESS_LOCK_RELEASE_MS` 700ms)과 같은 값 */
export const HEADER_BACK_SOUND_REPEAT_GUARD_MS = 700;
let lastSoundAt = 0;

/** click 에서 1회 — 700ms 안의 연타는 소리 1번 */
export function playHeaderBackPressSound(e?: ReactMouseEvent<HTMLElement> | null): void {
  const now = Date.now();
  if (now - lastSoundAt < HEADER_BACK_SOUND_REPEAT_GUARD_MS) return;
  lastSoundAt = now;
  const mod = ownLiveCallModule;
  if (!mod) return;
  try {
    if (mod.readOwnLiveCall()) return;
  } catch {
    return;
  }
  const pointerType = (e?.nativeEvent as PointerEvent | undefined)?.pointerType;
  triggerInteractionFeedback("light", pointerType ? { pointerType } : undefined);
}

/** 시험 전용 — 연타 간격 기록 초기화 */
export function resetHeaderBackSoundGuardForTest(): void {
  lastSoundAt = 0;
}
