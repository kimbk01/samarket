/**
 * 출시 기록 동기화 + 업데이트 안내 알림 (앱 업데이트 v2 · Owner 「권장안 승인」 2026-11-01) — 서버 전용.
 *
 * 1) 스토어(또는 기기 보고)에서 새 버전 발견 → `app_releases` 등록 (어드민 입력 없음)
 * 2) 출시 완료(단계적 출시 중이면 보류, D-V2) → 그 플랫폼 · 아직 구버전 회원에게만 「업데이트 안내」 1회 (종 + 푸시, D-V4)
 * 3) 회원이 업데이트하면 그 알림 자동 읽음
 * 처음 실행(플랫폼에 기록 0건)은 기존 버전만 등록하고 알림은 보내지 않는다 — 배포 직후 일괄 발송 방지.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { patchInboxNotificationIdsRead } from "@/lib/notifications/inbox-read-bridge";
import {
  collectAppStoreRelease,
  collectDeviceSeenReleases,
  collectPlayReleases,
  type CollectedRelease,
} from "@/lib/app-releases/app-release-sources";
import {
  compareVersionNames,
  isInstalledOlderThanRelease,
  parseAppVersionLabel,
  type AppReleasePlatform,
  type ParsedAppVersion,
} from "@/lib/app-releases/app-release-version";
import { buildAppReleaseHistoryPath } from "@/lib/app-releases/app-release-paths";

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
  source: CollectedRelease["source"];
  notified_at: string | null;
};

/**
 * 스토어 확인 없이 기기 보고로만 알게 된 버전은, 서로 다른 회원 3명 이상이 설치했을 때만 「출시」로 보고 알림을 보낸다.
 * 직접 설치한 시험 빌드(APK·TestFlight)가 전체 회원 알림을 일으키지 않게 한다.
 */
export const DEVICE_SEEN_RELEASE_MIN_USERS = 3;

const SOURCE_RANK: Record<CollectedRelease["source"], number> = { device_seen: 0, itunes_lookup: 1, play_api: 1 };

function isRolloutComplete(r: { rollout_status: string | null }): boolean {
  return r.rollout_status == null || r.rollout_status === "completed";
}

export async function loadAppReleases(sb: SupabaseClient, platform: AppReleasePlatform): Promise<AppReleaseRow[]> {
  const { data, error } = await sb
    .from("app_releases")
    .select("id, platform, version_name, version_code, released_at, notes_ko, notes_en, store_url, rollout_status, source, notified_at")
    .eq("platform", platform)
    .limit(500);
  if (error) throw new Error(`app_releases_load_failed:${error.message}`);
  return ((data ?? []) as AppReleaseRow[]).sort((a, b) => {
    const byName = compareVersionNames(b.version_name, a.version_name);
    return byName !== 0 ? byName : (b.version_code ?? 0) - (a.version_code ?? 0);
  });
}

/** 수집값을 기록에 반영. 반환 = 이번에 새로 생긴 행 수 */
async function upsertCollected(
  sb: SupabaseClient,
  platform: AppReleasePlatform,
  collected: CollectedRelease[],
  existing: AppReleaseRow[],
  seedMode: boolean
): Promise<number> {
  let inserted = 0;
  const now = new Date().toISOString();
  for (const c of collected) {
    const hit = existing.find((e) => e.version_name === c.version_name);
    if (!hit) {
      const { error } = await sb.from("app_releases").insert({
        platform,
        version_name: c.version_name,
        version_code: c.version_code,
        released_at: c.released_at ?? now,
        notes_ko: c.notes_ko,
        notes_en: c.notes_en,
        store_url: c.store_url,
        rollout_status: c.rollout_status,
        source: c.source,
        notified_at: seedMode ? now : null,
      });
      if (error && !/duplicate key/i.test(error.message)) throw new Error(`app_release_insert_failed:${error.message}`);
      if (!error) inserted += 1;
      continue;
    }
    // 같은 버전: 스토어 값이 기기 보고값보다 우선. 알림 여부(notified_at)는 건드리지 않는다.
    const better = SOURCE_RANK[c.source] >= SOURCE_RANK[hit.source];
    const patch: Record<string, unknown> = {};
    if (better) {
      if (c.notes_ko && c.notes_ko !== hit.notes_ko) patch.notes_ko = c.notes_ko;
      if (c.notes_en && c.notes_en !== hit.notes_en) patch.notes_en = c.notes_en;
      if (c.store_url && c.store_url !== hit.store_url) patch.store_url = c.store_url;
      if (c.rollout_status && c.rollout_status !== hit.rollout_status) patch.rollout_status = c.rollout_status;
      if (c.source !== hit.source) patch.source = c.source;
    }
    if (c.version_code != null && (hit.version_code == null || c.version_code > hit.version_code)) {
      patch.version_code = c.version_code;
    }
    if (Object.keys(patch).length > 0) {
      patch.updated_at = now;
      const { error } = await sb.from("app_releases").update(patch).eq("id", hit.id);
      if (error) throw new Error(`app_release_update_failed:${error.message}`);
    }
  }
  return inserted;
}

