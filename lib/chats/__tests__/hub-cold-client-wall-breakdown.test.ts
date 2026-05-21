import { describe, expect, it } from "vitest";
import { buildHubColdClientWallBreakdown } from "@/lib/chats/hub-cold-client-wall-breakdown";

describe("buildHubColdClientWallBreakdown", () => {
  it("flags client/compile when client wall far exceeds server", () => {
    const r = buildHubColdClientWallBreakdown({
      cache_hit: 0,
      server_actual_handler_ms: 42,
      auth_ms: 10,
      hub: {
        total_ms: 40,
        find_hub_store_ms: 5,
        unread_parts_ms: 8,
        cm_unread_ms: 12,
        store_order_unread_ms: 0,
        store_attention_total_ms: 10,
        payload_build_ms: 1,
        cache_hit: 0,
        query_wave_1_ms: 20,
        query_wave_2_ms: 15,
        query_wave_3_ms: 10,
        worst_stage: "cm_unread",
        worst_stage_ms: 12,
        refund_pending_ms: 0,
        order_pending_ms: 0,
        inquiry_pending_ms: 0,
        has_hub_store: 1,
      },
      cache_lookup_ms: 0,
      cache_set_ms: 0,
      server_build_ms: 40,
      singleflight_hit: 0,
      duplicate_inflight_join: 0,
      hub_badge_deferred: true,
      client_wall_ms: 920,
      next_dev_compile_ms: 4100,
      next_dev_render_ms: 120,
    });
    expect(r.client_or_compile_dominated).toBe(true);
    expect(r.cold_bottleneck_cause).toBe("next_dev_compile_or_client_rtt");
  });

  it("flags cm_unread when server dominates", () => {
    const r = buildHubColdClientWallBreakdown({
      cache_hit: 0,
      server_actual_handler_ms: 520,
      auth_ms: 20,
      hub: {
        total_ms: 500,
        find_hub_store_ms: 40,
        unread_parts_ms: 60,
        cm_unread_ms: 380,
        store_order_unread_ms: 50,
        store_attention_total_ms: 80,
        payload_build_ms: 2,
        cache_hit: 0,
        query_wave_1_ms: 200,
        query_wave_2_ms: 400,
        query_wave_3_ms: 80,
        worst_stage: "cm_unread",
        worst_stage_ms: 380,
        refund_pending_ms: 0,
        order_pending_ms: 0,
        inquiry_pending_ms: 0,
        has_hub_store: 1,
      },
      cache_lookup_ms: 1,
      cache_set_ms: 0,
      server_build_ms: 500,
      singleflight_hit: 0,
      duplicate_inflight_join: 0,
      hub_badge_deferred: true,
      client_wall_ms: 580,
    });
    expect(r.cm_unread_dominated).toBe(true);
    expect(r.cold_bottleneck_cause).toBe("cm_unread_query");
  });
});
