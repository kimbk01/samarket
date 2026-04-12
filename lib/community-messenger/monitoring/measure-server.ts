import { MESSENGER_MONITORING_LABEL_DOMAIN } from "@/lib/chat-domain/messenger-domains";
import { recordMessengerMonitoringEvent } from "./server-store";

/** 서비스 함수 한 구간(DB 포함) 측정 — 성공/실패 모두 기록 */
export async function measureMessengerDb<T>(
  metric: string,
  fn: () => Promise<T>,
  labels?: Record<string, string>
): Promise<T> {
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    const ms = Math.round(performance.now() - t0);
    recordMessengerMonitoringEvent({
      ts: Date.now(),
      category: "db.community_messenger",
      metric,
      source: "server",
      value: ms,
      unit: "ms",
      labels: {
        domain: MESSENGER_MONITORING_LABEL_DOMAIN.community,
        ...labels,
      },
    });
  }
}
