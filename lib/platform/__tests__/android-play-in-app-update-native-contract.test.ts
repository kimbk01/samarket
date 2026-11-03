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

  it("full-screen update (2단계): lifetime progress listener, byte counts, IMMEDIATE resume only after IMMEDIATE", () => {
    const plugin = readFileSync(
      join(root, "android/app/src/main/java/com/dibay/app/DibayPlayInAppUpdatePlugin.java"),
      "utf8"
    );
    const load = plugin.slice(plugin.indexOf("public void load()"), plugin.indexOf("private void ensureUpdateFlowLauncher"));
    expect(load).toContain("registerInstallListener();");
    const onState = plugin.slice(plugin.indexOf("private void onInstallState"), plugin.indexOf("private void notifyFlexibleDownloaded"));
    expect(onState).not.toContain("unregisterInstallListener");
    expect(plugin).toContain('ret.put("totalBytesToDownload", info.totalBytesToDownload());');
    expect(plugin).toContain('ret.put("bytesDownloaded", info.bytesDownloaded());');
    expect(plugin).toContain('"immediate".equals(readLastFlowType())');
    expect(plugin).toContain("writeLastFlowType(flowType);");
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
