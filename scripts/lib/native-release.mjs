/**
 * DIBAY 네이티브 빌드·배포 규정 SSOT 로직 — `docs/native-build-release-process.md`.
 *
 * - 네이티브 버전 읽기(Android versionCode/versionName, iOS MARKETING_VERSION/CURRENT_PROJECT_VERSION)
 * - 변경 파일 → 웹 전용 / 네이티브(Android·iOS) 분류
 * - 빌드 번호 판정: 커밋 단위 강제 없음(CI 는 역행·불일치만 실패). 빌드(설치·스토어) 시점에 마지막 번호 증가 이후
 *   네이티브 변경이 있으면 증가 필요 — Owner 2026-10-20 (AGENTS.md 「개발 프로세스」 6번)
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

const PLIST_FINGERPRINT_KEY = /^Dibay[A-Za-z]+$/;
const PLIST_TOKEN =
  /<\?xml[^>]*\?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->|<plist[^>]*>|<\/plist>|<(dict|array)\s*\/>|<(\/?)(dict|array)>|<(true|false)\s*\/>|<(key|string|integer|real|date|data)>([^<]*)<\/\5>|<(string|data)\s*\/>|(\S)/g;

function decodePlistEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * XML plist → 순서 무관 비교용 정규형 문자열. dict 키는 정렬, array 순서·자료형은 그대로 비교한다.
 * 중복 키·알 수 없는 태그·구조 오류는 throw (호출부는 "다름"으로 처리 — fail closed).
 * @param {string} plistText
 * @param {{ dropFingerprint?: boolean }} [opts] 최상위 Dibay* 문자열 키(빌드 지문) 제외
 */
export function canonicalizeInfoPlist(plistText, opts = {}) {
  const tokens = [];
  for (const m of String(plistText ?? "").matchAll(PLIST_TOKEN)) {
    if (m[8]) throw new Error(`plist: unexpected text near "${m[8]}"`);
    if (m[1]) tokens.push({ kind: "value", value: m[1] === "dict" ? { t: "dict", v: {} } : { t: "array", v: [] } });
    else if (m[3]) tokens.push({ kind: m[2] ? "close" : "open", tag: m[3] });
    else if (m[4]) tokens.push({ kind: "value", value: { t: "bool", v: m[4] === "true" } });
    else if (m[5] === "key") tokens.push({ kind: "key", value: decodePlistEntities(m[6]) });
    else if (m[5]) tokens.push({ kind: "value", value: { t: m[5], v: decodePlistEntities(m[6]) } });
    else if (m[7]) tokens.push({ kind: "value", value: { t: m[7], v: "" } });
  }
  let i = 0;
  const parseValue = () => {
    const tok = tokens[i++];
    if (!tok) throw new Error("plist: unexpected end");
    if (tok.kind === "value") return tok.value;
    if (tok.kind !== "open") throw new Error(`plist: unexpected ${tok.kind}`);
    if (tok.tag === "array") {
      const v = [];
      while (tokens[i]?.kind !== "close") v.push(parseValue());
      if (tokens[i++].tag !== "array") throw new Error("plist: mismatched </dict>");
      return { t: "array", v };
    }
    const v = {};
    while (tokens[i]?.kind !== "close") {
      const keyTok = tokens[i++];
      if (keyTok?.kind !== "key") throw new Error("plist: dict entry without <key>");
      if (Object.hasOwn(v, keyTok.value)) throw new Error(`plist: duplicate key ${keyTok.value}`);
      v[keyTok.value] = parseValue();
    }
    if (tokens[i++].tag !== "dict") throw new Error("plist: mismatched </array>");
    return { t: "dict", v };
  };
  const root = parseValue();
  if (i !== tokens.length) throw new Error("plist: trailing content");
  if (opts.dropFingerprint && root.t === "dict") {
    for (const k of Object.keys(root.v)) {
      if (PLIST_FINGERPRINT_KEY.test(k) && root.v[k].t === "string") delete root.v[k];
    }
  }
  const stable = (node) =>
    node.t === "dict"
      ? { t: "dict", v: Object.fromEntries(Object.keys(node.v).sort().map((k) => [k, stable(node.v[k])])) }
      : node.t === "array"
        ? { t: "array", v: node.v.map(stable) }
        : node;
  return JSON.stringify(stable(root));
}

