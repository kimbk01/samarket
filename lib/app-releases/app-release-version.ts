/**
 * 앱 버전 표기 해석·비교 (앱 업데이트 v2 · Owner 승인 2026-11-01).
 * 기기 보고값(`user_devices.app_version`) 예: `1.2.5 (24)` · `1.0.1` · iOS `1.2 (20)`.
 * Android 는 versionCode(괄호 숫자)가 있으면 그것으로, 없으면 버전 이름으로 비교한다.
 */
export type AppReleasePlatform = "android" | "ios";

export type ParsedAppVersion = { name: string; code: number | null };

export function parseAppVersionLabel(raw: string | null | undefined): ParsedAppVersion | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = /^v?([0-9][0-9A-Za-z.\-]*)\s*(?:\((\d{1,9})\))?$/.exec(s);
  if (!m) return null;
  return { name: m[1]!, code: m[2] ? Number(m[2]) : null };
}

/** 버전 이름 비교 (1.2.10 > 1.2.9). a<b → 음수 */
export function compareVersionNames(a: string, b: string): number {
  const pa = a.split(/[.\-]/).map((x) => Number.parseInt(x, 10));
  const pb = b.split(/[.\-]/).map((x) => Number.parseInt(x, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = Number.isFinite(pa[i]) ? pa[i]! : 0;
    const y = Number.isFinite(pb[i]) ? pb[i]! : 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/** 설치 버전이 출시 버전보다 낮은가 (= 업데이트 대상). 모르면 false(알림 안 보냄). */
export function isInstalledOlderThanRelease(
  platform: AppReleasePlatform,
  installed: ParsedAppVersion | null,
  release: { version_name: string; version_code: number | null }
): boolean {
  if (!installed) return false;
  if (platform === "android" && installed.code != null && release.version_code != null) {
    return installed.code < release.version_code;
  }
  const byName = compareVersionNames(installed.name, release.version_name);
  if (byName !== 0) return byName < 0;
  if (installed.code != null && release.version_code != null) return installed.code < release.version_code;
  return false;
}
