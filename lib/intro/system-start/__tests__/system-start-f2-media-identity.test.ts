/**
 * F2 System Start media identity — mediaId alone is not PASS.
 * Materializer must require logoIntegrity byte match when brand enabled.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../../..");

describe("system-start F2 media identity chain", () => {
  it("generate script fails closed without logoIntegrity when brand enabled", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "scripts/generate-system-start-build-input.mjs"),
      "utf8",
    );
    expect(src).toContain("brand_enabled_but_logo_bytes_missing");
    expect(src).toContain("brand_integrity_mismatch");
    expect(src).toContain("logoBytesProven");
    expect(src).toContain("sha256:");
    expect(src).toContain("BUILD_SNAPSHOT");
  });

  it("admin route resolves durable logoIntegrity — never Production FS materialize", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "app/api/admin/intro/system-start/route.ts"),
      "utf8",
    );
    expect(src).toContain("logoIntegrity");
    expect(src).toContain("runtime.integrity");
    expect(src).toContain("resolveDurableLogoIntegrity");
    expect(src).toContain("productionSaveWritesNativeFs: false");
    expect(src).not.toContain("native/system-start/assets");
  });

  it("separates Platform Boot Primitive (A) from Layer B Admin minVisibleMs", () => {
    const gen = fs.readFileSync(
      path.join(ROOT, "scripts/generate-system-start-build-input.mjs"),
      "utf8",
    );
    expect(gen).toContain("App_Cap_continuation");
    expect(gen).toContain("OS_LaunchScreen_duration");
    const ios = fs.readFileSync(
      path.join(ROOT, "ios/App/App/DibayStartupBridgeViewController.swift"),
      "utf8",
    );
    expect(ios).toContain("Layer B System Start");
    expect(ios).toContain("DibaySystemStartLiveDelivery");
    expect(ios).toContain("minVisibleMs");
    const android = fs.readFileSync(
      path.join(
        ROOT,
        "android/app/src/main/java/com/dibay/app/MainActivity.java",
      ),
      "utf8",
    );
    expect(android).toContain("Layer B System Start");
    expect(android).toContain("DibaySystemStartLiveDelivery");
    expect(android).toContain("Platform Boot Primitive stays shortest");
  });
});
