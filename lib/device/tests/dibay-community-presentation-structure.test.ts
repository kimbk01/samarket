import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../../..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("FD5 Community presentation structure", () => {
  it("CommunityFeed no longer uses a 767 Device identity mq", () => {
    const feed = read("components/community/CommunityFeed.tsx");
    expect(feed).not.toContain("max-width: 767px");
    expect(feed).not.toContain("max-width:767px");
    expect(feed).toContain("useDibayCommunityPresentation");
    expect(feed).toContain('presentation === "SINGLE"');
  });

  it("CommunityUiScope exposes one presentation authority for JS and CSS", () => {
    const scope = read("components/community/CommunityUiScope.tsx");
    expect(scope).toContain("data-dibay-community-presentation");
    expect(scope).toContain("data-dibay-community-composed");
    expect(scope).not.toContain("matchMedia");
    expect(scope).not.toContain("<MobileCommunity");
    expect(scope).not.toContain("<TabletCommunity");
    expect(scope).not.toContain("<DesktopCommunity");
  });

  it("CSS styles dual composition and does not choose Device at 767/840", () => {
    const css = read("lib/community/community-design-tokens.css");
    expect(css).toContain("[data-dibay-community-composed=\"dual\"]");
    expect(css).not.toMatch(/@media\s*\(\s*min-width:\s*840px\s*\)/);
    expect(css).not.toMatch(/@media\s*\(\s*min-width:\s*767px\s*\)/);
    expect(css).not.toMatch(/@media\s*\(\s*max-width:\s*767px\s*\)/);
  });

  it("does not reopen Messenger 768 or Trade grid", () => {
    expect(read("lib/ui/app-viewport-layout-breakpoints.ts")).toContain("768");
    const trade = read("lib/device/dibay-domain-geometry.ts");
    expect(trade).toContain("DIBAY_TRADE_GEOMETRY");
    expect(trade).toContain("twoPaneFloorPx: 720");
  });
});
