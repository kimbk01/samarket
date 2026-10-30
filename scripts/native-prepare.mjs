#!/usr/bin/env node
/**
 * Mac 로컬 네이티브 빌드 준비 — Android Studio / Xcode 에서 Run 을 누르기 **전에 반드시** 실행한다.
 * 규정: docs/native-build-release-process.md §4
 *
 * 1) main 브랜치 · 사람이 만든 미커밋 변경 없음 · android/ios 아래 미추적 파일 없음 을 확인 (있으면 중단)
 * 2) origin/main 과 정확히 같게 맞춘다 (뒤처졌으면 fast-forward pull, 앞섰거나 갈라졌으면 중단)
 * 2b) 빌드 번호 가드 — 마지막 번호 증가 이후 네이티브 변경이 있으면 중단 (verify-native-version-bump --release)
 * 3) npm ci → cap sync (Production server.url) — Android + (macOS 면) iOS
 * 4) 빌드할 SHA 와 목표 버전(Android versionName/versionCode · iOS Version/Build)을 출력
 *
 * 2026-10-17: 71커밋 뒤처지고 로컬 수정이 남은 폴더로 빌드해 iOS 1.0 / Android 1.0.1 이 설치되었고,
 * 사진첩 저장(네이티브)이 한 번도 폰에 들어가지 않았다. 이 스크립트는 그 경로를 막는다.
 *
 * Usage: npm run native:prepare [-- --skip-install] [-- --android-only | --ios-only]
 *   --ios-only: iOS 만 빌드할 때 — 빌드 번호 가드를 iOS 만 검사한다(Android 가드는 Android 빌드 때 그대로).
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ANDROID_GRADLE_PATH,
  IOS_INFO_PLIST_PATH,
  IOS_PBXPROJ_PATH,
  isSyncGeneratedPath,
  readAndroidVersion,
  readIosVersion,
  stripInfoPlistFingerprint,
} from "./lib/native-release.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const iosOnly = args.has("--ios-only");
const withIos = process.platform === "darwin" && !args.has("--android-only");

function git(gitArgs) {
  return execFileSync("git", gitArgs, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function fail(lines) {
  console.error("");
  for (const l of [].concat(lines)) console.error(`[native:prepare] STOP: ${l}`);
  console.error("[native:prepare] 빌드하지 마세요. 규정: docs/native-build-release-process.md §4");
  process.exit(1);
}

function run(label, cmd, cmdArgs) {
  console.log(`\n[native:prepare] ${label}: ${cmd} ${cmdArgs.join(" ")}`);
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit", env: process.env });
  if (r.status !== 0) fail(`${label} 실패 (exit ${r.status ?? "?"}) — 위 에러 원문을 그대로 보고하세요.`);
}

/** 사람이 만든 변경만 남기고, sync 가 다시 쓰는 생성 파일 변경은 되돌린다. */
function humanChanges() {
  /** -z: NUL 구분·경로 인용 없음 — 앞 공백(상태 칸)이 잘리지 않도록 trim 하지 않는다. */
  const raw = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    /** 기본 1MB — 기본 체크아웃의 미추적 기록 파일(tmp/ 등 수천 개)만으로 넘쳐 ENOBUFS 로 중단됐다 (2026-10-30). */
    maxBuffer: 256 * 1024 * 1024,
  });
  const entries = raw.split("\0");
  const human = [];
  const generated = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!entry) continue;
    const status = entry.slice(0, 2);
    const file = entry.slice(3);
    /** rename/copy: 다음 항목이 원래 경로 — 건너뛴다. */
    if (status[0] === "R" || status[0] === "C") i += 1;
    if (status === "??") {
      /** android/·ios/ 아래 미추적 파일은 그대로 컴파일·번들된다 — 저장소에 없는 코드가 앱에 들어간다. */
      if (/^(android|ios)\//.test(file) && !isSyncGeneratedPath(file)) human.push(`미추적 ${file}`);
      continue;
    }
    if (isSyncGeneratedPath(file)) {
      generated.push(file);
    } else if (file === IOS_INFO_PLIST_PATH) {
      const headText = git(["show", `HEAD:${IOS_INFO_PLIST_PATH}`]);
      const workText = fs.readFileSync(path.join(ROOT, IOS_INFO_PLIST_PATH), "utf8");
      if (stripInfoPlistFingerprint(headText) === stripInfoPlistFingerprint(workText)) generated.push(file);
      else human.push(`수정 ${file}`);
    } else {
      human.push(`${status.trim() || "변경"} ${file}`);
    }
  }
  return { human, generated };
}

