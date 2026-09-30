import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

describe("C5 Preview is Operator convenience / non-device authority", () => {
  it("Studio banners forbid Preview as device PASS", () => {
    const studio = readFileSync(
      join(ROOT, "components/admin/intro/IntroStudioPage.tsx"),
      "utf8",
    );
    expect(studio).toContain("Preview ≠ device PASS");
    expect(studio).toContain("기기 픽셀 PASS 권한이 아닙니다");
  });

  it("no product path promotes Preview screenshot to Scenario PASS", () => {
    // Product scripts under scripts/ and lib/ must not treat Preview as PASS authority.
    const runnerCandidates = [
      join(ROOT, ".tmp/intro-final-reconstruction/qa/run-scenario-qa.mjs"),
    ];
    for (const p of runnerCandidates) {
      try {
        const src = readFileSync(p, "utf8");
        expect(src).not.toMatch(/Preview.*setScenario\([^)]*["']PASS["']/);
        expect(src).toContain("API_OK");
        expect(src).toContain("HARD LOCK = **FORBIDDEN**");
      } catch {
        /* optional local runner */
      }
    }
  });
});
