/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveLayoutMode } from "@/lib/device/dibay-layout-resolver";
import {
  classifyCommunityPresentationSurface,
  resolveCommunityPresentation,
  shouldComposeCommunityDual,
  shouldMountCommunityMasterList,
} from "@/lib/device/dibay-community-presentation";
import { DIBAY_COMMUNITY_GEOMETRY } from "@/lib/device/dibay-domain-geometry";
import { resolveCommunityFeedScrollRoot } from "@/lib/community/community-post-entry-nav";

const root = join(__dirname, "../../..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function authority(deviceClass: Parameters<typeof resolveLayoutMode>[0]["deviceClass"], usableWidthPx: number) {
  const layout = resolveLayoutMode({
    deviceClass,
    usableWidthPx,
    domain: "community",
  });
  const presentation = resolveCommunityPresentation(layout.layoutMode);
  return { layoutMode: layout.layoutMode, presentation };
}

describe("Community wide contract C1–C7", () => {
  it("C1 PHONE stays single-pane; select unmounts master", () => {
    const phone = authority("PHONE_ANDROID", 390);
    expect(phone.presentation).toBe("SINGLE");
    expect(shouldComposeCommunityDual({ presentation: "SINGLE", surface: "hub" })).toBe(false);
    expect(shouldComposeCommunityDual({ presentation: "SINGLE", surface: "detail" })).toBe(false);
    expect(shouldMountCommunityMasterList({ surface: "hub", composed: false })).toBe(true);
    expect(shouldMountCommunityMasterList({ surface: "detail", composed: false })).toBe(false);
  });

  it("C2 TABLET/WIDE master+detail coexist only after select", () => {
    const tablet = authority("TABLET_ANDROID", 1007);
    expect(tablet.presentation).toBe("DUAL");
    expect(shouldComposeCommunityDual({ presentation: "DUAL", surface: "hub" })).toBe(false);
    expect(shouldComposeCommunityDual({ presentation: "DUAL", surface: "detail" })).toBe(true);
    expect(
      shouldMountCommunityMasterList({
        surface: "detail",
        composed: shouldComposeCommunityDual({ presentation: "DUAL", surface: "detail" }),
      }),
    ).toBe(true);
    const desktop = authority("DESKTOP_WINDOWS", 1400);
    expect(desktop.presentation).toBe("DUAL");
    expect(shouldComposeCommunityDual({ presentation: desktop.presentation, surface: "detail" })).toBe(true);
  });

  it("C3 WIDE SELECT does not remove master", () => {
    expect(shouldMountCommunityMasterList({ surface: "detail", composed: true })).toBe(true);
    const scope = read("components/community/CommunityUiScope.tsx");
    expect(scope).toContain("shouldMountCommunityMasterList");
    expect(scope).toContain("PhilifeFeedClientEntry");
    expect(scope).not.toContain("if (authority.surface === \"detail\") return null");
  });

  it("C4 MASTER SCROLL owner is hub body unless dual list pane exists", () => {
    const dualDoc = document.implementation.createHTMLDocument("dual");
    const list = dualDoc.createElement("div");
    list.setAttribute("data-dibay-community-pane", "list");
    const hub = dualDoc.createElement("main");
    hub.setAttribute("data-main-hub-scroll-body", "");
    dualDoc.body.append(hub, list);
    expect(resolveCommunityFeedScrollRoot(dualDoc)).toBe(list);

    const hubDoc = document.implementation.createHTMLDocument("hub");
    const hubOnly = hubDoc.createElement("main");
    hubOnly.setAttribute("data-main-hub-scroll-body", "");
    hubDoc.body.append(hubOnly);
    expect(resolveCommunityFeedScrollRoot(hubDoc)).toBe(hubOnly);
    const css = read("lib/community/community-design-tokens.css");
    expect(css).toContain(".dibay-community-pane-list");
    expect(css).toContain("overflow-y: auto");
    expect(css).toContain("[data-main-hub-scroll-body]:has([data-dibay-community-composed=\"dual\"])");
  });

  it("C5 DETAIL CHANGE A→B keeps master mounted", () => {
    const composedA = shouldComposeCommunityDual({ presentation: "DUAL", surface: "detail" });
    const composedB = shouldComposeCommunityDual({ presentation: "DUAL", surface: "detail" });
    expect(composedA).toBe(true);
    expect(composedB).toBe(true);
    expect(shouldMountCommunityMasterList({ surface: "detail", composed: composedA })).toBe(true);
    expect(shouldMountCommunityMasterList({ surface: "detail", composed: composedB })).toBe(true);
    expect(classifyCommunityPresentationSurface("/philife/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBe(
      "detail",
    );
    expect(classifyCommunityPresentationSurface("/philife/bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee")).toBe(
      "detail",
    );
  });

  it("C6 WINDOW RESIZE does not keep stale dual authority", () => {
    const wide = authority("TABLET_ANDROID", 1007);
    const narrow = authority("TABLET_ANDROID", 601);
    const wideAgain = authority("TABLET_ANDROID", 1007);
    expect(wide.presentation).toBe("DUAL");
    expect(narrow.presentation).toBe("STACKED");
    expect(wideAgain.presentation).toBe("DUAL");
    expect(shouldComposeCommunityDual({ presentation: narrow.presentation, surface: "detail" })).toBe(false);
    expect(shouldComposeCommunityDual({ presentation: wideAgain.presentation, surface: "detail" })).toBe(true);
    expect(shouldMountCommunityMasterList({ surface: "detail", composed: false })).toBe(false);
  });

  it("C7 Community does not add a shadow Device/Window breakpoint", () => {
    const scope = read("components/community/CommunityUiScope.tsx");
    const feed = read("components/community/CommunityFeed.tsx");
    const presentation = read("lib/device/dibay-community-presentation.ts");
    const css = read("lib/community/community-design-tokens.css");
    expect(scope).not.toContain("matchMedia");
    expect(scope).not.toContain("window.innerWidth");
    expect(feed).not.toContain("max-width: 767px");
    expect(presentation).toContain("resolveCommunityPresentation");
    expect(presentation).not.toContain("767");
    expect(css).not.toMatch(/@media\s*\(\s*min-width:\s*840px\s*\)/);
    expect(DIBAY_COMMUNITY_GEOMETRY.listMinPx).toBe(360);
    expect(DIBAY_COMMUNITY_GEOMETRY.detailMinPx).toBe(480);
    expect(css).toContain("min-width: 360px");
    expect(css).toContain("min-width: 480px");
    expect(css).not.toContain("clamp(360px, 38%, 420px)");
  });
});
