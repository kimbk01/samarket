import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const CALL_LOCK_FILES = [
  "android/app/src/main/java/com/dibay/app/call/NativeActiveCallHeartbeatOwner.java",
  "ios/App/App/Call/NativeActiveCallHeartbeatOwner.swift",
  "ios/App/App/Push/CallKitProvider.swift",
  "android/app/src/main/java/com/dibay/app/call/NativeCallServicePlugin.java",
];

describe("intro native host is host-only", () => {
  it("does not interpret scenes or layers", () => {
    const android = readFileSync(
      "android/app/src/main/java/com/dibay/app/intro/DibayIntroHostOwner.java",
      "utf8",
    );
    const ios = readFileSync("ios/App/App/Plugins/DibayIntroHostOwner.swift", "utf8");
    for (const src of [android, ios]) {
      expect(src).toMatch(/HOST only/i);
      expect(src).not.toMatch(/sceneIndex|LayerType|containRect|coverRect/);
    }
  });

  it("does not resurrect IntroShowHost", () => {
    const android = readFileSync(
      "android/app/src/main/java/com/dibay/app/intro/DibayIntroHostPlugin.java",
      "utf8",
    );
    expect(android).not.toContain("IntroShowHost");
    expect(android).toContain("DibayIntroHost");
    const owner = readFileSync(
      "android/app/src/main/java/com/dibay/app/intro/DibayIntroHostOwner.java",
      "utf8",
    );
    expect(owner).toContain("https://dibay-intro.local");
    expect(owner).not.toContain("IntroShowHost");
  });

  it("registers DibayIntroHostPlugin after DeviceClass without changing Call class-list", () => {
    const config = JSON.parse(readFileSync("ios/App/App/capacitor.config.json", "utf8")) as {
      packageClassList: string[];
    };
    const patch = readFileSync("scripts/patch-ios-capacitor-package-class-list.mjs", "utf8");
    expect(config.packageClassList).toContain("DibayIntroHostPlugin");
    expect(config.packageClassList).not.toContain("IntroShowHost");
    expect(config.packageClassList.indexOf("DibayIntroHostPlugin")).toBeGreaterThan(
      config.packageClassList.indexOf("DibayDeviceClassPlugin"),
    );
    expect(
      config.packageClassList.slice(
        config.packageClassList.indexOf("NativeCallServicePlugin"),
        config.packageClassList.indexOf("NativeAppleAuthPlugin"),
      ),
    ).toEqual(["NativeCallServicePlugin", "DibayVoipCallPlugin", "DibayCallPipPlugin"]);
    expect(patch).toContain("IOS_INTRO_PACKAGE_CLASSES");
    expect(patch).toContain('"DibayIntroHostPlugin"');
    const callBlock = patch.slice(
      patch.indexOf("IOS_CALL_OUTGOING_PACKAGE_CLASSES"),
      patch.indexOf("IOS_AUTH_PACKAGE_CLASSES"),
    );
    expect(callBlock).not.toContain("DibayIntroHostPlugin");
    expect(callBlock).toContain("NativeCallServicePlugin");
  });
});

describe("call hard lock inventory still present", () => {
  it("keeps the locked call files", () => {
    for (const file of CALL_LOCK_FILES) {
      expect(readFileSync(file, "utf8").length).toBeGreaterThan(20);
    }
  });
});
