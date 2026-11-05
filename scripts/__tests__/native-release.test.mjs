import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkNativeVersionBump,
  checkVersionIntegrity,
  classifyNativeChanges,
  formatReleaseClassLine,
  isSyncGeneratedPath,
  readAndroidVersion,
  readIosVersion,
  canonicalizeInfoPlist,
  infoPlistEquivalentIgnoringFingerprint,
} from "../lib/native-release.mjs";

const gradle = (code, name) => `android {\n    defaultConfig {\n        versionCode ${code}\n        versionName "${name}"\n    }\n}\n`;
const pbx = (mv, build, extBuild = build) =>
  [
    `MARKETING_VERSION = ${mv};`,
    `CURRENT_PROJECT_VERSION = ${build};`,
    `MARKETING_VERSION = ${mv};`,
    `CURRENT_PROJECT_VERSION = ${extBuild};`,
  ].join("\n");
const versions = (code, name, mv, build, extBuild) => ({
  android: readAndroidVersion(gradle(code, name)),
  ios: readIosVersion(pbx(mv, build, extBuild)),
});

test("reads Android and iOS versions", () => {
  assert.deepEqual(readAndroidVersion(gradle(3, "1.2")), { versionCode: 3, versionName: "1.2" });
  assert.deepEqual(readIosVersion(pbx("1.2", 4)), { marketingVersion: "1.2", buildNumber: 4, consistent: true });
  assert.equal(readIosVersion(pbx("1.2", 4, 3)).consistent, false);
});

test("web-only changes need no rebuild", () => {
  const c = classifyNativeChanges(["lib/a.ts", "components/b.tsx", "android/README.md", "lib/build/generated-app-build-fingerprint.ts"]);
  assert.deepEqual(c, { android: [], ios: [] });
  assert.match(formatReleaseClassLine({ changes: c, head: versions(3, "1.2", "1.2", 4) }), /웹만/);
});

test("native paths map to their platform; capacitor config and deps to both", () => {
  const c = classifyNativeChanges(
    ["android/app/src/main/java/X.java", "ios/App/App/Plugins/Y.swift", "capacitor.config.ts", "package.json"],
    { packageJsonDiff: '-    "@capacitor/app": "^8.0.0",\n+    "@capacitor/app": "^8.1.0",' },
  );
  assert.deepEqual(c.android, ["android/app/src/main/java/X.java", "capacitor.config.ts", "package.json"]);
  assert.deepEqual(c.ios, ["ios/App/App/Plugins/Y.swift", "capacitor.config.ts", "package.json"]);
  const nonCap = classifyNativeChanges(["package.json"], { packageJsonDiff: '+    "zod": "^3.0.0",' });
  assert.deepEqual(nonCap, { android: [], ios: [] });
});

test("sync-generated files and fingerprint-only Info.plist are not native changes", () => {
  assert.equal(isSyncGeneratedPath("ios/App/App/public/local-runtime/index.html"), true);
  assert.equal(isSyncGeneratedPath("ios/App/App/Plugins/Y.swift"), false);
  const c = classifyNativeChanges(["ios/App/App/Info.plist", "ios/App/CapApp-SPM/Package.swift"], { infoPlistFingerprintOnly: true });
  assert.deepEqual(c, { android: [], ios: [] });
  const a = "<dict>\n\t<key>CFBundleName</key>\n\t<string>DIBAY</string>\n\t<key>DibayGitSha</key>\n\t<string>abc</string>\n</dict>";
  const b = a.replace("abc", "def");
  assert.equal(infoPlistEquivalentIgnoringFingerprint(a, b), true);
  assert.equal(infoPlistEquivalentIgnoringFingerprint(a, a.replace("DIBAY", "X")), false);
  // native:prepare compares `git show HEAD:` (trimmed) with the working file (final newline kept).
  assert.equal(infoPlistEquivalentIgnoringFingerprint(`${a}\n`, b), true);
  assert.equal(infoPlistEquivalentIgnoringFingerprint(`${a}\r\n\n`, b), true);
});

