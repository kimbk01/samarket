import { describe, expect, it } from "vitest";
import { resolveLayoutMode } from "@/lib/device/dibay-layout-resolver";
import {
  classifyCommunityPresentationSurface,
  resolveCommunityPresentation,
  shouldComposeCommunityDual,
} from "@/lib/device/dibay-community-presentation";
import { DIBAY_COMMUNITY_GEOMETRY } from "@/lib/device/dibay-domain-geometry";

function communityMode(
  deviceClass: Parameters<typeof resolveLayoutMode>[0]["deviceClass"],
  usableWidthPx: number,
) {
  const layout = resolveLayoutMode({
    deviceClass,
    usableWidthPx,
    domain: "community",
  });
  return {
    layoutMode: layout.layoutMode,
    presentation: resolveCommunityPresentation(layout.layoutMode),
  };
}

describe("FD5 Community presentation", () => {
  it("PHONE_ANDROID + 390 → COMMUNITY_SINGLE", () => {
    expect(communityMode("PHONE_ANDROID", 390).presentation).toBe("SINGLE");
  });

  it("PHONE_ANDROID + artificial 900 stays SINGLE", () => {
    expect(communityMode("PHONE_ANDROID", 900).presentation).toBe("SINGLE");
  });

  it("PHONE_IOS + 430 → COMMUNITY_SINGLE", () => {
    expect(communityMode("PHONE_IOS", 430).presentation).toBe("SINGLE");
  });

  it("TABLET_ANDROID + 601 → COMMUNITY_STACKED below floor", () => {
    expect(DIBAY_COMMUNITY_GEOMETRY.twoPaneFloorPx).toBe(840);
    expect(communityMode("TABLET_ANDROID", 601).presentation).toBe("STACKED");
  });

  it("TABLET_ANDROID + 1007 → COMMUNITY_DUAL above floor", () => {
    expect(communityMode("TABLET_ANDROID", 1007).presentation).toBe("DUAL");
  });

  it("TABLET_IPAD + 744 → COMMUNITY_STACKED", () => {
    expect(communityMode("TABLET_IPAD", 744).presentation).toBe("STACKED");
  });

  it("TABLET_IPAD + 820 → STACKED according to proven 840 floor", () => {
    expect(communityMode("TABLET_IPAD", 820).presentation).toBe("STACKED");
  });

  it("TABLET_IPAD + 1024 → COMMUNITY_DUAL", () => {
    expect(communityMode("TABLET_IPAD", 1024).presentation).toBe("DUAL");
  });

  it("DESKTOP_WINDOWS + 500 → COMMUNITY_STACKED", () => {
    expect(communityMode("DESKTOP_WINDOWS", 500).presentation).toBe("STACKED");
  });

  it("DESKTOP_WINDOWS + wide → COMMUNITY_DUAL, never triple", () => {
    const result = communityMode("DESKTOP_WINDOWS", 1400);
    expect(result.presentation).toBe("DUAL");
    expect(result.layoutMode).not.toBe("DESKTOP_TRIPLE");
  });

  it("UNKNOWN → safe STACKED without guessing a DeviceClass", () => {
    expect(communityMode("UNKNOWN", 1200).presentation).toBe("STACKED");
    expect(communityMode("UNKNOWN", 390).presentation).toBe("STACKED");
  });

  it("classifies hub / detail / other surfaces from URL", () => {
    expect(classifyCommunityPresentationSurface("/")).toBe("hub");
    expect(classifyCommunityPresentationSurface("/philife")).toBe("hub");
    expect(classifyCommunityPresentationSurface("/community")).toBe("hub");
    expect(classifyCommunityPresentationSurface("/philife/550e8400-e29b-41d4-a716-446655440000")).toBe(
      "detail",
    );
    expect(classifyCommunityPresentationSurface("/community/posts/550e8400-e29b-41d4-a716-446655440000")).toBe(
      "detail",
    );
    expect(classifyCommunityPresentationSurface("/philife/write")).toBe("other");
    expect(classifyCommunityPresentationSurface("/philife/my")).toBe("other");
  });

  it("composes dual only on hub/detail, never on write/my", () => {
    expect(shouldComposeCommunityDual({ presentation: "DUAL", surface: "hub" })).toBe(true);
    expect(shouldComposeCommunityDual({ presentation: "DUAL", surface: "detail" })).toBe(true);
    expect(shouldComposeCommunityDual({ presentation: "DUAL", surface: "other" })).toBe(false);
    expect(shouldComposeCommunityDual({ presentation: "SINGLE", surface: "detail" })).toBe(false);
    expect(shouldComposeCommunityDual({ presentation: "STACKED", surface: "hub" })).toBe(false);
  });
});
