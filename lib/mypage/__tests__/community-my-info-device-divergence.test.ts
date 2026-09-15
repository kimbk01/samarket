import { describe, expect, it } from "vitest";
import { resolveMypageSectionLegacyHubRedirect } from "@/lib/mypage/mypage-section-legacy-redirect";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("My Info Community management surfaces", () => {
  it("does not redirect favorite-posts into activity hub (unsave surface)", () => {
    expect(resolveMypageSectionLegacyHubRedirect("community", "favorite-posts")).toBeNull();
    expect(resolveMypageSectionLegacyHubRedirect("community", "liked-posts")).toBeNull();
    expect(resolveMypageSectionLegacyHubRedirect("community", "community-friends")).toBeNull();
  });

  it("CommunityTab clones community-activity Response before json()", () => {
    const src = readFileSync(
      path.join(process.cwd(), "components/mypage/tabs/CommunityTab.tsx"),
      "utf8"
    );
    expect(src).toContain("res.clone().json()");
  });
});
