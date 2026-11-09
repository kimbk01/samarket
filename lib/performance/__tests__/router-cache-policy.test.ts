import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import { ROUTER_CACHE_STALE_TIMES_S, ROUTER_PREFETCH_REWARM_MIN_HIDDEN_MS } from "@/lib/performance/router-cache-policy";

describe("router cache policy", () => {
  it("next.config.js staleTimes 와 같은 값", () => {
    const require = createRequire(import.meta.url);
    const cfg = require(path.resolve(process.cwd(), "next.config.js")) as {
      experimental?: { staleTimes?: { dynamic?: number; static?: number } };
    };
    expect(cfg.experimental?.staleTimes).toEqual(ROUTER_CACHE_STALE_TIMES_S);
  });

  it("복귀 재준비 기준 = dynamic 만료", () => {
    expect(ROUTER_PREFETCH_REWARM_MIN_HIDDEN_MS).toBe(300_000);
  });
});
