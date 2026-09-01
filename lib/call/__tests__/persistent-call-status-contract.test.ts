import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");

describe("persistent call status + FAB Option A contract", () => {
  it("Android/iOS keep status and right FAB visible together (no auto-hide)", () => {
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
    expect(androidActivity).toContain("Option A: auto-hide disabled");
    expect(androidActivity).toMatch(
      /syncPersistentCallStatusVisibility[\s\S]*activeActions\.setVisibility\(View\.VISIBLE\)/,
    );
    expect(androidLayout).toContain('android:layout_gravity="top|center_horizontal"');

    expect(iosVc).toContain("syncPersistentCallStatusVisibility");
    expect(iosVc).toContain("Option A: auto-hide disabled");
    expect(iosVc).toContain("infoStack.centerXAnchor.constraint");
    expect(iosVc).toMatch(/syncPersistentCallStatusVisibility[\s\S]*activeActions\.isHidden = false/);
  });
});
