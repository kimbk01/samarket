import { beforeEach, describe, expect, it, vi } from "vitest";

const isCapacitorNativePlatform = vi.hoisted(() => vi.fn(() => false));
const resolveCapacitorShellPlatform = vi.hoisted(() =>
  vi.fn((): "android" | "ios" | null => null),
);

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
}));

import {
  filterCapabilityItemsForPlatform,
  isMobileNativePlatform,
  supportsBatteryOptimizationGuide,
  supportsBrowserMediaPermission,
  supportsFullScreenIntent,
  supportsLockScreenIncomingEducation,
  supportsNativeSettingsShortcut,
  supportsOemGuide,
  supportsPermissionEducationContext,
} from "@/lib/permissions/education/permission-education-platform";

describe("permission-education-platform (web)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isCapacitorNativePlatform.mockReturnValue(false);
    resolveCapacitorShellPlatform.mockReturnValue(null);
  });

  it("treats plain web as browser-only capabilities", () => {
    expect(isMobileNativePlatform()).toBe(false);
    expect(supportsBrowserMediaPermission()).toBe(true);
    expect(supportsFullScreenIntent()).toBe(false);
    expect(supportsBatteryOptimizationGuide()).toBe(false);
    expect(supportsOemGuide()).toBe(false);
    expect(supportsNativeSettingsShortcut()).toBe(false);
    expect(supportsLockScreenIncomingEducation()).toBe(false);
  });

  it("filters mobile-only checklist rows on web", () => {
    const items = filterCapabilityItemsForPlatform([
      { id: "notifications", pass: true },
      { id: "lock_screen_incoming", pass: false },
      { id: "full_screen_intent", pass: false },
      { id: "battery", pass: false },
      { id: "microphone", pass: true },
      { id: "camera", pass: false },
    ]);
    expect(items.map((i) => i.id)).toEqual(["notifications", "microphone", "camera"]);
  });

  it("rejects lock-tier education contexts on web", () => {
    expect(supportsPermissionEducationContext({ tier: "lock_screen_fsi" })).toBe(false);
    expect(supportsPermissionEducationContext({ tier: "battery_restricted" })).toBe(false);
    expect(
      supportsPermissionEducationContext({ tier: "call_voice", flow: "outgoing", kind: "voice" }),
    ).toBe(true);
  });
});

describe("permission-education-platform (android native)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isCapacitorNativePlatform.mockReturnValue(true);
    resolveCapacitorShellPlatform.mockReturnValue("android");
  });

  it("keeps full mobile capability set on android", () => {
    expect(isMobileNativePlatform()).toBe(true);
    expect(supportsFullScreenIntent()).toBe(true);
    expect(supportsBatteryOptimizationGuide()).toBe(true);
    expect(supportsOemGuide()).toBe(true);
    expect(supportsNativeSettingsShortcut()).toBe(true);
    expect(supportsLockScreenIncomingEducation()).toBe(true);
    expect(supportsBrowserMediaPermission()).toBe(false);
  });

  it("keeps all six checklist rows on android", () => {
    const items = filterCapabilityItemsForPlatform([
      { id: "notifications", pass: true },
      { id: "lock_screen_incoming", pass: false },
      { id: "full_screen_intent", pass: false },
      { id: "battery", pass: false },
      { id: "microphone", pass: true },
      { id: "camera", pass: false },
    ]);
    expect(items).toHaveLength(6);
  });
});
