import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const RUNNER = join(
  process.cwd(),
  ".tmp/intro-final-reconstruction/qa/run-scenario-qa.mjs",
);

describe("C7 QA runner false-PASS prevention", () => {
  it("runner exists with single setScenario writer + counts from results", () => {
    expect(existsSync(RUNNER)).toBe(true);
    const src = readFileSync(RUNNER, "utf8");
    expect(src).toContain("function setScenario(");
    expect(src).toContain('const allowed = new Set(["PASS", "FAIL", "NOT_PROVEN", "API_OK"])');
    expect(src).toContain("function apiStatus");
    expect(src).toMatch(/return ok \? "API_OK" : "FAIL"/);
    expect(src).toMatch(/counts\s*=\s*\{\s*PASS:\s*0,\s*FAIL:\s*0,\s*NOT_PROVEN:\s*0,\s*API_OK:\s*0/);
    // Counts derived from results object — not a parallel stale writer
    expect(src).toContain("results[id]?.status");
    expect(src).toContain("HARD LOCK = **FORBIDDEN**");
    expect(src).toContain("API_OK ≠ product PASS");
    // Device cold shots must not auto PASS
    expect(src).toMatch(/Cold screenshots captured[\s\S]*NOT_PROVEN/);
    // QA Apply reject path
    expect(src).toContain("apply_forbidden_content_class");
    // No corrupted Preview→PASS promotion helper
    expect(src).not.toMatch(/save\.json\?\.apiStatus/);
  });
});

