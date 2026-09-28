import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("HOME_PRESENTATION_READY", () => {
  it("is owned by Community HOME list, not ConditionalAppShell rAF", () => {
    const probe = readFileSync("components/community/CommunityHomePresentationProbe.tsx", "utf8");
    const feed = readFileSync("components/community/CommunityFeed.tsx", "utf8");
    const shell = readFileSync("components/layout/ConditionalAppShell.tsx", "utf8");
    const host = readFileSync("lib/dibay-intro/runtime/home-presentation.ts", "utf8");
    expect(host).toContain("markHomePresentationReady");
    expect(probe).toContain("community_home_list");
    expect(feed).toContain("CommunityHomePresentationProbe");
    expect(shell).toContain("markInitialDestinationVisualReady");
    expect(shell).not.toContain("markHomePresentationReady");
  });
});
