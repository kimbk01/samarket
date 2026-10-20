#!/usr/bin/env node
/**
 * 네이티브 변경 분류([배포 구분]) + 빌드 번호 가드. 규정: docs/native-build-release-process.md §2
 *
 * 기본(CI·보고용): base..HEAD 의 [배포 구분] 출력. 빌드 번호 역행·iOS 빌드 구성 불일치만 실패한다.
 *   네이티브 변경마다 번호 증가를 요구하지 않는다 — 번호는 빌드(설치·스토어) 시점에 올린다 (Owner 2026-10-20).
 * --release: 빌드 직전 가드 (native:prepare 가 호출). 플랫폼별로 빌드 번호를 마지막으로 바꾼 커밋 이후
 *   네이티브 변경이 있으면 실패 — 같은 번호로 다른 바이너리가 설치되는 것을 막는다(2026-10-17 사진 저장 사고).
 *
 * Usage:
 *   node scripts/verify-native-version-bump.mjs              # 기준 = origin/main 과의 merge-base (main 위면 HEAD^1)
 *   node scripts/verify-native-version-bump.mjs --base=<ref>
 *   node scripts/verify-native-version-bump.mjs --release [--android-only]
 * 출력 첫 줄은 보고용 [배포 구분] 한 줄. 위반이 있으면 exit 1.
 */
import { execFileSync } from "node:child_process";
import {
  ANDROID_GRADLE_PATH,
  BUILD_NUMBER_LOG_ARGS,
  IOS_INFO_PLIST_PATH,
  IOS_PBXPROJ_PATH,
  checkNativeVersionBump,
  checkVersionIntegrity,
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
  /** main 에 올라간 커밋 자체를 검사할 때는 직전 커밋이 기준. */
  return mergeBase === head ? "HEAD^1" : mergeBase;
}

const show = (ref, file) => tryGit(["show", `${ref}:${file}`]) ?? "";
const versionsAt = (ref) => ({
  android: readAndroidVersion(show(ref, ANDROID_GRADLE_PATH)),
  ios: readIosVersion(show(ref, IOS_PBXPROJ_PATH)),
});

/** base..HEAD 의 네이티브 변경(플랫폼별 근거 경로). */
function nativeChangesSince(base) {
  const files = git(["diff", "--name-only", base, "HEAD"]).split("\n").filter(Boolean);
  const infoPlistFingerprintOnly =
    files.includes(IOS_INFO_PLIST_PATH) &&
    stripInfoPlistFingerprint(show(base, IOS_INFO_PLIST_PATH)) === stripInfoPlistFingerprint(show("HEAD", IOS_INFO_PLIST_PATH));
  const packageJsonDiff = files.includes("package.json") ? git(["diff", base, "HEAD", "--", "package.json"]) : "";
  return classifyNativeChanges(files, { packageJsonDiff, infoPlistFingerprintOnly });
}

const headV = versionsAt("HEAD");

if (process.argv.includes("--release")) {
  const platforms = process.argv.includes("--android-only") ? ["android"] : ["android", "ios"];
  const problems = checkVersionIntegrity({ base: headV, head: headV });
  for (const platform of platforms) {
    const bumpCommit = tryGit(BUILD_NUMBER_LOG_ARGS[platform]);
    if (!bumpCommit) {
      problems.push(`${platform}: 빌드 번호를 바꾼 커밋을 찾지 못했습니다 (전체 히스토리 필요)`);
      continue;
    }
    const changes = nativeChangesSince(bumpCommit);
    const only = { android: [], ios: [], [platform]: changes[platform] };
    console.log(
      `[native-version-bump] --release ${platform}: 마지막 번호 변경 ${bumpCommit.slice(0, 8)} 이후 네이티브 변경 ${changes[platform].length}건`,
    );
    problems.push(...checkNativeVersionBump({ changes: only, base: versionsAt(bumpCommit), head: headV }));
  }
  if (problems.length > 0) {
    for (const p of problems) console.error(`[native-version-bump] FAIL: ${p}`);
    console.error("[native-version-bump] 빌드 번호를 올려 main 에 커밋·푸시한 뒤 다시 실행하세요. 규정: docs/native-build-release-process.md §2");
    process.exit(1);
  }
  console.log(
    `[native-version-bump] RELEASE READY · Android ${headV.android.versionName}(${headV.android.versionCode}) · iOS ${headV.ios.marketingVersion}(${headV.ios.buildNumber})`,
  );
  process.exit(0);
}

const base = resolveBase();
const changes = nativeChangesSince(base);
const baseV = versionsAt(base);

console.log(formatReleaseClassLine({ changes, head: headV, base: baseV }));
console.log(
  `[native-version-bump] base=${base} · Android ${baseV.android.versionName}(${baseV.android.versionCode}) → ${headV.android.versionName}(${headV.android.versionCode}) · iOS ${baseV.ios.marketingVersion}(${baseV.ios.buildNumber}) → ${headV.ios.marketingVersion}(${headV.ios.buildNumber})`,
);

const problems = checkVersionIntegrity({ base: baseV, head: headV });
if (problems.length > 0) {
  for (const p of problems) console.error(`[native-version-bump] FAIL: ${p}`);
  console.error("[native-version-bump] 규정: docs/native-build-release-process.md §2");
  process.exit(1);
}
console.log("[native-version-bump] PASS");
