/**
 * DIBAY 네이티브 빌드·배포 규정 SSOT 로직 — `docs/native-build-release-process.md`.
 *
 * - 네이티브 버전 읽기(Android versionCode/versionName, iOS MARKETING_VERSION/CURRENT_PROJECT_VERSION)
 * - 변경 파일 → 웹 전용 / 네이티브(Android·iOS) 분류
 * - 네이티브 변경 시 빌드 번호 증가 여부 판정
 * - `cap sync`·지문 생성이 다시 쓰는 생성 파일 판정(로컬 준비 스크립트의 "깨끗한 작업 트리" 검사용)
 *
 * 사용처: scripts/native-prepare.mjs (Mac 로컬 빌드 준비), scripts/verify-native-version-bump.mjs (CI 가드).
 */

export const ANDROID_GRADLE_PATH = "android/app/build.gradle";
export const IOS_PBXPROJ_PATH = "ios/App/App.xcodeproj/project.pbxproj";
export const IOS_INFO_PLIST_PATH = "ios/App/App/Info.plist";

/** @returns {{ versionCode: number | null, versionName: string | null }} */
export function readAndroidVersion(gradleText) {
  const code = /^\s*versionCode\s+(\d+)\s*$/m.exec(gradleText ?? "");
  const name = /^\s*versionName\s+"([^"]+)"\s*$/m.exec(gradleText ?? "");
  return {
    versionCode: code ? Number(code[1]) : null,
    versionName: name ? name[1] : null,
  };
}

/**
 * pbxproj 의 모든 빌드 구성(App·푸시 확장 × Debug·Release)이 같은 값이어야 한다.
 * 값이 섞여 있으면 consistent=false (확장 번호 불일치는 App Store 업로드 거부 사유).
 * @returns {{ marketingVersion: string | null, buildNumber: number | null, consistent: boolean }}
 */
export function readIosVersion(pbxprojText) {
  const text = pbxprojText ?? "";
  const marketing = [...text.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1].trim());
  const builds = [...text.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map((m) => m[1].trim());
  const uniq = (xs) => [...new Set(xs)];
  const consistent = uniq(marketing).length <= 1 && uniq(builds).length <= 1;
  const build = builds.length > 0 ? Number(builds[0]) : NaN;
  return {
    marketingVersion: marketing[0] ?? null,
    buildNumber: Number.isFinite(build) ? build : null,
    consistent,
  };
}

/** Info.plist 에서 빌드 지문 키(Dibay*) 를 뺀 본문 — 지문만 바뀐 Info.plist 는 "생성 변경"으로 본다. */
export function stripInfoPlistFingerprint(plistText) {
  // Trailing whitespace is not content: `git show` output is trimmed by the caller while the
  // working file keeps its final newline — comparing them raw made every stamped plist "human".
  return String(plistText ?? "")
    .replace(/\s*<key>Dibay[A-Za-z]+<\/key>\s*<string>[^<]*<\/string>/g, "")
    .replace(/\s+$/, "");
}

/**
 * `npm run cap:sync:vercel*` (지문 생성·local runtime·cap sync) 가 매번 다시 쓰는 추적 파일.
 * 이 경로의 변경은 사람이 만든 변경이 아니다 — 로컬 준비 때 되돌리고 다시 생성한다.
 * Info.plist 는 지문 키만 다를 때만 생성 변경이다(별도 판정).
 */
const SYNC_GENERATED_PREFIXES = ["capacitor-www/", "ios/App/App/public/", "android/app/src/main/assets/local-runtime/"];
const SYNC_GENERATED_EXACT = new Set([
  "lib/build/generated-app-build-fingerprint.ts",
  "ios/App/App/capacitor.config.json",
  "ios/App/CapApp-SPM/Package.swift",
  "android/app/src/main/assets/dibay-runtime-mode.json",
  "android/capacitor.settings.gradle",
  "android/app/capacitor.build.gradle",
]);

export function isSyncGeneratedPath(file) {
  const f = String(file ?? "").replace(/\\/g, "/");
  return SYNC_GENERATED_EXACT.has(f) || SYNC_GENERATED_PREFIXES.some((p) => f.startsWith(p));
}

