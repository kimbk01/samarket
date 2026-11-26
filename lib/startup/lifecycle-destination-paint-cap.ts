"use client";

/**
 * 감사 2026-11-26 D3 (`docs/audit/os-cover-push-entry-delay-audit-2026-11-26.md`) — 직전 화면 복원 목적지의 그림 대기 상한.
 * 알림 목적지 상한(`capLaunchPushDestinationWait` · 8초)과 같은 규칙: 상한 안에 덮개가 걷히면 끝,
 * 넘으면 목적지 그림 보류를 풀고 지금 화면에서 해제한다. 복원 이동 자체에는 고정 대기가 없다(이동 쪽 계약 그대로).
 * 화면이 내려가도(언마운트) 상한은 남는다 — 덮개가 상한 없이 남지 않게. 문서당 1회.
 */
import {
  capLifecycleNavDestinationPaint,
  isLifecycleNavDestinationPaintHoldActive,
} from "@/lib/startup/lifecycle-nav-hold";
import { isInitialDestinationVisualReady, markInitialDestinationVisualReady } from "@/lib/startup/startup-metrics";

export const LIFECYCLE_DESTINATION_PAINT_CAP_MS = 8_000;
let armed = false;

export function armLifecycleDestinationPaintCap(): void {
  if (armed || typeof window === "undefined") return;
  if (!isLifecycleNavDestinationPaintHoldActive(window.location.pathname)) return;
  armed = true;
  window.setTimeout(() => {
    if (isInitialDestinationVisualReady()) return;
    capLifecycleNavDestinationPaint();
    console.info("[dibay-lifecycle] destination_paint_unconfirmed", { path: window.location.pathname });
    markInitialDestinationVisualReady();
  }, LIFECYCLE_DESTINATION_PAINT_CAP_MS);
}

/** Tests only. */
export function __resetLifecycleDestinationPaintCapForTests(): void {
  armed = false;
}
