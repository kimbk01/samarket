import { describe, expect, it } from "vitest";
import {
  DEFAULT_INITIAL_APP_SURFACE,
  normalizeInitialAppSurface,
  pathForInitialAppSurface,
  resolveInitialAppSurfacePath,
} from "@/lib/startup/initial-app-surface";

describe("initial-app-surface", () => {
  it("defaults to community → /philife", () => {
    expect(DEFAULT_INITIAL_APP_SURFACE).toBe("community");
    expect(pathForInitialAppSurface("community")).toBe("/philife");
    expect(resolveInitialAppSurfacePath({})).toBe("/philife");
  });

  it("maps Admin enums to BottomNav hrefs", () => {
    expect(pathForInitialAppSurface("trade")).toBe("/market");
    expect(pathForInitialAppSurface("food")).toBe("/stores");
    expect(pathForInitialAppSurface("chat")).toBe("/community-messenger?section=chats&inbox=unread");
    expect(pathForInitialAppSurface("my")).toBe("/mypage");
  });

  it("priority: deep link > auth > continue > admin > community", () => {
    expect(
      resolveInitialAppSurfacePath({
        deepLinkPath: "/community-messenger/room/x",
        adminInitialSurface: "trade",
      })
    ).toBe("/community-messenger/room/x");
    expect(
      resolveInitialAppSurfacePath({
        authCallbackPath: "/mypage",
        adminInitialSurface: "trade",
      })
    ).toBe("/mypage");
    expect(
      resolveInitialAppSurfacePath({
        continuePath: "/stores",
        adminInitialSurface: "trade",
      })
    ).toBe("/stores");
    expect(resolveInitialAppSurfacePath({ adminInitialSurface: "trade" })).toBe("/market");
  });

  it("normalizes invalid admin values to community", () => {
    expect(normalizeInitialAppSurface("nope")).toBe("community");
    expect(normalizeInitialAppSurface(null)).toBe("community");
  });
});
