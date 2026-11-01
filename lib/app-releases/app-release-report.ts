/**
 * 기기 보고 1회 처리 (앱 업데이트 v3 · Owner 2026-11-01 「서버 부하 최소 · 안 된 기기만 · 최소 알림」) — 서버 전용.
 *
 * 서버 예약 작업(주기 확인)은 없다. 앱이 열릴 때 이미 하는 Play 업데이트 확인(팝업) 결과를 기기가 보낼 때만 일한다.
 * - 설치 버전 → 스토어(Play 트랙·App Store)에 그 버전이 있을 때만 업데이트 내역에 기록 (시험 빌드는 기록 안 함)
 * - 「새 버전 있음」 보고 → 그 회원 1명에게만 「업데이트 안내」 종 알림 1건 (푸시·소리 없음 · 같은 버전 1번)
 * - 업데이트를 마치면(설치 버전 ≥ 안내 버전) 그 알림 자동 읽음
 * - Play 키가 있으면 처음 보는 새 버전일 때만 Play 를 1번 읽어 바뀐 점을 채운다
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotificationEvent } from "@/lib/notifications/core/notification-event-repository";
import { categoryForEventType } from "@/lib/notifications/core/notification-policy";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { patchInboxNotificationIdsRead } from "@/lib/notifications/inbox-read-bridge";
import {
  collectAppStoreRelease,
  collectPlayReleases,
  type CollectedRelease,
} from "@/lib/app-releases/app-release-sources";
import { buildAppReleaseHistoryPath } from "@/lib/app-releases/app-release-paths";
import {
  isInstalledOlderThanRelease,
  type AppReleasePlatform,
  type ParsedAppVersion,
} from "@/lib/app-releases/app-release-version";

export type AppReleaseRow = {
  id: string;
  platform: AppReleasePlatform;
  version_name: string;
  version_code: number | null;
  released_at: string;
  notes_ko: string | null;
  notes_en: string | null;
  store_url: string | null;
  rollout_status: string | null;
  source: "play_api" | "itunes_lookup" | "device_seen";
};

const RELEASE_SELECT =
  "id, platform, version_name, version_code, released_at, notes_ko, notes_en, store_url, rollout_status, source";

export async function loadAppReleases(sb: SupabaseClient, platform: AppReleasePlatform): Promise<AppReleaseRow[]> {
  const { data, error } = await sb.from("app_releases").select(RELEASE_SELECT).eq("platform", platform).limit(500);
  if (error) throw new Error(`app_releases_load_failed:${error.message}`);
  const { compareVersionNames } = await import("@/lib/app-releases/app-release-version");
  return ((data ?? []) as AppReleaseRow[]).sort((a, b) => {
    const byName = compareVersionNames(b.version_name, a.version_name);
    return byName !== 0 ? byName : (b.version_code ?? 0) - (a.version_code ?? 0);
  });
}

/**
 * 스토어 응답 1건을 내역에 기록 — 같은 이름 행이 있으면 스토어 값으로 고치고, 없으면 새로 만든다.
 * 업데이트 내역은 이 함수로만 쓴다(기기 보고 값을 그대로 쓰지 않는다 · step4 설계 A 2026-11-02).
 */
async function upsertStoreRelease(sb: SupabaseClient, hit: CollectedRelease, rows: AppReleaseRow[]): Promise<void> {
  const existing = rows.find((r) => r.version_name === hit.version_name);
  const fields = {
    version_code: hit.version_code,
    notes_ko: hit.notes_ko,
    notes_en: hit.notes_en,
    store_url: hit.store_url,
    rollout_status: hit.rollout_status,
    source: hit.source,
    ...(hit.released_at ? { released_at: hit.released_at } : {}),
  };
  if (existing) {
    const { error } = await sb
      .from("app_releases")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new Error(`app_release_update_failed:${error.message}`);
    return;
  }
  const { error } = await sb.from("app_releases").insert({
    platform: hit.platform,
    version_name: hit.version_name.slice(0, 32),
    ...fields,
  });
  if (error && !/duplicate key/i.test(error.message)) throw new Error(`app_release_insert_failed:${error.message}`);
}

/**
 * 설치 버전 보고 → 스토어에 그 버전이 있을 때만 기록 (step4 설계 A · Owner 승인 2026-11-02).
 * 기기 보고는 Play 설치본·시험 APK·Xcode/TestFlight 빌드를 구분하지 못한다(2026-11-01 시험 설치로 1.2.5 (24) → (31)).
 * - Android: Play 프로덕션 트랙에 그 빌드 번호가 있을 때만. Play 키가 없으면 기록하지 않는다.
 * - iOS: App Store 공개 최신 버전과 이름이 같을 때만(날짜 = App Store 출시일).
 */
async function recordStoreConfirmedVersion(
  sb: SupabaseClient,
  platform: AppReleasePlatform,
  installed: ParsedAppVersion,
  rows: AppReleaseRow[]
): Promise<boolean> {
  if (platform === "android") {
    if (installed.code == null) return false;
    if (rows.some((r) => r.version_code === installed.code && r.source === "play_api")) return false;
    const play = await collectPlayReleases();
    const hit = play?.find((p) => p.version_code === installed.code);
    if (!hit) return false;
    await upsertStoreRelease(sb, hit, rows);
    return true;
  }
  if (rows.some((r) => r.version_name === installed.name && r.source === "itunes_lookup")) return false;
  const store = await collectAppStoreRelease();
  const hit = store.find((r) => r.version_name === installed.name);
  if (!hit) return false;
  await upsertStoreRelease(sb, hit, rows);
  return true;
}