if (iosOnly && args.has("--android-only")) fail("--ios-only 와 --android-only 는 함께 쓸 수 없습니다.");
if (iosOnly && !withIos) fail("--ios-only 는 macOS 에서만 쓸 수 있습니다 (iOS sync 필요).");

// 1) 브랜치·작업 트리
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== "main") fail(`현재 브랜치가 '${branch}' 입니다. 'git checkout main' 후 다시 실행하세요.`);

const before = humanChanges();
if (before.human.length > 0) {
  fail([
    "커밋되지 않은 변경이 있습니다 — 이 상태로 빌드하면 저장소에 없는 코드가 앱에 들어갑니다:",
    ...before.human.slice(0, 30).map((h) => `  ${h}`),
    ...(before.human.length > 30 ? [`  … 외 ${before.human.length - 30}개`] : []),
    "필요한 변경이면 main 에 커밋·푸시하고, 아니면 'git stash push -u -m backup-<날짜>' 로 백업한 뒤 다시 실행하세요.",
  ]);
}
if (before.generated.length > 0) {
  console.log(`[native:prepare] 이전 sync 생성 파일 ${before.generated.length}개 되돌림 (다시 생성됨)`);
  git(["checkout", "--", ...before.generated]);
}

// 2) origin/main 과 동일하게
run("최신 main 가져오기", "git", ["fetch", "origin", "main"]);
const counts = git(["rev-list", "--left-right", "--count", "HEAD...origin/main"]).split(/\s+/).map(Number);
const [ahead, behind] = counts;
if (ahead > 0) fail(`로컬 main 에 원격에 없는 커밋 ${ahead}개가 있습니다. origin/main 에 푸시(필요하면 rebase)한 뒤 다시 실행하세요.`);
if (behind > 0) run(`origin/main 보다 ${behind}커밋 뒤처짐 → 업데이트`, "git", ["pull", "--ff-only", "origin", "main"]);
const sha = git(["rev-parse", "--short", "HEAD"]);
if (git(["rev-parse", "HEAD"]) !== git(["rev-parse", "origin/main"])) fail("HEAD 가 origin/main 과 다릅니다.");

// 2b) 빌드 번호 — 번호는 커밋마다가 아니라 빌드 시점에 올린다. 마지막 증가 이후 네이티브 변경이 있으면 같은 번호로
//     다른 바이너리가 설치되므로 중단한다 (Owner 2026-10-20 · docs/native-build-release-process.md §2).
run("빌드 번호 확인", "node", [
  "scripts/verify-native-version-bump.mjs",
  "--release",
  ...(withIos ? [] : ["--android-only"]),
  ...(iosOnly ? ["--ios-only"] : []),
]);

// 3) 의존성 · Capacitor sync (Production server.url)
if (!args.has("--skip-install")) run("의존성 설치", "npm", ["ci"]);
run("Capacitor sync", "node", ["scripts/sync-capacitor-vercel.mjs", ...(withIos ? ["--ios"] : [])]);

const after = humanChanges();
if (after.human.length > 0) {
  fail(["sync 후 생성 파일 외의 변경이 생겼습니다 — 보고하세요:", ...after.human.map((h) => `  ${h}`)]);
}

// 4) 목표 버전 출력
const android = readAndroidVersion(fs.readFileSync(path.join(ROOT, ANDROID_GRADLE_PATH), "utf8"));
const ios = readIosVersion(fs.readFileSync(path.join(ROOT, IOS_PBXPROJ_PATH), "utf8"));
if (!ios.consistent) fail(`${IOS_PBXPROJ_PATH} 의 버전 값이 빌드 구성마다 다릅니다.`);

console.log(`
[native:prepare] READY — origin/main ${sha}
  Android : ${android.versionName} (versionCode ${android.versionCode})${iosOnly ? "  ← --ios-only: Android 빌드 번호 가드 생략 — 이 준비로 Android 를 빌드하지 마세요" : ""}
  iOS     : ${ios.marketingVersion} (build ${ios.buildNumber})${withIos ? "" : "  ← iOS sync 생략 (macOS 아님 또는 --android-only)"}

다음 (이 순서 외에 다른 폴더·브랜치에서 빌드하지 마세요):
  iOS     : open ios/App/App.xcodeproj → iPhone 선택 → Product > Clean Build Folder → Run
            (General 탭 Version ${ios.marketingVersion} / Build ${ios.buildNumber} 인지 확인)
  Android : cd android && ./gradlew assembleRelease
            adb -d install -r app/build/outputs/apk/release/app-release.apk
설치 후 앱을 한 번 열면 서버(user_devices.app_version)에 "${android.versionName} (${android.versionCode})" / "${ios.marketingVersion} (${ios.buildNumber})" 로 기록됩니다.`);
