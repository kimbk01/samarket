/**
 * 출시 무음 감지 + 구버전 1회 알림 (Owner 조건부 승인 2026-11-04).
 *
 * - Play/App Store 수집 → app_releases upsert
 * - 자동 발송: production `completed`(Android) / itunes(iOS) 만
 * - 동일 platform·versionCode(또는 iOS name)·user 당 인앱 1 + 푸시 시도 1 (기존 append + dedupe)
 * - 단계적·closed testing·device_seen 단독 → 자동 발송 없음 (관리자 수동 확정)
 * - Host / AndroidPlayUpdateScreen / 시안 비변경
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { categoryForEventType } from "@/lib/notifications/core/notification-policy";
import { createAndDispatchNotificationEvent } from "@/lib/notifications/pipeline/notification-event-dispatcher";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import {
  collectAppStoreRelease,
  collectPlayReleases,
  type CollectedRelease,
} from "@/lib/app-releases/app-release-sources";
import { buildAppReleaseHistoryPath } from "@/lib/app-releases/app-release-paths";
import {
  compareVersionNames,
  type AppReleasePlatform,
  type ParsedAppVersion,
} from "@/lib/app-releases/app-release-version";
import {
  APP_RELEASE_DEVICE_PAGE_SIZE,
  APP_RELEASE_NOTIFY_MAX_PER_RUN,
  buildAppReleaseNotifyDedupeKey,
  isEligibleForAdminConfirmedNotify,
  isEligibleForAutoReleaseNotify,
  isTrustedActiveDeviceForNotify,
  releaseNotifyIdentity,
  shouldNotifyUserForRelease,
  type AppReleaseNotifyRow,
} from "@/lib/app-releases/app-release-notify-policy";

export type AppReleaseRow = AppReleaseNotifyRow & {
  released_at: string;
  notes_ko: string | null;
  notes_en: string | null;
  store_url: string | null;
};

const SOURCE_RANK: Record<CollectedRelease["source"], number> = {
  device_seen: 0,
  itunes_lookup: 1,
  play_api: 1,
};

export async function loadAppReleasesForSync(
  sb: SupabaseClient,
  platform: AppReleasePlatform
): Promise<AppReleaseRow[]> {
  const { data, error } = await sb
    .from("app_releases")
    .select(
      "id, platform, version_name, version_code, released_at, notes_ko, notes_en, store_url, rollout_status, source, notified_at"
    )
    .eq("platform", platform)
    .limit(500);
  if (error) throw new Error(`app_releases_load_failed:${error.message}`);
  return ((data ?? []) as AppReleaseRow[]).sort((a, b) => {
    const byName = compareVersionNames(b.version_name, a.version_name);
    return byName !== 0 ? byName : (b.version_code ?? 0) - (a.version_code ?? 0);
  });
}

/** 수집값 반영. 같은 version_name 에서 version_code 가 올라가면 notified_at 을 비워 재알림 허용. */
export async function upsertCollectedReleases(
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
      if (error && !/duplicate key/i.test(error.message)) {
        throw new Error(`app_release_insert_failed:${error.message}`);
      }
      if (!error) inserted += 1;
      continue;
    }
    const hitSource = hit.source as CollectedRelease["source"];
    const better =
      (SOURCE_RANK[c.source] ?? 0) >= (SOURCE_RANK[hitSource] ?? 0);
    const patch: Record<string, unknown> = {};
    if (better) {
      if (c.notes_ko && c.notes_ko !== hit.notes_ko) patch.notes_ko = c.notes_ko;
      if (c.notes_en && c.notes_en !== hit.notes_en) patch.notes_en = c.notes_en;
      if (c.store_url && c.store_url !== hit.store_url) patch.store_url = c.store_url;
      if (c.rollout_status && c.rollout_status !== hit.rollout_status) {
        patch.rollout_status = c.rollout_status;
      }
      if (c.source !== hit.source) patch.source = c.source;
    }
    if (c.version_code != null && (hit.version_code == null || c.version_code > hit.version_code)) {
      patch.version_code = c.version_code;
      // 동일 marketing 버전·새 빌드 → 재알림 허용 (예: 1.2.5 (24) → 1.2.5 (37))
      if (hit.notified_at) patch.notified_at = null;
    }
    if (Object.keys(patch).length > 0) {
      patch.updated_at = now;
      const { error } = await sb.from("app_releases").update(patch).eq("id", hit.id);
      if (error) throw new Error(`app_release_update_failed:${error.message}`);
      Object.assign(hit, patch);
    }
  }
  return inserted;
}

