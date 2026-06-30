import { beforeEach, describe, expect, it, vi } from "vitest";

const isCapacitorNativePlatform = vi.hoisted(() => vi.fn(() => false));
const resolveCapacitorShellPlatform = vi.hoisted(() =>
  vi.fn((): "android" | "ios" | null => null),
);

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
}));

import { resolvePermissionEducationCopy } from "@/lib/permissions/education/permission-education-copy";
import {
  shouldShowBrowserMediaHelp,
  shouldShowNativeSettingsCta,
} from "@/lib/permissions/education/permission-education-sheet-ui";

describe("permission education sheet UI (web)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isCapacitorNativePlatform.mockReturnValue(false);
    resolveCapacitorShellPlatform.mockReturnValue(null);
  });

  it("hides native settings CTA and shows browser help on web call education", () => {
    const copy = resolvePermissionEducationCopy({
      tier: "call_voice",
      flow: "outgoing",
      kind: "voice",
    });
    expect(copy.settingsOpens).toBe("browser_media");
    expect(shouldShowNativeSettingsCta(copy)).toBe(false);
    expect(shouldShowBrowserMediaHelp(copy)).toBe(true);
  });
});

describe("permission education sheet UI (android)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isCapacitorNativePlatform.mockReturnValue(true);
    resolveCapacitorShellPlatform.mockReturnValue("android");
  });

  it("shows native settings CTA on android call education", () => {
    const copy = resolvePermissionEducationCopy({
      tier: "call_video",
      flow: "incoming",
      kind: "video",
    });
    expect(copy.settingsOpens).toBe("call_media");
    expect(shouldShowNativeSettingsCta(copy)).toBe(true);
    expect(shouldShowBrowserMediaHelp(copy)).toBe(false);
  });
});
