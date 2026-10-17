#!/usr/bin/env node
/**
 * CI 가드 — 네이티브(android/·ios/·Capacitor 설정·Capacitor 의존성) 변경이 있으면 해당 플랫폼 빌드 번호가
 * 올라가 있어야 한다. 빌드 번호가 같으면 설치된 앱이 새 빌드인지 구분할 수 없다(2026-10-17 사진 저장 사고).
 * 규정: docs/native-build-release-process.md
 *
 * Usage:
 *   node scripts/verify-native-version-bump.mjs              # 기준 = origin/main 과의 merge-base (main 위면 HEAD^1)
 *   node scripts/verify-native-version-bump.mjs --base=<ref>
 * 출력 첫 줄은 보고용 [배포 구분] 한 줄. 위반이 있으면 exit 1.
 */
import { execFileSync } from "node:child_process";
import {
  ANDROID_GRADLE_PATH,
  IOS_INFO_PLIST_PATH,
  IOS_PBXPROJ_PATH,
  checkNativeVersionBump,
  classifyNativeChanges,
  formatReleaseClassLine,
  readAndroidVersion,
  readIosVersion,
  stripInfoPlistFingerprint,
} from "./lib/native-release.mjs";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function tryGit(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

function resolveBase() {
  const flag = process.argv.find((a) => a.startsWith("--base="));
  if (flag) return flag.slice("--base=".length);
  const prBase = process.env.GITHUB_BASE_REF?.trim();
  const target = prBase ? `origin/${prBase}` : "origin/main";
  const head = git(["rev-parse", "HEAD"]);
  const mergeBase = tryGit(["merge-base", target, "HEAD"]);
  if (!mergeBase) {
    console.error(`[native-version-bump] FAIL: ${target} 와의 merge-base 를 찾지 못했습니다 (fetch-depth 0 필요)`);
    process.exit(1);
  }
  /** main 에 올라간 커밋(squash merge) 자체를 검사할 때는 직전 커밋이 기준. */
  return mergeBase === head ? "HEAD^1" : mergeBase;
}

const base = resolveBase();
const files = git(["diff", "--name-only", base, "HEAD"]).split("\n").filter(Boolean);
const show = (ref, file) => tryGit(["show", `${ref}:${file}`]) ?? "";

const infoPlistFingerprintOnly =
  files.includes(IOS_INFO_PLIST_PATH) &&
  stripInfoPlistFingerprint(show(base, IOS_INFO_PLIST_PATH)) === stripInfoPlistFingerprint(show("HEAD", IOS_INFO_PLIST_PATH));
const packageJsonDiff = files.includes("package.json") ? git(["diff", base, "HEAD", "--", "package.json"]) : "";

const changes = classifyNativeChanges(files, { packageJsonDiff, infoPlistFingerprintOnly });
const versionsAt = (ref) => ({
  android: readAndroidVersion(show(ref, ANDROID_GRADLE_PATH)),
  ios: readIosVersion(show(ref, IOS_PBXPROJ_PATH)),
});
const baseV = versionsAt(base);
const headV = versionsAt("HEAD");

console.log(formatReleaseClassLine({ changes, head: headV }));
console.log(
  `[native-version-bump] base=${base} · Android ${baseV.android.versionName}(${baseV.android.versionCode}) → ${headV.android.versionName}(${headV.android.versionCode}) · iOS ${baseV.ios.marketingVersion}(${baseV.ios.buildNumber}) → ${headV.ios.marketingVersion}(${headV.ios.buildNumber})`,
);

const problems = checkNativeVersionBump({ changes, base: baseV, head: headV });
if (problems.length > 0) {
  for (const p of problems) console.error(`[native-version-bump] FAIL: ${p}`);
  console.error("[native-version-bump] 규정: docs/native-build-release-process.md §2");
  process.exit(1);
}
console.log("[native-version-bump] PASS");
