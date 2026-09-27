/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveCommunityFeedScrollRoot } from "@/lib/community/community-post-entry-nav";

const root = join(__dirname, "../../..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("Community original single-page contract C1–C12", () => {
  it("C1–C6 hub/detail stay single-page on phone, tablet, and Windows", () => {
    const scope = read("components/community/CommunityUiScope.tsx");
    const home = read("components/community/CommunityHomeSurface.tsx");
    const detail = read("app/(main)/philife/[postId]/page.tsx");
    expect(scope).toContain("max-w-[66rem]");
    expect(scope).toContain("{children}");
    expect(scope).not.toContain("shouldComposeCommunityDual");
    expect(scope).not.toContain("shouldMountCommunityMasterList");
    expect(scope).not.toContain("dibay-community-pane");
    expect(scope).not.toContain("PhilifeFeedClientEntry");
    expect(home).toContain("PhilifeFeedClientEntry");
    expect(detail).toContain("Detail");
    expect(detail).not.toContain("CommunityUiScope");
    expect(detail).not.toContain("PhilifeFeedClientEntry");
  });

  it("C7 detail does not keep a Community master/list pane", () => {
    const scope = read("components/community/CommunityUiScope.tsx");
    const css = read("lib/community/community-design-tokens.css");
    expect(scope).not.toContain("data-dibay-community-pane");
    expect(scope).not.toContain("dibay-community-dual-frame");
    expect(css).not.toContain("dibay-community-pane-list");
    expect(css).not.toContain("dibay-community-pane-detail");
    expect(css).not.toContain("data-dibay-community-composed");
  });

  it("C8 WRITE is a single Community page", () => {
    const write = read("app/(main)/philife/write/page.tsx");
    expect(write).toContain("WriteForm");
    expect(write).not.toContain("PhilifeFeedClientEntry");
    expect(write).not.toContain("dibay-community-pane");
  });

  it("C9 EDIT is the same single WRITE route", () => {
    const write = read("app/(main)/philife/write/page.tsx");
    expect(write).toContain("editPostId");
    expect(write).not.toContain("shouldMountCommunityMasterList");
  });

  it("C10 DeviceClass / WindowClass files are not Community dual owners", () => {
    expect(read("lib/device/dibay-device-class.ts")).not.toContain("shouldComposeCommunityDual");
    expect(read("lib/device/dibay-window-class.ts")).not.toContain("shouldComposeCommunityDual");
    expect(read("lib/device/dibay-layout-resolver.ts")).not.toContain("shouldComposeCommunityDual");
  });

  it("C11 Community dual-only shadow authority is gone", () => {
    expect(() => read("lib/device/dibay-community-presentation.ts")).toThrow();
    expect(() => read("lib/device/use-dibay-community-presentation.ts")).toThrow();
    const feed = read("components/community/CommunityFeed.tsx");
    expect(feed).not.toContain("useDibayCommunityPresentation");
    expect(feed).not.toContain("resolveCommunityPresentation");
    expect(feed).not.toContain("max-width: 767px");
    expect(feed).toContain("deviceClass === \"PHONE_ANDROID\"");
    const scope = read("components/community/CommunityUiScope.tsx");
    expect(scope).not.toContain("data-dibay-community-composed");
    expect(scope).not.toContain("data-dibay-community-presentation");
  });

  it("C12 Trade / Delivery / Messenger presentation owners are untouched", () => {
    expect(read("lib/device/dibay-domain-geometry.ts")).toContain("DIBAY_TRADE_GEOMETRY");
    expect(read("lib/ui/app-viewport-layout-breakpoints.ts")).toContain("768");
    expect(read("lib/device/dibay-device-class.ts")).toContain("smallestScreenWidthDp");
    expect(read("lib/device/dibay-window-class.ts")).toContain("measureUsableWindow");
  });

  it("hub scroll restores through the single hub body, never a list pane", () => {
    const hubDoc = document.implementation.createHTMLDocument("hub");
    const hub = hubDoc.createElement("main");
    hub.setAttribute("data-main-hub-scroll-body", "");
    const leftover = hubDoc.createElement("div");
    leftover.setAttribute("data-dibay-community-pane", "list");
    hubDoc.body.append(leftover, hub);
    expect(resolveCommunityFeedScrollRoot(hubDoc)).toBe(hub);
  });
});
