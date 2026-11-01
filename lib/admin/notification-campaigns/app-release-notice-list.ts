/**
 * 보낸 알림 「업데이트 내역」 탭 (Owner 구현 승인 2026-11-02 · 시안 v3) — 자동 「업데이트 안내」를 버전별로 본다.
 * 출처: `app_releases`(출시 기록) + `notification_events`(legacyMeta.kind = app_release, 회원마다 1건).
 * 회원이 실제로 업데이트한 시각은 기록이 없어 보여 주지 않는다(지금 설치 버전만 `user_devices`).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorDisplayName } from "@/lib/admin/notification-campaigns/campaign-list-service";

export type AppReleaseNoticeGroup = {
  platform: string;
  version_name: string;
  version_code: number | null;
  released_at: string | null;
  release_source: string | null;
  notified: number;
  read: number;
  first_at: string | null;
  last_at: string | null;
};

type NoticeRow = {
  user_id: string;
  created_at: string;
  read_at: string | null;
  platform: string | null;
  version: string | null;
  version_code: string | null;
};

async function readNotices(svc: SupabaseClient): Promise<NoticeRow[]> {
  const out: NoticeRow[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 100_000; from += PAGE) {
    const { data, error } = await svc
      .from("notification_events")
      .select(
        "user_id, created_at, read_at, platform:display_payload->legacyMeta->>platform, version:display_payload->legacyMeta->>version, version_code:display_payload->legacyMeta->>version_code"
      )
      .eq("display_payload->legacyMeta->>kind", "app_release")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`app_release_notices_read_failed:${error.message}`);
    const chunk = (data ?? []) as unknown as NoticeRow[];
    out.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return out;
}

const keyOf = (platform: string | null | undefined, code: number | string | null | undefined) =>
  `${String(platform ?? "")}|${code == null ? "" : String(code)}`;

export async function listAppReleaseNoticeGroups(svc: SupabaseClient): Promise<AppReleaseNoticeGroup[]> {
  const [{ data: releases, error }, notices] = await Promise.all([
    svc.from("app_releases").select("platform, version_name, version_code, released_at, source"),
    readNotices(svc),
  ]);
  if (error) throw new Error(`app_releases_read_failed:${error.message}`);
  const groups = new Map<string, AppReleaseNoticeGroup>();
  for (const r of (releases ?? []) as Array<Record<string, unknown>>) {
    const code = typeof r.version_code === "number" ? r.version_code : null;
    groups.set(keyOf(String(r.platform), code), {
      platform: String(r.platform),
      version_name: String(r.version_name ?? ""),
      version_code: code,
      released_at: typeof r.released_at === "string" ? r.released_at : null,
      release_source: typeof r.source === "string" ? r.source : null,
      notified: 0,
      read: 0,
      first_at: null,
      last_at: null,
    });
  }
  for (const n of notices) {
    const code = n.version_code != null && n.version_code !== "" ? Number(n.version_code) : null;
    const k = keyOf(n.platform, code);
    const g =
      groups.get(k) ??
      ({
        platform: String(n.platform ?? ""),
        version_name: String(n.version ?? ""),
        version_code: code,
        released_at: null,
        release_source: null,
        notified: 0,
        read: 0,
        first_at: null,
        last_at: null,
      } as AppReleaseNoticeGroup);
    g.notified += 1;
    if (n.read_at) g.read += 1;
    g.first_at = g.first_at && g.first_at < n.created_at ? g.first_at : n.created_at;
    g.last_at = g.last_at && g.last_at > n.created_at ? g.last_at : n.created_at;
    groups.set(k, g);
  }
  return [...groups.values()].sort(
    (a, b) => (b.released_at ?? b.last_at ?? "").localeCompare(a.released_at ?? a.last_at ?? "")
  );
}

export type AppReleaseNoticeRecipient = {
  user_id: string;
  name: string | null;
  notified_at: string;
  read_at: string | null;
  installed_version: string | null;
  installed_seen_at: string | null;
};

export async function listAppReleaseNoticeRecipients(
  svc: SupabaseClient,
  platform: string,
  versionCode: number | null
): Promise<AppReleaseNoticeRecipient[]> {
  const notices = (await readNotices(svc)).filter(
    (n) => String(n.platform ?? "") === platform && (versionCode == null || Number(n.version_code) === versionCode)
  );
  const ids = [...new Set(notices.map((n) => n.user_id))];
  const names = new Map<string, string | null>();
  const installed = new Map<string, { v: string | null; at: string | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const [{ data: profiles }, { data: devices }] = await Promise.all([
      svc.from("profiles").select("id, display_name, nickname, username").in("id", chunk),
      svc
        .from("user_devices")
        .select("user_id, platform, app_version, last_seen_at")
        .in("user_id", chunk)
        .eq("platform", platform)
        .order("last_seen_at", { ascending: false }),
    ]);
    for (const p of (profiles ?? []) as Array<Record<string, unknown>>) names.set(String(p.id), authorDisplayName(p));
    for (const d of (devices ?? []) as Array<Record<string, unknown>>) {
      const uid = String(d.user_id);
      if (installed.has(uid)) continue;
      installed.set(uid, {
        v: typeof d.app_version === "string" ? d.app_version : null,
        at: typeof d.last_seen_at === "string" ? d.last_seen_at : null,
      });
    }
  }
  return notices
    .map((n) => ({
      user_id: n.user_id,
      name: names.get(n.user_id) ?? null,
      notified_at: n.created_at,
      read_at: n.read_at,
      installed_version: installed.get(n.user_id)?.v ?? null,
      installed_seen_at: installed.get(n.user_id)?.at ?? null,
    }))
    .sort((a, b) => b.notified_at.localeCompare(a.notified_at));
}
