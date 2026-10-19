import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const JAVA = "android/app/src/main/java/com/dibay/app";

describe("PUSH-01 Android — rotated FCM token is pending, never overwrites the bound proof", () => {
  const service = read(`${JAVA}/DibayFirebaseMessagingService.java`);
  const onNewToken = service.slice(service.indexOf("public void onNewToken"), service.indexOf("private static String firstNonEmpty"));

  it("onNewToken stores pending + notifies web, does not touch the bound store or upload", () => {
    expect(onNewToken).toMatch(/DibayPendingPushTokenStore\.save\(this, token\.trim\(\)\)/);
    expect(onNewToken).toMatch(/MainActivity\.notifyPushTokenRotated\(\)/);
    expect(onNewToken).not.toMatch(/DibayBoundPushTokenStore/);
    expect(onNewToken).not.toMatch(/HttpURLConnection|NativePushRegisterHelper/);
  });

  it("MainActivity dispatches the event NativePushRegistration listens for", () => {
    expect(read(`${JAVA}/MainActivity.java`)).toMatch(
      /notifyPushTokenRotated\(\)[\s\S]*?new CustomEvent\('dibay:push-token-rotated'\)/
    );
  });

  it("successful register promotes the token (bound) and clears the matching pending one", () => {
    expect(read(`${JAVA}/nativepush/NativePushRegisterHelper.java`)).toMatch(
      /DibayBoundPushTokenStore\.save\(context, request\.pushToken, request\.pushProvider\);\s+DibayPendingPushTokenStore\.clearIfEquals\(context, request\.pushToken\);/
    );
  });

  it("logout proof tries the bound token, then the pending token, and clears both on success", () => {
    const helper = read(`${JAVA}/nativepush/NativePushDeactivateHelper.java`);
    expect(helper).toMatch(/postDeactivate\(origin, deviceId, boundToken, pushProvider, reason\)/);
    expect(helper).toMatch(/postDeactivate\(origin, deviceId, pendingToken, "fcm", reason\)/);
    expect(helper).toMatch(/DibayBoundPushTokenStore\.clear\(app\);\s+DibayPendingPushTokenStore\.clear\(app\);/);
  });
});

describe("PUSH-02 iOS — binary reports its APNs environment", () => {
  const plugin = read("ios/App/App/Plugins/DibayDeviceClassPlugin.swift");

  it("DibayDeviceClass exposes getApnsEnvironment (JS: lib/push/native/apns-environment-native.ts)", () => {
    expect(plugin).toMatch(/CAPPluginMethod\(name: "getApnsEnvironment"/);
    expect(plugin).toMatch(/call\.resolve\(\["apnsEnvironment": DibayApnsEnvironment\.resolve\(\)\]\)/);
  });

  it("no embedded profile (App Store/TestFlight) → production; development profile → sandbox", () => {
    expect(plugin).toMatch(/else \{\s+return "production"\s+\}/);
    expect(plugin).toMatch(/return aps == "production" \? "production" : "sandbox"/);
  });

  it("VoIP / CallKit sources are not changed by PUSH-02", () => {
    expect(plugin).not.toMatch(/PushKit|CallKit|voip/i);
  });
});
