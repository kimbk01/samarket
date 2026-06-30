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
  isMobileNativePlatform,
  supportsBrowserMediaPermission,
  supportsNativeSettingsShortcut,
  supportsPermissionEducationContext,
} from "@/lib/permissions/education/permission-education-platform";

describe("permission-education-platform (web)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isCapacitorNativePlatform.mockReturnValue(false);
    resolveCapacitorShellPlatform.mockReturnValue(null);
  });

  it("treats plain web as browser-only", () => {
    expect(isMobileNativePlatform()).toBe(false);
    expect(supportsBrowserMediaPermission()).toBe(true);
    expect(supportsNativeSettingsShortcut()).toBe(false);
  });

  it("allows call education contexts on web", () => {
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

  it("enables native settings shortcut on android", () => {
    expect(isMobileNativePlatform()).toBe(true);
    expect(supportsNativeSettingsShortcut()).toBe(true);
    expect(supportsBrowserMediaPermission()).toBe(false);
  });
});
