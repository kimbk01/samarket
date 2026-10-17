import { describe, expect, it } from "vitest";
import {
  decideAndroidPlayUpdateFlow,
  parseAndroidImmediateUpdateFlag,
  parseAndroidMinVersionCode,
  resolveAndroidVersionFreshness,
  shouldPreferImmediateUpdate,
} from "@/lib/platform/android-play-in-app-update-policy";

describe("android-play-in-app-update-policy", () => {
  it("parses min version code and immediate flag safely", () => {
    expect(parseAndroidMinVersionCode("3")).toBe(3);
    expect(parseAndroidMinVersionCode("0")).toBeNull();
    expect(parseAndroidMinVersionCode("abc")).toBeNull();
    expect(parseAndroidImmediateUpdateFlag("1")).toBe(true);
    expect(parseAndroidImmediateUpdateFlag("true")).toBe(true);
    expect(parseAndroidImmediateUpdateFlag("no")).toBe(false);
    expect(parseAndroidImmediateUpdateFlag(null)).toBe(false);
  });

  it("defaults to flexible and never force-immediate without policy", () => {
    const decision = decideAndroidPlayUpdateFlow({
      info: {
        updateAvailability: "UPDATE_AVAILABLE",
        installStatus: "UNKNOWN",
        flexibleAllowed: true,
        immediateAllowed: true,
        installedVersionCode: 2,
      },
      policy: { androidMinVersionCode: null, androidImmediateUpdate: false },
      blockUi: false,
    });
    expect(decision.choice).toBe("flexible");
    expect(decision.reason).toBe("default_flexible");
  });

  it("prefers immediate when server policy requires it and Play allows", () => {
    expect(
      shouldPreferImmediateUpdate({
        installedVersionCode: 2,
        policy: { androidMinVersionCode: 3, androidImmediateUpdate: false },
      })
    ).toBe(true);

    const decision = decideAndroidPlayUpdateFlow({
      info: {
        updateAvailability: "UPDATE_AVAILABLE",
        installStatus: "UNKNOWN",
        flexibleAllowed: true,
        immediateAllowed: true,
        installedVersionCode: 2,
      },
      policy: { androidMinVersionCode: 3, androidImmediateUpdate: false },
      blockUi: false,
    });
    expect(decision.choice).toBe("immediate");
  });

  it("falls back to flexible when immediate is required but not allowed", () => {
    const decision = decideAndroidPlayUpdateFlow({
      info: {
        updateAvailability: "UPDATE_AVAILABLE",
        installStatus: "UNKNOWN",
        flexibleAllowed: true,
        immediateAllowed: false,
        installedVersionCode: 2,
      },
      policy: { androidMinVersionCode: null, androidImmediateUpdate: true },
      blockUi: false,
    });
    expect(decision.choice).toBe("flexible");
    expect(decision.reason).toBe("immediate_unavailable_fallback_flexible");
  });

  it("blocks UI during calls and surfaces downloaded install confirmation", () => {
    expect(
      decideAndroidPlayUpdateFlow({
        info: {
          updateAvailability: "UPDATE_AVAILABLE",
          installStatus: "UNKNOWN",
          flexibleAllowed: true,
          callInProgress: true,
        },
        policy: { androidMinVersionCode: null, androidImmediateUpdate: false },
        blockUi: true,
      }).choice
    ).toBe("none");

    expect(
      decideAndroidPlayUpdateFlow({
        info: {
          updateAvailability: "UPDATE_AVAILABLE",
          installStatus: "DOWNLOADED",
          flexibleAllowed: true,
        },
        policy: { androidMinVersionCode: null, androidImmediateUpdate: false },
        blockUi: false,
      }).choice
    ).toBe("complete_flexible");
  });

  it("never labels unknown Play status as latest", () => {
    expect(
      resolveAndroidVersionFreshness({
        platformIsAndroidNative: true,
        updateInfo: null,
        checkError: null,
      })
    ).toBe("unknown");

    expect(
      resolveAndroidVersionFreshness({
        platformIsAndroidNative: true,
        updateInfo: {
          updateAvailability: "UNKNOWN",
          installStatus: "UNKNOWN",
        },
        checkError: null,
      })
    ).toBe("unknown");

    expect(
      resolveAndroidVersionFreshness({
        platformIsAndroidNative: true,
        updateInfo: {
          updateAvailability: "UPDATE_NOT_AVAILABLE",
          installStatus: "UNKNOWN",
        },
        checkError: null,
      })
    ).toBe("latest");

    expect(
      resolveAndroidVersionFreshness({
        platformIsAndroidNative: true,
        updateInfo: null,
        checkError: "network",
      })
    ).toBe("check_failed");
  });
});