type DeviceRow = { user_id: string; app_version: string | null; last_seen_at: string | null };

/** 회원별 그 플랫폼의 가장 최근 기기 버전 */
async function loadLatestDeviceVersions(
  sb: SupabaseClient,
  platform: AppReleasePlatform
): Promise<Map<string, ParsedAppVersion | null>> {
  const { data, error } = await sb
    .from("user_devices")
    .select("user_id, app_version, last_seen_at")
    .eq("platform", platform)
    .eq("is_active", true)
    .limit(5000);
  if (error) throw new Error(`devices_load_failed:${error.message}`);
  const latest = new Map<string, DeviceRow>();
  for (const d of (data ?? []) as DeviceRow[]) {
    const cur = latest.get(d.user_id);
    if (!cur || String(d.last_seen_at ?? "") > String(cur.last_seen_at ?? "")) latest.set(d.user_id, d);
  }
  const out = new Map<string, ParsedAppVersion | null>();
  for (const [uid, d] of latest) out.set(uid, parseAppVersionLabel(d.app_version));
  return out;
}

/** 가장 새 출시(완료)에 대해 아직 안 보낸 회원에게 「업데이트 안내」. 반환 = 보낸 수 */
async function notifyNewestRelease(sb: SupabaseClient, platform: AppReleasePlatform, rows: AppReleaseRow[]): Promise<number> {
  const pending = rows.filter((r) => !r.notified_at && isRolloutComplete(r));
  if (pending.length === 0) return 0;
  const newest = pending[0]!; // rows 는 최신순
  const devices = await loadLatestDeviceVersions(sb, platform);
  if (newest.source === "device_seen") {
    let adopters = 0;
    for (const installed of devices.values()) {
      if (installed && !isInstalledOlderThanRelease(platform, installed, newest)) adopters += 1;
    }
    // 아직 시험 설치 수준 — 알림 보류(다음 확인 때 다시 판단, 안내 완료로 표시하지 않음)
    if (adopters < DEVICE_SEEN_RELEASE_MIN_USERS) return 0;
  }
  let sent = 0;
  for (const [userId, installed] of devices) {
    if (!isInstalledOlderThanRelease(platform, installed, newest)) continue;
    const lang = await loadNotificationUserLanguage(sb, userId);
    const ok = await appendUserNotification(sb, {
      user_id: userId,
      notification_type: "system",
      push_kind: "notice",
      title: notifySafeT(lang, "notify_app_release_title"),
      body: `DIBAY ${newest.version_name}`,
      link_url: buildAppReleaseHistoryPath(platform, newest.version_name),
      dedupe_key: `app_release:${platform}:${newest.version_name}:${userId}`,
      meta: {
        kind: "app_release",
        platform,
        version: newest.version_name,
        version_code: newest.version_code,
      },
    });
    if (ok) sent += 1;
  }
  const { error } = await sb
    .from("app_releases")
    .update({ notified_at: new Date().toISOString() })
    .in(
      "id",
      pending.map((r) => r.id)
    );
  if (error) throw new Error(`app_release_mark_notified_failed:${error.message}`);
  return sent;
}

