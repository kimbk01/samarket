/**
 * @vitest-environment node
 * Legacy name kept for discoverability — assertions moved to MAIN hub intent contract.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("bottom-nav first-enter hub cover contract (superseded)", () => {
  it("defers to main-hub-intent-transition-contract (COVER terminology retired)", () => {
    const art = readFileSync(join(root, "components/route-transition/AppRouteTransition.tsx"), "utf8");
    expect(art).toContain("MAIN_HUB_TRANSITION_KIND");
    expect(art).toContain("applyMainHubPendingExit");
    expect(art).not.toContain("beginHubNewOnlyRtlEnter");
  });
});