/** Play 키가 있을 때, 처음 보는 새 빌드에 한해 Play 를 1번 읽어 버전 이름·바뀐 점을 기록 */
async function fillFromPlayOnce(sb: SupabaseClient, availableCode: number, rows: AppReleaseRow[]): Promise<void> {
  if (rows.some((r) => r.version_code === availableCode && r.source === "play_api")) return;
  const play = await collectPlayReleases().catch(() => null);
  const hit = play?.find((p) => p.version_code === availableCode);
  if (!hit) return;
  await upsertStoreRelease(sb, hit, rows);
}

/** 이 회원의 미읽음 「업데이트 안내」 중 이미 업데이트한 것 읽음 처리 */
export async function markUpdatedReleaseNotificationsRead(
  sb: SupabaseClient,
  userId: string,
  platform: AppReleasePlatform,
  installed: ParsedAppVersion
): Promise<number> {
  const { data, error } = await sb
    .from("notification_events")
    .select("id, display_payload")
    .eq("user_id", userId)
    .eq("unread", true)
    .is("read_at", null)
    .eq("display_payload->legacyMeta->>kind", "app_release")
    .limit(50);
  if (error || !data || data.length === 0) return 0;
  const ids: string[] = [];
  for (const row of data as { id: string; display_payload: Record<string, unknown> | null }[]) {
    const meta = (row.display_payload?.legacyMeta ?? null) as Record<string, unknown> | null;
    if (meta?.platform !== platform) continue;
    const code = typeof meta?.version_code === "number" ? meta.version_code : null;
    const name = typeof meta?.version === "string" ? meta.version : "";
    if (isInstalledOlderThanRelease(platform, installed, { version_name: name || "0", version_code: code })) continue;
    ids.push(row.id);
  }
  if (ids.length === 0) return 0;
  const r = await patchInboxNotificationIdsRead(sb, userId, ids);
  return r.ok ? r.updated : 0;
}

/** 그 회원 1명에게 「업데이트 안내」 종 알림 1건 — 푸시·소리 없음, 같은 버전 1번 */
async function notifyThisMember(
  sb: SupabaseClient,
  userId: string,
  platform: AppReleasePlatform,
  availableCode: number,
  versionName: string | null
): Promise<boolean> {
  const lang = await loadNotificationUserLanguage(sb, userId);
  const created = await createNotificationEvent(sb, {
    userId,
    type: "admin_notice",
    category: categoryForEventType("admin_notice"),
    title: notifySafeT(lang, "notify_app_release_title"),
    // 실기 2026-11-01: 같은 이름(1.2.5)의 다른 빌드와 구분되게 Android 는 빌드 번호를 함께
    body: versionName ? `DIBAY ${versionName}${platform === "android" ? ` (${availableCode})` : ""}` : "",
    dedupeKey: `app_release:${platform}:${availableCode}:${userId}`,
    // 최소 알림: 소리 없음(웹 소리 판정이 이 값을 보고 생략). 푸시는 이 함수가 발송하지 않으므로 없음.
    soundSuppressedReason: "user_settings",
    displayPayload: {
      routeUrl: buildAppReleaseHistoryPath(platform, versionName ?? String(availableCode)),
      legacyNotificationType: "system",
      legacyPushKind: "notice",
      legacyMeta: {
        kind: "app_release",
        platform,
        version: versionName,
        version_code: availableCode,
        push_kind: "notice",
      },
    },
    unread: true,
  });
  return created.ok;
}

export type AppReleaseReportInput = {
  platform: AppReleasePlatform;
  installed: ParsedAppVersion | null;
  /** Play 가 알려 준 새 빌드 번호 (Android 업데이트 팝업 때) */
  availableVersionCode?: number | null;
};

export async function handleAppReleaseReport(
  sb: SupabaseClient,
  userId: string,
  input: AppReleaseReportInput
): Promise<{ recorded: boolean; notified: boolean; notificationsRead: number }> {
  let rows = await loadAppReleases(sb, input.platform);
  let recorded = false;
  if (input.installed) {
    // 스토어 조회 실패로 보고 처리(안내 알림 읽음 등)를 막지 않는다 — 다음 보고 때 다시 확인된다.
    recorded = await recordStoreConfirmedVersion(sb, input.platform, input.installed, rows).catch(() => false);
  }
  let notified = false;
  const code = input.availableVersionCode;
  if (
    input.platform === "android" &&
    typeof code === "number" &&
    Number.isFinite(code) &&
    (input.installed?.code == null || code > input.installed.code)
  ) {
    await fillFromPlayOnce(sb, code, rows).catch(() => undefined);
    rows = await loadAppReleases(sb, input.platform);
    const name = rows.find((r) => r.version_code === code)?.version_name ?? null;
    notified = await notifyThisMember(sb, userId, input.platform, code, name).catch(() => false);
  }
  const notificationsRead = input.installed
    ? await markUpdatedReleaseNotificationsRead(sb, userId, input.platform, input.installed).catch(() => 0)
    : 0;
  return { recorded, notified, notificationsRead };
}
