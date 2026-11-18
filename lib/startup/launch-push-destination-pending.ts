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

export function isLaunchPushDestinationPending(): boolean {
  if (typeof window === "undefined") return false;
  return isLaunchPushHoldActive() && !getAppReadySnapshot();
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
