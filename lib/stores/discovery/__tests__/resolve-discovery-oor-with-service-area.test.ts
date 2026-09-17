import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sortDiscoveryRowsByEligibilityThenDistance } from "@/lib/stores/discovery/resolve-discovery-oor-with-service-area";

describe("CUT 2 — discovery OOR / ranking parity", () => {
  it("sorts by eligibility rank then distance", () => {
    const ranks = new Map([
      ["a", 5],
      ["b", 0],
      ["c", 0],
    ]);
    const dist = new Map<string, number | null>([
      ["a", 1],
      ["b", 9],
      ["c", 3],
    ]);
    const sorted = sortDiscoveryRowsByEligibilityThenDistance(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      ranks,
      dist
    );
    expect(sorted.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("live loaders remap V2 OOR and pass memberLguId from HOME/Browse", () => {
    const live = readFileSync(
      join(process.cwd(), "lib/stores/discovery/load-store-discovery-ranked-live.ts"),
      "utf8"
    );
    const home = readFileSync(join(process.cwd(), "app/api/stores/home-feed/route.ts"), "utf8");
    const snap = readFileSync(
      join(process.cwd(), "lib/stores/stores-browse-snapshot.ts"),
      "utf8"
    );
    const browse = readFileSync(
      join(process.cwd(), "lib/stores/stores-browse-build.ts"),
      "utf8"
    );
    expect(live).toContain("resolveDiscoveryOorWithServiceAreaAuthority");
    expect(live).toContain("memberLguId");
    expect(home).toContain("memberLguId: origin.canonicalLguId");
    expect(snap).toContain("memberLguId: ctx.origin.canonicalLguId");
    expect(browse).toContain(
      "CUT 2 — display/status OOR always from dual-mode evaluator"
    );
    expect(browse).not.toMatch(
      /prefetchedFilter\?\.outOfRangeById\?\.has\(r\.id\) === true/
    );
  });
});