const scenePlist = ({ order = "sorted", delegate = "$(PRODUCT_MODULE_NAME).SceneDelegate", multi = "<false/>", extra = "" } = {}) => {
  const manifest = [
    "\t<key>UIApplicationSceneManifest</key>",
    "\t<dict>",
    "\t\t<key>UIApplicationSupportsMultipleScenes</key>",
    `\t\t${multi}`,
    "\t\t<key>UISceneConfigurations</key>",
    "\t\t<dict>",
    "\t\t\t<key>UIWindowSceneSessionRoleApplication</key>",
    "\t\t\t<array>",
    "\t\t\t\t<dict>",
    "\t\t\t\t\t<key>UISceneConfigurationName</key>",
    "\t\t\t\t\t<string>Default Configuration</string>",
    "\t\t\t\t\t<key>UISceneDelegateClassName</key>",
    `\t\t\t\t\t<string>${delegate}</string>`,
    "\t\t\t\t\t<key>UISceneStoryboardFile</key>",
    "\t\t\t\t\t<string>Main</string>",
    "\t\t\t\t</dict>",
    "\t\t\t</array>",
    "\t\t</dict>",
    "\t</dict>",
  ].join("\n");
  const modes = [
    "\t<key>UIBackgroundModes</key>",
    "\t<array>",
    "\t\t<string>remote-notification</string>",
    "\t\t<string>voip</string>",
    "\t\t<string>audio</string>",
    "\t</array>",
  ].join("\n");
  const body = order === "sorted" ? [manifest, modes] : [modes, manifest];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "\t<key>CFBundleVersion</key>",
    "\t<string>$(CURRENT_PROJECT_VERSION)</string>",
    "\t<key>DibayGitSha</key>",
    "\t<string>abc</string>",
    "\t<key>LSRequiresIPhoneOS</key>",
    "\t<true/>",
    ...body,
    extra,
    "</dict>",
    "</plist>",
  ].join("\n");
};

test("Info.plist: key order alone (top-level or nested) is not a native change", () => {
  const sorted = scenePlist();
  assert.equal(infoPlistEquivalentIgnoringFingerprint(scenePlist({ order: "unsorted" }), sorted), true);
  const nestedSwapped = sorted.replace(
    "\t\t\t\t\t<key>UISceneConfigurationName</key>\n\t\t\t\t\t<string>Default Configuration</string>\n\t\t\t\t\t<key>UISceneDelegateClassName</key>\n\t\t\t\t\t<string>$(PRODUCT_MODULE_NAME).SceneDelegate</string>",
    "\t\t\t\t\t<key>UISceneDelegateClassName</key>\n\t\t\t\t\t<string>$(PRODUCT_MODULE_NAME).SceneDelegate</string>\n\t\t\t\t\t<key>UISceneConfigurationName</key>\n\t\t\t\t\t<string>Default Configuration</string>",
  );
  assert.notEqual(nestedSwapped, sorted);
  assert.equal(infoPlistEquivalentIgnoringFingerprint(nestedSwapped, sorted), true);
  assert.equal(infoPlistEquivalentIgnoringFingerprint(scenePlist({ order: "unsorted" }).replace("abc", "zzz"), sorted), true);
});