/**
 * 업데이트한 회원의 「업데이트 안내」 알림을 읽음 처리 (기존 읽음 함수).
 * userId 를 주면 그 회원만(설치 버전을 직접 받음), 없으면 전체 미읽음을 기기 버전으로 확인.
 */
export async function markUpdatedReleaseNotificationsRead(
  sb: SupabaseClient,
  opts: { userId?: string; platform?: AppReleasePlatform; installed?: ParsedAppVersion | null } = {}
): Promise<number> {
  let q = sb
    .from("notification_events")
    .select("id, user_id, display_payload")
    .eq("unread", true)
    .is("read_at", null)
    .eq("display_payload->legacyMeta->>kind", "app_release")
    .limit(2000);
  if (opts.userId) q = q.eq("user_id", opts.userId);
  const { data, error } = await q;
  if (error || !data || data.length === 0) return 0;
  const devicesByPlatform = new Map<AppReleasePlatform, Map<string, ParsedAppVersion | null>>();
  const byUser = new Map<string, string[]>();
  for (const row of data as { id: string; user_id: string; display_payload: Record<string, unknown> | null }[]) {
    const meta = (row.display_payload?.legacyMeta ?? null) as Record<string, unknown> | null;
    const platform = meta?.platform === "ios" ? "ios" : meta?.platform === "android" ? "android" : null;
    const version = typeof meta?.version === "string" ? meta.version : "";
    if (!platform || !version) continue;
    if (opts.platform && opts.platform !== platform) continue;
    let installed: ParsedAppVersion | null | undefined = opts.userId ? opts.installed : undefined;
    if (installed === undefined) {
      if (!devicesByPlatform.has(platform)) devicesByPlatform.set(platform, await loadLatestDeviceVersions(sb, platform));
      installed = devicesByPlatform.get(platform)!.get(row.user_id) ?? null;
    }
    if (!installed) continue;
    const code = typeof meta?.version_code === "number" ? meta.version_code : null;
    if (isInstalledOlderThanRelease(platform, installed, { version_name: version, version_code: code })) continue;
    const list = byUser.get(row.user_id) ?? [];
    list.push(row.id);
    byUser.set(row.user_id, list);
  }
  let updated = 0;
  for (const [uid, ids] of byUser) {
    const r = await patchInboxNotificationIdsRead(sb, uid, ids);
    if (r.ok) updated += r.updated;
  }
  return updated;
}

export type AppReleaseSyncResult = {
  platform: AppReleasePlatform;
  sources: string[];
  inserted: number;
  notified: number;
  seed: boolean;
  error?: string;
};

export async function syncAppReleases(sb: SupabaseClient): Promise<{ results: AppReleaseSyncResult[]; autoRead: number }> {
  const results: AppReleaseSyncResult[] = [];
  const deviceSeen = await collectDeviceSeenReleases(sb).catch(() => [] as CollectedRelease[]);
  for (const platform of ["android", "ios"] as const) {
    const res: AppReleaseSyncResult = { platform, sources: [], inserted: 0, notified: 0, seed: false };
    try {
      let store: CollectedRelease[] | null = null;
      if (platform === "android") {
        store = await collectPlayReleases().catch((e) => {
          res.error = String(e instanceof Error ? e.message : e);
          return null;
        });
      } else {
        store = await collectAppStoreRelease().catch(() => []);
      }
      const collected = [
        ...(store ?? []),
        ...deviceSeen.filter((d) => d.platform === platform),
      ];
      res.sources = [...new Set(collected.map((c) => c.source))];
      const existing = await loadAppReleases(sb, platform);
      res.seed = existing.length === 0;
      res.inserted = await upsertCollected(sb, platform, collected, existing, res.seed);
      const rows = await loadAppReleases(sb, platform);
      if (!res.seed) res.notified = await notifyNewestRelease(sb, platform, rows);
    } catch (e) {
      res.error = String(e instanceof Error ? e.message : e);
    }
    results.push(res);
  }
  const autoRead = await markUpdatedReleaseNotificationsRead(sb).catch(() => 0);
  return { results, autoRead };
}
