import { getPublicDeployTier } from "@/lib/config/deploy-surface";
import type { MessengerMonitoringAlert, MessengerMonitoringEvent } from "./types";

function isServerDevConsole(): boolean {
  return process.env.NODE_ENV !== "production";
}

function isClientDevConsole(): boolean {
  if (typeof window === "undefined") return false;
  return getPublicDeployTier() === "local";
}

/**
 * 구조화 로그 — 개발(local)에서만 콘솔 출력. 프로덕션은 조용히 무시(서버 store / 원격 전송만).
 */
export function logMessengerMonitoringDev(event: MessengerMonitoringEvent): void {
  if (typeof window === "undefined") {
    if (!isServerDevConsole()) return;
    // eslint-disable-next-line no-console -- 의도적 개발용 성능 로그
    console.debug("[messenger:perf]", JSON.stringify(event));
    return;
  }
  if (!isClientDevConsole()) return;
  // eslint-disable-next-line no-console
  console.debug("[messenger:perf]", JSON.stringify(event));
}

export function logMessengerAlertDev(alert: MessengerMonitoringAlert): void {
  if (typeof window === "undefined") {
    if (!isServerDevConsole()) return;
    // eslint-disable-next-line no-console
    console.warn("[messenger:perf:alert]", alert.message, alert);
    return;
  }
  if (!isClientDevConsole()) return;
  // eslint-disable-next-line no-console
  console.warn("[messenger:perf:alert]", alert.message, alert);
}
