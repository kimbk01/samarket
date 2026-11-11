import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DIBAY_PRODUCTION_SITE_ORIGIN } from "@/lib/platform/capacitor-server-url";
import { isGuestPublicBrowsePath } from "@/lib/auth/guest-browse-access-policy";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const HOST = new URL(DIBAY_PRODUCTION_SITE_ORIGIN).host;

/** 설계안 v3 §3.6 · 4단계 — QR 친구 추가 네이티브 링크·권한 문구 */
describe("friend QR native links", () => {
  it("Android: dibay://friend and verified https app link for /f/ on the production host", () => {
    const manifest = read("android/app/src/main/AndroidManifest.xml");
    expect(manifest).toContain('<data android:scheme="dibay" android:host="friend" android:pathPrefix="/" />');
    expect(manifest).toMatch(
      new RegExp(`android:autoVerify="true">[\\s\\S]{0,400}<data android:scheme="https" android:host="${HOST}" android:pathPrefix="/f/" />`),
    );
  });

  it("assetlinks.json = Android package + release signing fingerprint", () => {
    const links = JSON.parse(read("public/.well-known/assetlinks.json")) as Array<{
      target: { package_name: string; sha256_cert_fingerprints: string[] };
    }>;
    const gradle = read("android/app/build.gradle");
    const pkg = /applicationId "([^"]+)"/.exec(gradle)?.[1];
    expect(links[0]!.target.package_name).toBe(pkg);
    for (const fp of links[0]!.target.sha256_cert_fingerprints) expect(fp).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });

  it("iOS: associated domain + AASA appID = team + bundle id from the Xcode project", () => {
    expect(read("ios/App/App/App.entitlements")).toContain(`<string>applinks:${HOST}</string>`);
    const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
    const team = /DEVELOPMENT_TEAM = ([A-Z0-9]+);/.exec(pbx)?.[1];
    const bundle = /PRODUCT_BUNDLE_IDENTIFIER = (com\.dibay\.ph);/.exec(pbx)?.[1];
    const aasa = JSON.parse(read("public/.well-known/apple-app-site-association")) as {
      applinks: { details: Array<{ appIDs: string[]; components: Array<Record<string, string>> }> };
    };
    expect(aasa.applinks.details[0]!.appIDs).toEqual([`${team}.${bundle}`]);
    expect(aasa.applinks.details[0]!.components[0]!["/"]).toBe("/f/*");
    expect(read("next.config.js")).toContain('source: "/.well-known/apple-app-site-association"');
    expect(isGuestPublicBrowsePath("/.well-known/apple-app-site-association")).toBe(true);
  });

  it("iOS camera permission text names QR scanning (ko·en·Info.plist)", () => {
    expect(read("ios/App/App/Info.plist")).toContain("영상 통화와 QR 코드 스캔을 위해 카메라 접근이 필요합니다.");
    expect(read("ios/App/App/ko.lproj/InfoPlist.strings")).toContain("영상 통화와 QR 코드 스캔을 위해");
    expect(read("ios/App/App/en.lproj/InfoPlist.strings")).toContain("video calls and scanning QR codes");
  });

  it("https app links go to a separate listener; PushRouteListener (call routes) unchanged", () => {
    const listener = read("components/community-messenger/friend-qr/FriendQrAppLinkListener.tsx");
    expect(listener).toContain('if (!raw.startsWith("https://")) return;');
    expect(listener).toContain("buildFriendQrHomePath(token)");
    expect(read("components/layout/MainAppProviderTree.tsx")).toContain("<FriendQrAppLinkListener />");
    expect(read("components/push/PushRouteListener.tsx")).toContain('if (!url.startsWith("dibay://")) return;');
  });

  it("cold-start launch URL is applied once per process (PR #145 review)", () => {
    const listener = read("components/community-messenger/friend-qr/FriendQrAppLinkListener.tsx");
    expect(listener).toContain("let launchUrlConsumed = false;");
    expect(listener).toMatch(/if \(!launchUrlConsumed\) \{\s+launchUrlConsumed = true;\s+const launch = await App\.getLaunchUrl\(\)/);
  });
});
