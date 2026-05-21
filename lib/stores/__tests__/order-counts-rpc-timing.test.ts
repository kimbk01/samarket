import { describe, expect, it } from "vitest";
import { enrichOrderCountsRpcTiming } from "@/lib/stores/order-counts-rpc-timing";

describe("enrichOrderCountsRpcTiming", () => {
  it("marks postgrest RTT when wall high and parse low", () => {
    const r = enrichOrderCountsRpcTiming({
      auth_ms: 12,
      ownership_ms: 0,
      rpc_wall_ms: 208,
      rpc_parse_ms: 2,
      payload_build_ms: 1,
      cache_set_ms: 0,
    });
    expect(r.rpc_rtt_limited).toBe(true);
    expect(r.cold_bottleneck_cause).toBe("postgrest_rtt");
    expect(r.rpc_transport_estimated_ms).toBeGreaterThan(180);
  });
});
