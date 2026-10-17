import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("android-play-in-app-update native contract", () => {
  it("registers Play Core dependency and Capacitor plugin", () => {
    const gradle = readFileSync(join(root, "android/app/build.gradle"), "utf8");
    expect(gradle).toContain('com.google.android.play:app-update:2.1.0');

    const main = readFileSync(
      join(root, "android/app/src/main/java/com/dibay/app/MainActivity.java"),
      "utf8"
    );
    expect(main).toContain("registerPlugin(DibayPlayInAppUpdatePlugin.class);");

    const plugin = readFileSync(
      join(root, "android/app/src/main/java/com/dibay/app/DibayPlayInAppUpdatePlugin.java"),
      "utf8"
    );
    expect(plugin).toContain('@CapacitorPlugin(name = "DibayPlayInAppUpdate")');
    expect(plugin).toContain("AppUpdateManagerFactory");
    expect(plugin).toContain("AppUpdateType.FLEXIBLE");
    expect(plugin).toContain("AppUpdateType.IMMEDIATE");
    expect(plugin).toContain("DibayActiveCallSessionManager.getActiveCallId()");
    expect(plugin).toContain("completeUpdate");
  });

  it("keeps Play Core classes in release ProGuard rules", () => {
    const proguard = readFileSync(join(root, "android/app/proguard-rules.pro"), "utf8");
    expect(proguard).toContain("com.google.android.play.core");
  });

  it("wires Android-only host into main provider tree", () => {
    const tree = readFileSync(join(root, "components/layout/MainAppProviderTree.tsx"), "utf8");
    expect(tree).toContain("AndroidPlayInAppUpdateHost");
    expect(tree).toContain("AndroidPlayInAppUpdateHostLazy");
  });
});