const CAPACITOR_DEP_LINE = /"(@capacitor\/[^"]+|@capawesome\/[^"]+|[^"]*capacitor-[^"]+)"\s*:/;

/**
 * 변경 파일 → 어느 앱 바이너리를 다시 빌드해야 하는가.
 * @param {string[]} files 변경 경로
 * @param {{ packageJsonDiff?: string, infoPlistFingerprintOnly?: boolean }} [ctx]
 * @returns {{ android: string[], ios: string[] }} 플랫폼별 근거 경로(빈 배열 = 재빌드 불필요)
 */
export function classifyNativeChanges(files, ctx = {}) {
  const android = [];
  const ios = [];
  for (const raw of files) {
    const f = String(raw ?? "").replace(/\\/g, "/");
    if (!f || f.endsWith(".md") || isSyncGeneratedPath(f)) continue;
    if (f === IOS_INFO_PLIST_PATH && ctx.infoPlistFingerprintOnly) continue;
    if (f.startsWith("android/")) android.push(f);
    else if (f.startsWith("ios/")) ios.push(f);
    else if (f === "capacitor.config.ts" || f === "capacitor.config.json") {
      android.push(f);
      ios.push(f);
    } else if (f === "package.json" && ctx.packageJsonDiff) {
      const touched = ctx.packageJsonDiff
        .split("\n")
        .filter((l) => /^[+-][^+-]/.test(l))
        .some((l) => CAPACITOR_DEP_LINE.test(l));
      if (touched) {
        android.push(f);
        ios.push(f);
      }
    }
  }
  return { android, ios };
}

/**
 * 네이티브 변경이 있으면 해당 플랫폼 빌드 번호가 기준보다 커야 한다.
 * @returns {string[]} 위반 사유(빈 배열 = 통과)
 */
export function checkNativeVersionBump({ changes, base, head }) {
  const problems = [];
  if (!head.ios.consistent) {
    problems.push(
      `iOS 빌드 구성마다 MARKETING_VERSION/CURRENT_PROJECT_VERSION 값이 다릅니다 (${IOS_PBXPROJ_PATH}) — 앱·푸시 확장 4곳을 같은 값으로 맞추세요.`,
    );
  }
  if (changes.android.length > 0) {
    const b = base.android.versionCode;
    const h = head.android.versionCode;
    if (h == null || (b != null && h <= b)) {
      problems.push(
        `Android 네이티브 변경(${changes.android.slice(0, 5).join(", ")}${changes.android.length > 5 ? " …" : ""})인데 versionCode 가 ${b ?? "?"} → ${h ?? "?"} 입니다. ${ANDROID_GRADLE_PATH} 의 versionCode 를 올리세요.`,
      );
    }
  }
  if (changes.ios.length > 0) {
    const b = base.ios.buildNumber;
    const h = head.ios.buildNumber;
    if (h == null || (b != null && h <= b)) {
      problems.push(
        `iOS 네이티브 변경(${changes.ios.slice(0, 5).join(", ")}${changes.ios.length > 5 ? " …" : ""})인데 CURRENT_PROJECT_VERSION 이 ${b ?? "?"} → ${h ?? "?"} 입니다. ${IOS_PBXPROJ_PATH} 의 4곳을 모두 올리세요.`,
      );
    }
  }
  return problems;
}

/** 보고 첫 줄 — docs/native-build-release-process.md §3 형식. */
export function formatReleaseClassLine({ changes, head }) {
  const needAndroid = changes.android.length > 0;
  const needIos = changes.ios.length > 0;
  if (!needAndroid && !needIos) return "[배포 구분] 웹만 — Vercel 배포 후 앱 재시작만 하면 반영 (재빌드 불필요)";
  const parts = [];
  if (needAndroid) parts.push(`Android ${head.android.versionName} (versionCode ${head.android.versionCode})`);
  if (needIos) parts.push(`iOS ${head.ios.marketingVersion} (build ${head.ios.buildNumber})`);
  return `[배포 구분] 네이티브 — 재빌드·재설치 필요: ${parts.join(" / ")}`;
}
