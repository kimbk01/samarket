/**
 * Android 출시 알림 대상·자동발송 자격 (Owner D-N1~D-N5 · 2026-11-04).
 * 순수 함수만 — 화면·Play Core Host 와 분리.
 */
import type { AppReleasePlatform } from "@/lib/app-releases/app-release-version";
import {
  isInstalledOlderThanRelease,
  parseAppVersionLabel,
  type ParsedAppVersion,
} from "@/lib/app-releases/app-release-version";

/** D-N4: 최근 활성 기기 창 */
export const APP_RELEASE_ACTIVE_DEVICE_DAYS = 90;

/** 한 cron/수동 실행당 알림 시도 상한 — 재개 가능(notified_at 미표시) */
export const APP_RELEASE_NOTIFY_MAX_PER_RUN = 100;

/** user_devices 페이지 크기 */
export const APP_RELEASE_DEVICE_PAGE_SIZE = 500;

export type AppReleaseNotifyRow = {
  id: string;
  platform: AppReleasePlatform;
  version_name: string;
  version_code: number | null;
  rollout_status: string | null;
  source: "play_api" | "itunes_lookup" | "device_seen" | string;
  notified_at: string | null;
};

/** Play 트랙 status 가 production 전체 출시로 확정된 경우만 자동 발송. */
export function isPlayRolloutCompletedForAutoNotify(rolloutStatus: string | null | undefined): boolean {
  return rolloutStatus === "completed";
}

/**
 * 자동 fan-out 자격.
 * - Android: Play API + production `completed` + versionCode 필수
 * - iOS: itunes_lookup (공개 출시만 수집됨)
 * - device_seen · draft · inProgress(단계적) · halted → 자동 발송 금지 (관리자 수동 확정만)
 */
export function isEligibleForAutoReleaseNotify(row: AppReleaseNotifyRow): boolean {
  if (row.notified_at) return false;
  if (row.platform === "android") {
    if (row.source !== "play_api") return false;
    if (row.version_code == null || !Number.isFinite(row.version_code)) return false;
    return isPlayRolloutCompletedForAutoNotify(row.rollout_status);
  }
  if (row.platform === "ios") {
    return row.source === "itunes_lookup" && Boolean(row.version_name);
  }
  return false;
}

/** 관리자 수동 확정 — 스토어 미확정(closed testing 등)도 Owner 확인 후 발송 가능. */
export function isEligibleForAdminConfirmedNotify(row: AppReleaseNotifyRow): boolean {
  if (row.notified_at) return false;
  if (row.platform === "android") {
    return row.version_code != null && Number.isFinite(row.version_code);
  }
  return Boolean(row.version_name);
}

export function buildAppReleaseNotifyDedupeKey(
  platform: AppReleasePlatform,
  versionCodeOrName: string | number,
  userId: string
): string {
  return `app_release:${platform}:${versionCodeOrName}:${userId}`;
}

export function releaseNotifyIdentity(row: AppReleaseNotifyRow): string | number | null {
  if (row.platform === "android") return row.version_code;
  return row.version_name || null;
}

/** last_seen 이 활성 창 안이고, Android 는 versionCode 파싱이 될 때만 신뢰. */
export function isTrustedActiveDeviceForNotify(opts: {
  platform: AppReleasePlatform;
  appVersion: string | null | undefined;
  lastSeenAt: string | null | undefined;
  nowMs?: number;
  activeDays?: number;
}): { ok: true; installed: ParsedAppVersion } | { ok: false; reason: string } {
  const days = opts.activeDays ?? APP_RELEASE_ACTIVE_DEVICE_DAYS;
  const now = opts.nowMs ?? Date.now();
  const seen = opts.lastSeenAt ? Date.parse(opts.lastSeenAt) : NaN;
  if (!Number.isFinite(seen)) return { ok: false, reason: "last_seen_missing" };
  if (now - seen > days * 86_400_000) return { ok: false, reason: "last_seen_stale" };
  const installed = parseAppVersionLabel(opts.appVersion);
  if (!installed) return { ok: false, reason: "app_version_unparseable" };
  if (opts.platform === "android" && installed.code == null) {
    return { ok: false, reason: "android_version_code_missing" };
  }
  return { ok: true, installed };
}

/** 관리자 L3 「발송 확정」 — 운영자가 그대로 다시 입력하는 대상 버전 (화면·서버 같은 값). 예: `1.2.6 (31)` */
export function appReleaseConfirmText(row: { version_name: string; version_code: number | null }): string {
  return `${row.version_name}${row.version_code != null ? ` (${row.version_code})` : ""}`;
}

/** 예전 관리자 화면(사유·재입력 없이 보내던 요청) — 화면을 새로고침해야 한다는 오류 코드 */
export const APP_RELEASE_ADMIN_SCREEN_OUTDATED = "admin_screen_outdated_refresh_required";

export function shouldNotifyUserForRelease(
  platform: AppReleasePlatform,
  installed: ParsedAppVersion | null,
  release: { version_name: string; version_code: number | null }
): boolean {
  return isInstalledOlderThanRelease(platform, installed, release);
}