type DeviceRow = {
  user_id: string;
  app_version: string | null;
  last_seen_at: string | null;
};

/** 회원별 최신 활성·신뢰 가능 기기 버전 (90일 · Android versionCode 필수). */
export async function loadTrustedActiveDeviceVersions(
  sb: SupabaseClient,
  platform: AppReleasePlatform
): Promise<Map<string, ParsedAppVersion>> {
  const out = new Map<string, ParsedAppVersion>();
  const latest = new Map<string, DeviceRow>();
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("user_devices")
      .select("user_id, app_version, last_seen_at")
      .eq("platform", platform)
      .eq("is_active", true)
      .order("last_seen_at", { ascending: false })
      .range(from, from + APP_RELEASE_DEVICE_PAGE_SIZE - 1);
    if (error) throw new Error(`devices_load_failed:${error.message}`);
    const page = (data ?? []) as DeviceRow[];
    if (page.length === 0) break;
    for (const d of page) {
      const cur = latest.get(d.user_id);
      if (!cur || String(d.last_seen_at ?? "") > String(cur.last_seen_at ?? "")) {
        latest.set(d.user_id, d);
      }
    }
    if (page.length < APP_RELEASE_DEVICE_PAGE_SIZE) break;
    from += APP_RELEASE_DEVICE_PAGE_SIZE;
  }
  const nowMs = Date.now();
  for (const [uid, d] of latest) {
    const trust = isTrustedActiveDeviceForNotify({
      platform,
      appVersion: d.app_version,
      lastSeenAt: d.last_seen_at,
      nowMs,
    });
    if (trust.ok) out.set(uid, trust.installed);
  }
  return out;
}

export type NotifyReleaseResult = {
  releaseId: string;
  attempted: number;
  created: number;
  incomplete: boolean;
  skippedReason?: string;
};

/**
 * 한 출시에 대해 구버전 회원 fan-out.
 * 중단 후 재개: notified_at 미설정 + dedupe 로 중복 0.
 * 상한 초과 시 incomplete=true → 다음 cron/수동이 이어서 처리.
 */
export async function notifyReleaseFanOut(
  sb: SupabaseClient,
  release: AppReleaseRow,
  opts: { forceAdminConfirm?: boolean; maxPerRun?: number } = {}
): Promise<NotifyReleaseResult> {
  const eligible = opts.forceAdminConfirm
    ? isEligibleForAdminConfirmedNotify(release)
    : isEligibleForAutoReleaseNotify(release);
  if (!eligible) {
    return {
      releaseId: release.id,
      attempted: 0,
      created: 0,
      incomplete: false,
      skippedReason: "not_eligible",
    };
  }
  const identity = releaseNotifyIdentity(release);
  if (identity == null) {
    return {
      releaseId: release.id,
      attempted: 0,
      created: 0,
      incomplete: false,
      skippedReason: "identity_missing",
    };
  }

  const devices = await loadTrustedActiveDeviceVersions(sb, release.platform);
  const max = opts.maxPerRun ?? APP_RELEASE_NOTIFY_MAX_PER_RUN;
  let attempted = 0;
  let created = 0;
  let incomplete = false;

  for (const [userId, installed] of devices) {
    if (!shouldNotifyUserForRelease(release.platform, installed, release)) continue;
    if (created >= max) {
      incomplete = true;
      break;
    }
    attempted += 1;
    const lang = await loadNotificationUserLanguage(sb, userId);
    const linkUrl = buildAppReleaseHistoryPath(release.platform, release.version_name);
    const dedupeKey = buildAppReleaseNotifyDedupeKey(release.platform, identity, userId);
    const meta = {
      kind: "app_release",
      platform: release.platform,
      version: release.version_name,
      version_code: release.version_code,
    };
    // createAndDispatch: duplicate 와 신규를 구분해 재개 시 상한을 중복에 낭비하지 않음.
    // push_kind notice → admin_notice → 공지 채널(D-N2). 공지 OFF 는 preference gate 가 푸시만 막음(D-N3).
    const result = await createAndDispatchNotificationEvent(sb, {
      userId,
      type: "admin_notice",
      category: categoryForEventType("admin_notice"),
      title: notifySafeT(lang, "notify_app_release_title"),
      body: `DIBAY ${release.version_name}${
        release.version_code != null ? ` (${release.version_code})` : ""
      }`,
      dedupeKey,
      displayPayload: {
        routeUrl: linkUrl,
        legacyNotificationType: "system",
        legacyPushKind: "notice",
        legacyMeta: meta,
      },
      unread: true,
      appState: "background",
    });
    if (result.ok) created += 1;
    // duplicate / error → 다음 회원 (상한은 신규 생성 수만)
  }

  if (!incomplete) {
    const now = new Date().toISOString();
    const { error } = await sb.from("app_releases").update({ notified_at: now }).eq("id", release.id);
    if (error) throw new Error(`app_release_mark_notified_failed:${error.message}`);
    // 더 낮은 미알림 행은 스팸 방지로 함께 완료 표시
    const siblings = await loadAppReleasesForSync(sb, release.platform);
    const olderIds = siblings
      .filter((r) => {
        if (r.id === release.id || r.notified_at) return false;
        if (release.platform === "android" && release.version_code != null && r.version_code != null) {
          return r.version_code < release.version_code;
        }
        return compareVersionNames(r.version_name, release.version_name) < 0;
      })
      .map((r) => r.id);
    if (olderIds.length > 0) {
      await sb.from("app_releases").update({ notified_at: now }).in("id", olderIds);
    }
  }

  return { releaseId: release.id, attempted, created, incomplete };
}

