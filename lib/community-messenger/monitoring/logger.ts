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
 * `NEXT_PUBLIC_MESSENGER_PERF_ALERT_CONSOLE=0` 또는 `MESSENGER_PERF_ALERT_CONSOLE=0` —
 * `[messenger:perf:alert]` 콘솔 경고만 끔(이벤트 큐·전송은 유지).
 */
function isMessengerPerfAlertConsoleEnabled(): boolean {
  const pub = (process.env.NEXT_PUBLIC_MESSENGER_PERF_ALERT_CONSOLE ?? "").trim().toLowerCase();
  if (pub === "0" || pub === "false" || pub === "off" || pub === "no") return false;
  const srv = (process.env.MESSENGER_PERF_ALERT_CONSOLE ?? "").trim().toLowerCase();
  if (srv === "0" || srv === "false" || srv === "off" || srv === "no") return false;
  return true;
}

/**
 * 구조화 로그 — 개발(local)에서만 콘솔 출력. 프로덕션은 조용히 무시(서버 store / 원격 전송만).
 */
export function logMessengerMonitoringDev(event: MessengerMonitoringEvent): void {
  if (
    event.category === "chat.room_load" &&
    event.metric === "bootstrap_fetch" &&
    event.labels?.refreshKind === "silent"
  ) {
    /** 사일런트 부트스트랩은 자주 돌아 콘솔만 생략 — `messengerMonitorRecord` 큐·전송은 그대로 */
    return;
  }
  if (typeof window === "undefined") {
    if (!isServerDevConsole()) return;
    console.debug("[messenger:perf]", JSON.stringify(event));
    return;
  }
  if (!isClientDevConsole()) return;
  console.debug("[messenger:perf]", JSON.stringify(event));
}

export function logMessengerAlertDev(alert: MessengerMonitoringAlert): void {
  if (!isMessengerPerfAlertConsoleEnabled()) return;
  if (typeof window === "undefined") {
    if (!isServerDevConsole()) return;
    console.warn("[messenger:perf:alert]", alert.message, alert);
    return;
  }
  if (!isClientDevConsole()) return;
  console.warn("[messenger:perf:alert]", alert.message, alert);
}
