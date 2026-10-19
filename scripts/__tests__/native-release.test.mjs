import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkNativeVersionBump,
  classifyNativeChanges,
  formatReleaseClassLine,
  isSyncGeneratedPath,
  readAndroidVersion,
  readIosVersion,
  stripInfoPlistFingerprint,
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
  assert.equal(stripInfoPlistFingerprint(a), stripInfoPlistFingerprint(b));
  assert.notEqual(stripInfoPlistFingerprint(a), stripInfoPlistFingerprint(a.replace("DIBAY", "X")));
  // native:prepare compares `git show HEAD:` (trimmed) with the working file (final newline kept).
  assert.equal(stripInfoPlistFingerprint(`${a}\n`), stripInfoPlistFingerprint(b));
  assert.equal(stripInfoPlistFingerprint(`${a}\r\n\n`), stripInfoPlistFingerprint(b));
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
