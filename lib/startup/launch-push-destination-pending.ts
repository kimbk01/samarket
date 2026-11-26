"use client";

/**
 * 설계 §24 D4 (docs/audit/app-entry-device-fail-root-cause-design-2026-11-17.md) — 알림 목적지로 켠 실행에서
 * 시작 화면 덮개가 걷히기 전(목적지가 아직 안 그려짐)인가.
 *
 * 실측(11-18 Xiaomi · 채팅 알림): 덮개 아래에서 하단 탭 미리 받기 RSC 가 탭마다 2회(Link 화면 내 미리 받기 + 부팅 유휴 예열 —
 * 그 사이 채팅방 이동으로 라우터 상태가 바뀌어 캐시 키가 달라짐) = 8건이 채팅방 RSC 와 동시에 나갔다.
 * 대기 중에는 미리 받기를 멈추고, 덮개가 걷히면(`markAppReady`) 다시 평소대로 한다.
 *
 * iOS·아이콘 실행·알림 목적지 없는 실행은 언제나 false(보류 자체가 없음) → 동작 불변.
 */
import { useSyncExternalStore } from "react";
import { isLaunchPushHoldActive, markLaunchPushHandled, onLaunchPushHandled } from "@/lib/startup/launch-push-hold";
import { getAppReadySnapshot, subscribeAppReady } from "@/lib/startup/startup-metrics";
import { lifecycleNavHoldStartPath, onLifecycleNavHoldSettled } from "@/lib/startup/lifecycle-nav-hold";

export function isLaunchPushDestinationPending(): boolean {
  if (typeof window === "undefined") return false;
  return isLaunchPushHoldActive() && !getAppReadySnapshot();
}

/**
 * 설계 §24 D1-웹 (Owner 「SSOT 지키는 안」 2026-11-18) — 대기가 끝날 때까지(덮개 해제 또는 수신자가 끝냄) 기다리는 Promise.
 * 대기가 아니면 바로 끝난다. 홈 화면 전용 데이터 요청(「지금 우리 동네」)이 덮개 아래에서 채팅방과 경쟁하지 않게 쓴다.
 */
export function untilLaunchPushDestinationSettled(): Promise<void> {
  return new Promise<void>((resolve) => {
    whenLaunchPushDestinationSettled(resolve);
  });
}

/** 알림 목적지 그림 대기 상한 — 알림 수신자의 기존 경로 확인 상한과 같은 값 */
export const LAUNCH_PUSH_DESTINATION_WAIT_CAP_MS = 8_000;

/**
 * 설계 A (2026-11-18 · x12 실측) — 문서가 이미 알림 목적지에서 시작한 경우(다시 불러온 문서 등)
 * 「이미 목적지」 처리 뒤에도 덮개 해제는 목적지 그림 판정에 맡기고, 상한만 건다.
 * 상한 안에 덮개가 걷히면(`markAppReady`) 끝 · 넘으면 `markLaunchPushHandled` 로 지금 화면에서 해제(기존 8초 규칙과 같음).
 * 반환 = 취소.
 */
export function capLaunchPushDestinationWait(path: string): () => void {
  if (!isLaunchPushDestinationPending()) return () => {};
  let done = false;
  const offReady = subscribeAppReady(() => finish());
  const timer = setTimeout(() => {
    if (done) return;
    finish();
    if (isLaunchPushHoldActive()) {
      markLaunchPushHandled();
      console.info("[push-route] destination_paint_unconfirmed", { path, source: "same_route" });
    }
  }, LAUNCH_PUSH_DESTINATION_WAIT_CAP_MS);
  function finish() {
    if (done) return;
    done = true;
    offReady();
    clearTimeout(timer);
  }
  return finish;
}

/** 대기가 끝나면(덮개 해제 또는 수신자가 끝냄) 한 번 `run`. 이미 끝났으면 바로. 반환 = 취소. */
export function whenLaunchPushDestinationSettled(run: () => void): () => void {
  if (!isLaunchPushDestinationPending()) {
    run();
    return () => {};
  }
  let done = false;
  const fire = () => {
    if (done || isLaunchPushDestinationPending()) return;
    done = true;
    offReady();
    offHandled();
    run();
  };
  const offReady = subscribeAppReady(fire);
  const offHandled = onLaunchPushHandled(fire);
  return () => {
    done = true;
    offReady();
    offHandled();
  };
}