/**
 * 빌드 지문(최상위 Dibay* 문자열 키)만 다르거나 키 순서만 다른 Info.plist 인가.
 * 키 추가·삭제·값·자료형 변경, 중복 키, 파싱 불가는 false (= 사람이 만든 네이티브 변경).
 */
export function infoPlistEquivalentIgnoringFingerprint(aText, bText) {
  try {
    return (
      canonicalizeInfoPlist(aText, { dropFingerprint: true }) === canonicalizeInfoPlist(bText, { dropFingerprint: true })
    );
  } catch {
    return false;
  }
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
 * CI 가드(커밋 단위) — 빌드 번호 역행·iOS 빌드 구성 불일치만 실패. 네이티브 변경마다 증가를 요구하지 않는다.
 * @returns {string[]} 위반 사유(빈 배열 = 통과)
 */
export function checkVersionIntegrity({ base, head }) {
  const problems = [];
  if (!head.ios.consistent) {
    problems.push(
      `iOS 빌드 구성마다 MARKETING_VERSION/CURRENT_PROJECT_VERSION 값이 다릅니다 (${IOS_PBXPROJ_PATH}) — 앱·푸시 확장 4곳을 같은 값으로 맞추세요.`,
    );
  }
  const a = [base.android.versionCode, head.android.versionCode];
  if (a[0] != null && (a[1] == null || a[1] < a[0])) {
    problems.push(`Android versionCode 가 ${a[0]} → ${a[1] ?? "?"} 로 내려갔습니다 (${ANDROID_GRADLE_PATH}).`);
  }
  const i = [base.ios.buildNumber, head.ios.buildNumber];
  if (i[0] != null && (i[1] == null || i[1] < i[0])) {
    problems.push(`iOS CURRENT_PROJECT_VERSION 이 ${i[0]} → ${i[1] ?? "?"} 로 내려갔습니다 (${IOS_PBXPROJ_PATH}).`);
  }
  return problems;
}

/**
 * 빌드(설치·스토어) 시점 가드 — base = 해당 플랫폼 빌드 번호를 마지막으로 바꾼 커밋.
 * 그 이후 네이티브 변경이 있으면 빌드 번호가 base 보다 커야 한다.
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
export function formatReleaseClassLine({ changes, head, base }) {
  const needAndroid = changes.android.length > 0;
  const needIos = changes.ios.length > 0;
  if (!needAndroid && !needIos) return "[배포 구분] 웹만 — Vercel 배포 후 앱 재시작만 하면 반영 (재빌드 불필요)";
  /** 이 범위에서 번호를 올리지 않았으면 다음 빌드 때 올릴 목표 번호를 표시한다. */
  const target = (h, b) => (h != null && b != null && h <= b ? `${h + 1} · 빌드 시 증가` : `${h}`);
  const parts = [];
  if (needAndroid) {
    parts.push(`Android ${head.android.versionName} (versionCode ${target(head.android.versionCode, base?.android.versionCode)})`);
  }
  if (needIos) parts.push(`iOS ${head.ios.marketingVersion} (build ${target(head.ios.buildNumber, base?.ios.buildNumber)})`);
  return `[배포 구분] 네이티브 — 재빌드·재설치 필요: ${parts.join(" / ")}`;
}

/** 해당 플랫폼 빌드 번호 줄을 마지막으로 바꾼 커밋 (`git log -G`). */
export const BUILD_NUMBER_LOG_ARGS = {
  android: ["log", "-n", "1", "--format=%H", "-G", "versionCode  *[0-9]", "HEAD", "--", ANDROID_GRADLE_PATH],
  ios: ["log", "-n", "1", "--format=%H", "-G", "CURRENT_PROJECT_VERSION = ", "HEAD", "--", IOS_PBXPROJ_PATH],
};
