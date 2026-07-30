import { describe, expect, it } from "vitest";
import {
  resolveMessengerHubForm,
  resolveMessengerHubLayoutMode,
  resolveMessengerHubOrientation,
  messengerHubSurfaceDataAttrs,
} from "@/lib/ui/messenger-hub-surface";
import { APP_MESSENGER_SPLIT_MEDIA_QUERY } from "@/lib/ui/app-viewport-layout-breakpoints";

describe("messenger hub surface (ios/apk/window · portrait/landscape)", () => {
  it("split media requires landscape (not width-only)", () => {
    expect(APP_MESSENGER_SPLIT_MEDIA_QUERY).toContain("min-width: 768px");
    expect(APP_MESSENGER_SPLIT_MEDIA_QUERY).toContain("orientation: landscape");
  });

  it("portrait never maps to split layout mode", () => {
    expect(resolveMessengerHubLayoutMode(false)).toBe("hub");
    expect(resolveMessengerHubLayoutMode(true)).toBe("split");
    expect(resolveMessengerHubOrientation(800, 1280)).toBe("portrait");
    expect(resolveMessengerHubOrientation(1280, 800)).toBe("landscape");
  });

  it("separates phone / tablet / desktop form", () => {
    expect(
      resolveMessengerHubForm({ width: 390, isTouch: true, platform: "ios" })
    ).toBe("phone");
    expect(
      resolveMessengerHubForm({ width: 800, isTouch: true, platform: "android" })
    ).toBe("tablet");
    expect(
      resolveMessengerHubForm({ width: 1440, isTouch: false, platform: "window" })
    ).toBe("desktop");
  });

  it("stamps platform/form/orientation/layout data attrs", () => {
    const attrs = messengerHubSurfaceDataAttrs({
      platform: "ios",
      form: "tablet",
      orientation: "portrait",
      layout: "hub",
    });
    expect(attrs["data-messenger-hub-platform"]).toBe("ios");
    expect(attrs["data-messenger-hub-form"]).toBe("tablet");
    expect(attrs["data-messenger-hub-orientation"]).toBe("portrait");
    expect(attrs["data-messenger-hub-layout"]).toBe("hub");
  });
});
