import { describe, expect, it } from "vitest";
import { evaluateDevMemoryGuard } from "@/lib/dev/dev-memory-growth-diagnosis";

describe("evaluateDevMemoryGuard", () => {
  it("flags HMR graph when in-process cache is tiny vs heap", () => {
    const g = evaluateDevMemoryGuard({ heap_mb: 4313, inprocess_cache_estimated_mb: 0.018 });
    expect(g.likely_next_hmr_graph_dominates).toBe(true);
    expect(g.cache_not_primary_reason).toContain("HMR graph");
    expect(g.memory_guard_level).toBe("warn");
  });

  it("critical at 5GB heap", () => {
    const g = evaluateDevMemoryGuard({ heap_mb: 5200, inprocess_cache_estimated_mb: 0.02 });
    expect(g.memory_guard_level).toBe("critical");
  });

  it("ok when heap moderate and cache not dominant", () => {
    const g = evaluateDevMemoryGuard({ heap_mb: 800, inprocess_cache_estimated_mb: 0.5 });
    expect(g.memory_guard_level).toBe("ok");
    expect(g.likely_next_hmr_graph_dominates).toBe(false);
  });
});
