import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");

describe("persistent call status CUT5 contract", () => {
  it("Android/iOS keep status visibility independent of controls auto-hide", () => {
    const androidActivity = readFileSync(
      join(ROOT, "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallActivity.java"),
      "utf8",
    );
    const androidLayout = readFileSync(
      join(ROOT, "android/app/src/main/res/layout/activity_native_video_call.xml"),
      "utf8",
    );
    const iosVc = readFileSync(
      join(ROOT, "ios/App/App/Call/Video/NativeVideoCallViewController.swift"),
      "utf8",
    );

    expect(androidActivity).toContain("syncPersistentCallStatusVisibility");
    expect(androidActivity).toMatch(
      /setConnectedChromeViewsVisible[\s\S]*syncPersistentCallStatusVisibility/,
    );
    expect(androidLayout).toContain('android:layout_gravity="top|center_horizontal"');

    expect(iosVc).toContain("syncPersistentCallStatusVisibility");
    expect(iosVc).toContain("infoStack.centerXAnchor.constraint");
    expect(iosVc).toMatch(
      /setConnectedChromeViewsVisible[\s\S]*syncPersistentCallStatusVisibility/,
    );
  });
});