async function notifyNewestEligible(
  sb: SupabaseClient,
  platform: AppReleasePlatform,
  rows: AppReleaseRow[],
  opts: { forceAdminConfirm?: boolean } = {}
): Promise<NotifyReleaseResult | null> {
  const pending = rows.filter((r) =>
    opts.forceAdminConfirm ? isEligibleForAdminConfirmedNotify(r) : isEligibleForAutoReleaseNotify(r)
  );
  if (pending.length === 0) return null;
  return notifyReleaseFanOut(sb, pending[0]!, opts);
}

export type AppReleaseSyncResult = {
  platform: AppReleasePlatform;
  sources: string[];
  inserted: number;
  notified: number;
  attempted: number;
  incomplete: boolean;
  seed: boolean;
  playKeyMissing?: boolean;
  error?: string;
};

export async function syncAppReleases(
  sb: SupabaseClient,
  opts: { notify?: boolean } = {}
): Promise<{ results: AppReleaseSyncResult[] }> {
  const doNotify = opts.notify !== false;
  const results: AppReleaseSyncResult[] = [];

  for (const platform of ["android", "ios"] as const) {
    const res: AppReleaseSyncResult = {
      platform,
      sources: [],
      inserted: 0,
      notified: 0,
      attempted: 0,
      incomplete: false,
      seed: false,
    };
    try {
      let store: CollectedRelease[] | null = null;
      if (platform === "android") {
        store = await collectPlayReleases().catch((e) => {
          res.error = String(e instanceof Error ? e.message : e);
          return null;
        });
        if (store === null && !res.error) res.playKeyMissing = true;
      } else {
        store = await collectAppStoreRelease().catch(() => []);
      }
      // device_seen 단독으로는 자동 발송하지 않음 — 스토어 수집만 upsert
      const collected = store ?? [];
      res.sources = [...new Set(collected.map((c) => c.source))];
      const existing = await loadAppReleasesForSync(sb, platform);
      res.seed = existing.length === 0;
      res.inserted = await upsertCollectedReleases(sb, platform, collected, existing, res.seed);
      if (doNotify && !res.seed) {
        const rows = await loadAppReleasesForSync(sb, platform);
        const n = await notifyNewestEligible(sb, platform, rows);
        if (n) {
          res.notified = n.created;
          res.attempted = n.attempted;
          res.incomplete = n.incomplete;
        }
      }
    } catch (e) {
      res.error = String(e instanceof Error ? e.message : e);
    }
    results.push(res);
  }

  // 알림 읽음은 기기 설치 버전 보고(`handleAppReleaseReport`) 경로에서 회원 단위로 처리.
  return { results };
}

/** 관리자: 특정 출시 행을 수동 확정 발송 (Play completed 미확인·closed testing 등). */
export async function adminConfirmNotifyRelease(
  sb: SupabaseClient,
  releaseId: string
): Promise<NotifyReleaseResult> {
  const { data, error } = await sb
    .from("app_releases")
    .select(
      "id, platform, version_name, version_code, released_at, notes_ko, notes_en, store_url, rollout_status, source, notified_at"
    )
    .eq("id", releaseId)
    .maybeSingle();
  if (error) throw new Error(`app_release_load_failed:${error.message}`);
  if (!data) throw new Error("app_release_not_found");
  return notifyReleaseFanOut(sb, data as AppReleaseRow, { forceAdminConfirm: true });
}