function subscribe(onChange: () => void): () => void {
  const offReady = subscribeAppReady(onChange);
  const offHandled = onLaunchPushHandled(onChange);
  return () => {
    offReady();
    offHandled();
  };
}

/**
 * 렌더 중 읽기 + 해제 때 다시 렌더. 값은 DOM 에 쓰지 않는 곳(예: Link `prefetch`)에만 쓴다 —
 * 서버 렌더(false)와 첫 클라이언트 렌더(true)가 달라도 화면 출력이 같아 hydration 불일치가 없다.
 */
export function useLaunchPushDestinationPending(): boolean {
  useSyncExternalStore(subscribe, getAppReadySnapshot, () => false);
  return isLaunchPushDestinationPending();
}

/**
 * 재감사 2026-11-26 §9 A5 (`docs/audit/app-entry-reaudit-responsibility-ssot-2026-11-26.md` · 계약 K3·K4·K8 ·
 * 승인 패턴 §24 D1-웹/D4 를 직전 화면 복원·안전 진입에 그대로 넓힘) — 시작 목적지가 아직 안 그려졌는가.
 *
 * 실측(Samsung · 아이콘 실행 · 직전 채팅방 복원): OS 화면 아래에서 홈이 환율·날씨·동네 글과 하단 탭 미리 받기 4~8건을
 * 채팅방 이동과 동시에 내보냈다(7~12건 경쟁). 알림 실행에만 있던 대기를 생명주기 이동(`lifecycleNavHoldStartPath`)에도 건다.
 * 알림 수신자(`PushRouteListener`)는 위 알림 전용 함수를 그대로 쓴다(통화 코드와 같은 파일 — 변경 없음).
 * 목적지 없는 실행(아이콘으로 홈·iOS 보류 없음)은 언제나 false → 동작 불변.
 */
export function isLaunchDestinationPending(): boolean {
  if (typeof window === "undefined") return false;
  if (getAppReadySnapshot()) return false;
  return isLaunchPushHoldActive() || lifecycleNavHoldStartPath() != null;
}

function subscribeLaunchDestination(onChange: () => void): () => void {
  const offReady = subscribeAppReady(onChange);
  const offHandled = onLaunchPushHandled(onChange);
  let offSettled: () => void = () => {};
  let sync = true;
  offSettled = onLifecycleNavHoldSettled(() => {
    if (!sync) onChange();
  });
  sync = false;
  return () => {
    offReady();
    offHandled();
    offSettled();
  };
}

/** 시작 목적지 대기가 끝나면(OS 화면 해제·알림 처리·생명주기 이동 안 함) 한 번 `run`. 이미 끝났으면 바로. 반환 = 취소. */
export function whenLaunchDestinationSettled(run: () => void): () => void {
  if (!isLaunchDestinationPending()) {
    run();
    return () => {};
  }
  let done = false;
  let off: () => void = () => {};
  off = subscribeLaunchDestination(() => {
    if (done || isLaunchDestinationPending()) return;
    done = true;
    off();
    run();
  });
  return () => {
    done = true;
    off();
  };
}

/** `whenLaunchDestinationSettled` 의 Promise 형 — 홈 전용 데이터 요청이 시작 목적지와 경쟁하지 않게 쓴다. */
export function untilLaunchDestinationSettled(): Promise<void> {
  return new Promise<void>((resolve) => {
    whenLaunchDestinationSettled(resolve);
  });
}

/** 렌더 중 읽기 + 대기 끝에 다시 렌더. DOM 에 쓰지 않는 값(Link `prefetch`·요청 시작 여부)에만 쓴다. */
export function useLaunchDestinationPending(): boolean {
  return useSyncExternalStore(subscribeLaunchDestination, isLaunchDestinationPending, () => false);
}
