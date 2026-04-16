"use client";

/**
 * 사용자 알림 설정 GET — 메신저 홈 등에서 마운트 직후 겹치는 요청을 단일 비행으로 합친다.
 * @see docs/trade-lightweight-design.md — 중복 요청 완화.
 */
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";

export const ME_NOTIFICATION_SETTINGS_GET_FLIGHT = "me:notification-settings:get";

export function fetchMeNotificationSettingsGet(): Promise<Response> {
  return runSingleFlight(ME_NOTIFICATION_SETTINGS_GET_FLIGHT, () =>
    fetch("/api/me/notification-settings", { credentials: "include" })
  );
}

/** PATCH 성공 후 다음 GET 이 캐시된 in-flight 와 합쳐지지 않도록 비운다. */
export function invalidateMeNotificationSettingsGetFlight(): void {
  forgetSingleFlight(ME_NOTIFICATION_SETTINGS_GET_FLIGHT);
}
