import { MESSENGER_MONITORING_LABEL_DOMAIN } from "@/lib/chat-domain/messenger-domains";
import type { MessengerMonitoringAlert, MessengerMonitoringEvent, MessengerMonitoringSummary } from "./types";
import { logMessengerAlertDev } from "./logger";
import { buildThresholdAlert, shouldAlertLatency, shouldAlertPacketLoss } from "./thresholds";

const MAX_EVENTS = 400;
const MAX_ALERTS = 80;
const AGG_KEY = (e: MessengerMonitoringEvent) => `${e.category}:${e.metric}:${e.source}`;

type Agg = { count: number; sum: number; last: number; lastAt: number };

function emptyAgg(): Agg {
  return { count: 0, sum: 0, last: 0, lastAt: 0 };
}

type Store = {
  events: MessengerMonitoringEvent[];
  aggregates: Map<string, Agg>;
  apiByRoute: Map<string, { count: number; sum: number; last: number }>;
  clientAggregates: Map<string, Agg>;
  alerts: MessengerMonitoringAlert[];
};

function getStore(): Store {
  const g = globalThis as unknown as { __messengerMonitoringStore?: Store };
  if (!g.__messengerMonitoringStore) {
    g.__messengerMonitoringStore = {
      events: [],
      aggregates: new Map(),
      apiByRoute: new Map(),
      clientAggregates: new Map(),
      alerts: [],
    };
  }
  return g.__messengerMonitoringStore;
}

function bumpAgg(map: Map<string, Agg>, key: string, value: number) {
  const cur = map.get(key) ?? emptyAgg();
  cur.count += 1;
  cur.sum += value;
  cur.last = value;
  cur.lastAt = Date.now();
  map.set(key, cur);
}

export function recordMessengerMonitoringEvent(event: MessengerMonitoringEvent): void {
  const store = getStore();
  store.events.push(event);
  if (store.events.length > MAX_EVENTS) {
    store.events.splice(0, store.events.length - MAX_EVENTS);
  }

  const key = AGG_KEY(event);
  if (typeof event.value === "number" && (event.unit === "ms" || event.unit === undefined)) {
    bumpAgg(store.aggregates, key, event.value);
  }
  if (event.source === "client" && typeof event.value === "number") {
    bumpAgg(store.clientAggregates, key, event.value);
  }

  if (event.unit === "ms" && typeof event.value === "number") {
    const breach = shouldAlertLatency(event.category, event.metric, event.value);
    if (breach) {
      const alert = buildThresholdAlert(breach, event.category, event.metric, event.value, event.labels);
      pushAlert(store, alert);
    }
  }
  if (event.unit === "percent" && typeof event.value === "number" && event.category === "call.network") {
    if (shouldAlertPacketLoss(event.value)) {
      const alert: MessengerMonitoringAlert = {
        ts: Date.now(),
        category: "call.network",
        metric: event.metric,
        threshold: Number(process.env.MESSENGER_PERF_PACKET_LOSS_PCT ?? 8),
        observed: event.value,
        message: `[messenger-perf] 패킷 손실률 높음: ${event.value.toFixed(2)}%`,
        labels: event.labels,
      };
      pushAlert(store, alert);
    }
  }
}

function pushAlert(store: Store, alert: MessengerMonitoringAlert) {
  logMessengerAlertDev(alert);
  store.alerts.push(alert);
  if (store.alerts.length > MAX_ALERTS) {
    store.alerts.splice(0, store.alerts.length - MAX_ALERTS);
  }
}

export function recordMessengerApiTiming(route: string, durationMs: number, status: number): void {
  const store = getStore();
  const cur = store.apiByRoute.get(route) ?? { count: 0, sum: 0, last: 0 };
  cur.count += 1;
  cur.sum += durationMs;
  cur.last = durationMs;
  store.apiByRoute.set(route, cur);

  recordMessengerMonitoringEvent({
    ts: Date.now(),
    category: "api.community_messenger",
    metric: "route",
    source: "server",
    value: durationMs,
    unit: "ms",
    labels: {
      route,
      status: String(status),
      domain: MESSENGER_MONITORING_LABEL_DOMAIN.community,
    },
  });
}

export function ingestClientMessengerEvents(events: MessengerMonitoringEvent[]): void {
  for (const e of events) {
    recordMessengerMonitoringEvent({ ...e, source: "client" });
  }
}

export function getMessengerMonitoringSummary(): MessengerMonitoringSummary {
  const store = getStore();
  const aggregates: MessengerMonitoringSummary["aggregates"] = {};
  for (const [k, v] of store.aggregates) {
    aggregates[k] = {
      count: v.count,
      sum: v.sum,
      avg: v.count ? v.sum / v.count : 0,
      last: v.last,
      lastAt: v.lastAt,
    };
  }
  const apiByRoute: MessengerMonitoringSummary["apiByRoute"] = {};
  for (const [route, v] of store.apiByRoute) {
    apiByRoute[route] = {
      count: v.count,
      avgMs: v.count ? v.sum / v.count : 0,
      lastMs: v.last,
    };
  }
  const clientAggregates: MessengerMonitoringSummary["clientAggregates"] = {};
  for (const [k, v] of store.clientAggregates) {
    clientAggregates[k] = {
      count: v.count,
      avg: v.count ? v.sum / v.count : 0,
      last: v.last,
    };
  }
  return {
    generatedAt: new Date().toISOString(),
    windowEvents: store.events.length,
    aggregates,
    apiByRoute,
    recentAlerts: [...store.alerts].reverse(),
    clientAggregates,
  };
}
