/**
 * CM/통합채팅 API 라우트 타이밍 — `apiByRoute` 갱신 + `recordMessengerMonitoringEvent`.
 * `server-store.ts` 정적 의존을 끊어 라우트 번들(특히 `/messages`) 컴파일 그래프를 줄인다.
 * - 전역 스토어는 `server-store-root` 와 동일 싱글톤.
 * - 이벤트 기록은 `./server-store-record` 동적 import(순환 없음).
 * - dev 힙 경고는 `node:v8` 동적 import.
 */
import { MESSENGER_MONITORING_LABEL_DOMAIN } from "@/lib/chat-domain/messenger-domains";
import { samarketDevMonitoringLogEnabled } from "@/lib/debug/samarket-server-trace-flags";
import type { MessengerMonitoringCategory, MessengerMonitoringEvent } from "./types";
import {
  getMessengerMonitoringStoreRoot,
  MAX_API_ROUTES,
  trimMessengerMonitoringMapOldest,
} from "./server-store-root";

let lastDevMonitoringStoreLogAt = 0;
let lastDevMonitoringHeapLogAt = 0;

export function recordMessengerApiTiming(
  route: string,
  durationMs: number,
  status: number,
  options?: {
    category?: "api.community_messenger" | "api.integrated_chat";
    domain?: string;
  }
): void {
  const isDev = process.env.NODE_ENV === "development";
  const category: MessengerMonitoringCategory =
    options?.category ?? "api.community_messenger";
  const domain = options?.domain ?? MESSENGER_MONITORING_LABEL_DOMAIN.community;
  const store = getMessengerMonitoringStoreRoot();
  const cur = store.apiByRoute.get(route) ?? { count: 0, sum: 0, last: 0 };
  cur.count += 1;
  cur.sum += durationMs;
  cur.last = durationMs;
  store.apiByRoute.set(route, cur);
  const beforeSize = store.apiByRoute.size;
  if (isDev) {
    trimMessengerMonitoringMapOldest(store.apiByRoute, MAX_API_ROUTES);
  }
  const afterSize = store.apiByRoute.size;
  const trimmed = isDev && afterSize < beforeSize;

  if (isDev) {
    const now = Date.now();
    if (
      samarketDevMonitoringLogEnabled() &&
      (trimmed || now - lastDevMonitoringStoreLogAt > 30_000) &&
      afterSize > 0
    ) {
      lastDevMonitoringStoreLogAt = now;
      console.warn("[dev-monitoring-store] apiByRoute size", {
        apiByRouteSize: afterSize,
        trimmed,
      });
    }
    if (samarketDevMonitoringLogEnabled()) {
      void import("node:v8")
        .then((v8) => {
          try {
            const h = v8.getHeapStatistics();
            const used = h.used_heap_size;
            const limit = h.heap_size_limit || 1;
            const ratio = used / limit;
            if (ratio > 0.7 && now - lastDevMonitoringHeapLogAt > 10_000) {
              lastDevMonitoringHeapLogAt = Date.now();
              console.warn("[dev-heap] monitoring-store high heap", {
                heapUsedMB: Math.round(used / 1024 / 1024),
                heapLimitMB: Math.round(limit / 1024 / 1024),
                ratio: Math.round(ratio * 1000) / 1000,
                apiByRouteSize: afterSize,
              });
            }
          } catch {
            /* ignore */
          }
        })
        .catch(() => {});
    }
  }

  const event: MessengerMonitoringEvent = {
    ts: Date.now(),
    category,
    metric: "route",
    source: "server",
    value: durationMs,
    unit: "ms",
    labels: {
      route,
      status: String(status),
      domain,
    },
  };

  void import("./server-store-record").then((m) => {
    m.recordMessengerMonitoringEvent(event);
  });
}