test("Info.plist: real setting changes stay native changes (fail closed)", () => {
  const sorted = scenePlist();
  const eq = (other) => infoPlistEquivalentIgnoringFingerprint(sorted, other);
  // Scene manifest removed / wrong delegate / multi-scene flipped
  assert.equal(eq(sorted.replace(/\t<key>UIApplicationSceneManifest<\/key>[\s\S]*?\n\t<\/dict>\n/, "")), false);
  assert.equal(eq(scenePlist({ delegate: "$(PRODUCT_MODULE_NAME).AppDelegate" })), false);
  assert.equal(eq(scenePlist({ multi: "<true/>" })), false);
  // Required key removed
  assert.equal(eq(sorted.replace("\t<key>LSRequiresIPhoneOS</key>\n\t<true/>\n", "")), false);
  // Value / type changes
  assert.equal(eq(sorted.replace("<string>voip</string>", "<string>fetch</string>")), false);
  assert.equal(eq(sorted.replace("<true/>", "<string>true</string>")), false);
  // Array order is meaningful
  assert.equal(eq(sorted.replace("<string>voip</string>\n\t\t<string>audio</string>", "<string>audio</string>\n\t\t<string>voip</string>")), false);
  // Added key, including a non-string Dibay* key (only top-level Dibay* strings are fingerprint)
  assert.equal(eq(scenePlist({ extra: "\t<key>NSFaceIDUsageDescription</key>\n\t<string>x</string>" })), false);
  assert.equal(eq(scenePlist({ extra: "\t<key>DibayFlag</key>\n\t<true/>" })), false);
  // Duplicate key / malformed → not equivalent
  assert.equal(eq(scenePlist({ extra: "\t<key>CFBundleVersion</key>\n\t<string>$(CURRENT_PROJECT_VERSION)</string>" })), false);
  assert.throws(() => canonicalizeInfoPlist(scenePlist({ extra: "\t<key>CFBundleVersion</key>\n\t<string>1</string>" })), /duplicate key/);
  assert.equal(eq(sorted.replace("\t\t\t</array>\n", "")), false);
  assert.equal(eq(sorted.replace("<string>Main</string>", "<string>Main</strin>")), false);
  assert.equal(eq(""), false);
});

test("native change without build bump fails; with bump passes", () => {
  const changes = { android: ["android/x.java"], ios: ["ios/y.swift"] };
  const base = versions(3, "1.2", "1.2", 4);
  const same = checkNativeVersionBump({ changes, base, head: versions(3, "1.2", "1.2", 4) });
  assert.equal(same.length, 2);
  assert.match(same[0], /versionCode/);
  assert.match(same[1], /CURRENT_PROJECT_VERSION/);
  assert.deepEqual(checkNativeVersionBump({ changes, base, head: versions(4, "1.2", "1.2", 5) }), []);
  assert.equal(checkNativeVersionBump({ changes: { android: [], ios: ["ios/y.swift"] }, base, head: versions(3, "1.2", "1.2", 5, 4) }).length, 1);
  assert.match(
    formatReleaseClassLine({ changes, head: versions(4, "1.2", "1.2", 5) }),
    /재빌드·재설치 필요: Android 1\.2 \(versionCode 4\) \/ iOS 1\.2 \(build 5\)/,
  );
});

test("CI integrity: no per-commit bump required; regression and iOS mismatch fail", () => {
  const base = versions(3, "1.2", "1.2", 4);
  assert.deepEqual(checkVersionIntegrity({ base, head: versions(3, "1.2", "1.2", 4) }), []);
  assert.deepEqual(checkVersionIntegrity({ base, head: versions(4, "1.2", "1.2", 5) }), []);
  assert.match(checkVersionIntegrity({ base, head: versions(2, "1.2", "1.2", 4) })[0], /versionCode/);
  assert.match(checkVersionIntegrity({ base, head: versions(3, "1.2", "1.2", 3) })[0], /CURRENT_PROJECT_VERSION/);
  assert.equal(checkVersionIntegrity({ base, head: versions(3, "1.2", "1.2", 5, 4) }).length, 1);
});

test("release class line shows the next build number when not yet bumped", () => {
  const changes = { android: ["android/x.java"], ios: ["ios/y.swift"] };
  const base = versions(3, "1.2", "1.2", 4);
  assert.match(
    formatReleaseClassLine({ changes, head: versions(3, "1.2", "1.2", 4), base }),
    /Android 1\.2 \(versionCode 4 · 빌드 시 증가\) \/ iOS 1\.2 \(build 5 · 빌드 시 증가\)/,
  );
  assert.match(formatReleaseClassLine({ changes, head: versions(4, "1.2", "1.2", 5), base }), /versionCode 4\) \/ iOS 1\.2 \(build 5\)$/);
});
