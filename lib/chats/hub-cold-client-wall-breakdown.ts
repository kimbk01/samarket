/**
 * GET /api/me/store-owner-hub-badge — cold miss vs client wall 분리 (관측 전용, JSON 불변).
 * warm TTL hit 은 기존 `[hub-badge-breakdown]` hub_badge_memory_ttl 만 유지.
 */
import type { HubBadgeBreakdown } from "@/lib/chats/hub-badge-breakdown";

export type HubColdClientWallBreakdown = {
  cache_hit: 0 | 1;
  server_actual_handler_ms: number;
  auth_ms: number;
  cm_unread_ms: number;
  store_lookup_ms: number;
  /** unread_parts (trade/social/chat counters) — notifications API 와 별도 */
  notification_ms: number;
  cache_lookup_ms: number;
  cache_set_ms: number;
  payload_build_ms: number;
  unread_parts_ms: number;
  store_attention_ms: number;
  server_build_ms: number;
  singleflight_hit: 0 | 1;
  duplicate_inflight_join: 0 | 1;
  hub_badge_deferred: 0 | 1;
  client_wall_ms: number | null;
  client_minus_server_ms: number | null;
  next_dev_compile_ms: number | null;
  next_dev_render_ms: number | null;
  cold_bottleneck_cause: string;
  server_dominated: boolean;
  client_or_compile_dominated: boolean;
  cm_unread_dominated: boolean;
  store_lookup_dominated: boolean;
  api_judgment_ms_field: "actual_handler_ms";
};

export function buildHubColdClientWallBreakdown(input: {
  cache_hit: 0 | 1;
  server_actual_handler_ms: number;
  auth_ms: number;
  hub: HubBadgeBreakdown | null;
  cache_lookup_ms: number;
  cache_set_ms: number;
  server_build_ms: number;
  singleflight_hit: 0 | 1;
  duplicate_inflight_join: 0 | 1;
  hub_badge_deferred: boolean;
  client_wall_ms?: number | null;
  next_dev_compile_ms?: number | null;
  next_dev_render_ms?: number | null;
}): HubColdClientWallBreakdown {
  const hub = input.hub;
  const cm_unread_ms = Math.round(hub?.cm_unread_ms ?? 0);
  const store_lookup_ms = Math.round(hub?.find_hub_store_ms ?? 0);
  const notification_ms = Math.round(hub?.unread_parts_ms ?? 0);
  const payload_build_ms = Math.round(hub?.payload_build_ms ?? 0);
  const unread_parts_ms = notification_ms;
  const store_attention_ms = Math.round(hub?.store_attention_total_ms ?? 0);

  const client_wall_ms =
    input.client_wall_ms != null && Number.isFinite(input.client_wall_ms)
      ? Math.round(input.client_wall_ms)
      : null;
  const client_minus_server_ms =
    client_wall_ms != null ? Math.max(0, client_wall_ms - input.server_actual_handler_ms) : null;

  const compileMs = input.next_dev_compile_ms ?? 0;
  const client_or_compile_dominated =
    client_wall_ms != null &&
    (client_minus_server_ms ?? 0) >= 200 &&
    (compileMs >= 400 || (client_minus_server_ms ?? 0) > input.server_actual_handler_ms * 1.5);

  const server_dominated =
    !client_or_compile_dominated &&
    input.server_actual_handler_ms >= 80 &&
    (client_wall_ms == null || input.server_actual_handler_ms >= (client_wall_ms ?? 0) * 0.45);

  const cm_unread_dominated =
    server_dominated && cm_unread_ms >= 80 && cm_unread_ms >= store_lookup_ms && cm_unread_ms >= notification_ms;

  const store_lookup_dominated =
    server_dominated &&
    !cm_unread_dominated &&
    store_lookup_ms >= 80 &&
    store_lookup_ms >= cm_unread_ms;

  let cold_bottleneck_cause = "none";
  if (input.cache_hit === 1) {
    cold_bottleneck_cause = "warm_ttl_skip";
  } else if (client_or_compile_dominated) {
    cold_bottleneck_cause = compileMs >= 400 ? "next_dev_compile_or_client_rtt" : "client_wall_minus_server";
  } else if (input.duplicate_inflight_join) {
    cold_bottleneck_cause = "duplicate_inflight_join";
  } else if (cm_unread_dominated) {
    cold_bottleneck_cause = "cm_unread_query";
  } else if (store_lookup_dominated) {
    cold_bottleneck_cause = "store_lookup";
  } else if (notification_ms >= 80 && notification_ms >= cm_unread_ms) {
    cold_bottleneck_cause = "unread_parts";
  } else if (server_dominated) {
    cold_bottleneck_cause = hub?.worst_stage ? String(hub.worst_stage) : "server_handler";
  } else if (client_wall_ms != null && client_wall_ms >= 300) {
    cold_bottleneck_cause = "local_linked_client_rtt";
  }

  return {
    cache_hit: input.cache_hit,
    server_actual_handler_ms: input.server_actual_handler_ms,
    auth_ms: Math.round(input.auth_ms),
    cm_unread_ms,
    store_lookup_ms,
    notification_ms,
    cache_lookup_ms: Math.round(input.cache_lookup_ms),
    cache_set_ms: Math.round(input.cache_set_ms),
    payload_build_ms,
    unread_parts_ms,
    store_attention_ms,
    server_build_ms: Math.round(input.server_build_ms),
    singleflight_hit: input.singleflight_hit,
    duplicate_inflight_join: input.duplicate_inflight_join,
    hub_badge_deferred: input.hub_badge_deferred ? 1 : 0,
    client_wall_ms,
    client_minus_server_ms,
    next_dev_compile_ms: input.next_dev_compile_ms ?? null,
    next_dev_render_ms: input.next_dev_render_ms ?? null,
    cold_bottleneck_cause,
    server_dominated,
    client_or_compile_dominated,
    cm_unread_dominated,
    store_lookup_dominated,
    api_judgment_ms_field: "actual_handler_ms",
  };
}

export function logHubColdClientWallBreakdown(row: HubColdClientWallBreakdown): void {
  if (process.env.NODE_ENV !== "development") return;
  // eslint-disable-next-line no-console -- hub cold client wall (measure script)
  console.info(`[hub-cold-client-wall-breakdown] ${JSON.stringify(row)}`);
}
