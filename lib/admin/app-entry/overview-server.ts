/**
 * 앱 진입 어드민 v3 §B 「한눈에 보기」 (Owner 2026-11-17 「v3대로 진행」) — 서버 조회(읽기 전용).
 *
 * 값은 앱(기기)이 받는 것과 같은 서버 함수로 만든다. 화면은 받은 값을 그대로 보여 주기만 한다(다시 계산하지 않음).
 * - OS 시작 화면: `getOsLaunchBuildConfig` · `loadOsLaunchPending` · `isOsLaunchPendingChanged` (OS 시작 화면 어드민 API 와 같음)
 * - 첫 진입 화면: `loadStartupConfigFromDb` (앱이 받는 `startup_config_v1`) · `pathForInitialAppSurface`
 * - 인트로: `buildLaunchIntroPoolPayload` (발견 응답의 `pool` — 기기가 받는 목록) · 이름은 `listLaunchIntroPoolRows`
 *   · 장면 게시본 상태 `loadLaunchIntroLive`
 * - 팝업: `loadPlatformPopupEntryPolicyFromStore` · 팝업 목록과 같은 「앱에 나오나」 색인(`loadPlatformPopupAppliedStatusIndex`)에서
 *   「앱에 나오는 중」(`isPlatformPopupAppliedShowing`) 수 (빌드 전 감사 A2 — 목록 합계와 같은 값)
 * - 설치된 앱 버전: `user_devices.app_version` (활성 · 최근 30일 · Android·iOS · 기기 1대 1번)
 *
 * 각 칸은 따로 실패한다(`ok: false` + 오류 코드) — 한 칸 실패로 다른 칸을 숨기지 않는다.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOsLaunchBuildConfig, loadOsLaunchPending } from "@/lib/os-launch/server";
import { isOsLaunchPendingChanged } from "@/lib/os-launch/contract";
import { loadStartupConfigFromDb } from "@/lib/startup/startup-config-db";
import { pathForInitialAppSurface } from "@/lib/startup/initial-app-surface";
import {
  buildLaunchIntroPoolPayload,
  listLaunchIntroPoolRows,
  loadLaunchIntroPoolPolicy,
} from "@/lib/launch-intro/pool-server";
import { loadLaunchIntroLive, type Sb as LaunchIntroSb } from "@/lib/launch-intro/server";
import { loadPlatformPopupEntryPolicyFromStore } from "@/lib/platform-popup/entry-policy-server";
import { loadPlatformPopupAppliedStatusIndex } from "@/lib/platform-popup/admin-applied-status";
import { isPlatformPopupAppliedShowing } from "@/lib/platform-popup/admin-applied-status-contract";
import { loadStartupConfigLastChange } from "@/lib/admin/app-entry/startup-config-last-change";
import {
  APP_ENTRY_INSTALL_ROW_LIMIT,
  APP_ENTRY_INSTALL_WINDOW_DAYS,
  type AppEntryInstallBucket,
  type AppEntryOverview,
  type AppEntryOverviewFirstEntry,
  type AppEntryOverviewInstalls,
  type AppEntryOverviewIntro,
  type AppEntryOverviewOs,
  type AppEntryOverviewPopup,
} from "@/lib/admin/app-entry/overview-types";

type Sb = SupabaseClient;

async function loadOs(sb: Sb): Promise<AppEntryOverviewOs> {
  const build = getOsLaunchBuildConfig();
  const loaded = await loadOsLaunchPending(sb as unknown as LaunchIntroSb);
  if (!loaded.ok) return { ok: false, error: "os_launch_read_failed" };
  const p = loaded.pending;
  return {
    ok: true,
    build: { backgroundColor: build.backgroundColor, logoSha256: build.logo.sha256 },
    pending: p ? { backgroundColor: p.backgroundColor, logoSha256: p.logo?.sha256 ?? null, updatedAt: p.updatedAt } : null,
    pendingChanged: isOsLaunchPendingChanged(build, p),
    applyModel: "next_native_build",
  };
}

async function loadFirstEntry(sb: Sb): Promise<AppEntryOverviewFirstEntry> {
  const [loaded, lastChange] = await Promise.all([loadStartupConfigFromDb(sb), loadStartupConfigLastChange(sb)]);
  if (!loaded.ok) return { ok: false, error: loaded.reason === "missing_table" ? "table_missing" : "startup_config_read_failed" };
  return {
    ok: true,
    initialSurface: loaded.config.initialSurface,
    path: pathForInitialAppSurface(loaded.config.initialSurface),
    source: loaded.source,
    lastChange,
  };
}

async function loadIntro(sb: Sb, now: Date): Promise<AppEntryOverviewIntro> {
  const isb = sb as unknown as LaunchIntroSb;
  const [payload, policy, rows, live] = await Promise.all([
    buildLaunchIntroPoolPayload(isb),
    loadLaunchIntroPoolPolicy(isb),
    listLaunchIntroPoolRows(isb),
    loadLaunchIntroLive(isb),
  ]);
  let pool: AppEntryOverviewIntro["pool"];
  if (!payload || !policy.ok) {
    pool = { ok: false, error: "intro_pool_read_failed" };
  } else {
    const t = now.getTime();
    const startsLater = (startAtMs: number) => startAtMs > 0 && startAtMs > t;
    const firstEntry = payload.entries[0] ?? null;
    const nameById = new Map(rows.ok ? rows.rows.map((r) => [r.id, r.name] as const) : []);
    pool = {
      ok: true,
      policyEnabled: policy.policy.enabled,
      enabled: payload.enabled,
      showOnOsRestore: payload.showOnOsRestore,
      deviceEntryCount: payload.entries.length,
      showingNowCount: payload.entries.filter((e) => !startsLater(e.startAtMs)).length,
      first: firstEntry
        ? { id: firstEntry.id, name: nameById.get(firstEntry.id) ?? null, startsLater: startsLater(firstEntry.startAtMs) }
        : null,
    };
  }
  const scenes: AppEntryOverviewIntro["scenes"] = live.ok
    ? { ok: true, state: live.live.state, publicationId: live.live.publication_id, updatedAt: live.live.updated_at ?? null }
    : { ok: false, error: "intro_live_read_failed" };
  return { pool, scenes };
}

async function loadPopup(sb: Sb, now: Date): Promise<AppEntryOverviewPopup> {
  const [policy, eligible] = await Promise.all([
    loadPlatformPopupEntryPolicyFromStore().then(
      (p) => ({ ok: true as const, enabled: p.policy.enabled, maxPerEntry: p.policy.maxPerEntry, allowLandscape: p.policy.allowLandscape }),
      () => ({ ok: false as const, error: "popup_policy_read_failed" })
    ),
    // A2: 팝업 목록 「앱에 나오는 중」과 같은 색인·같은 판정(PTR 띠는 자격 함수에서 형태 밖으로 빠짐)
    loadPlatformPopupAppliedStatusIndex(sb, { now }).then(
      (index): AppEntryOverviewPopup["eligible"] => ({
        ok: true,
        count: [...index.byId.values()].filter((s) => isPlatformPopupAppliedShowing(s.state)).length,
      }),
      (): AppEntryOverviewPopup["eligible"] => ({ ok: false, error: "popup_campaigns_read_failed" })
    ),
  ]);
  return { policy, eligible };
}

type DeviceRow = { platform: string; device_id: string; app_version: string | null };

/** 기기(플랫폼+device_id) 1대 1번 — 같은 기기의 FCM·VoIP 행은 최근 버전 하나로 */
export function bucketInstalledVersions(rows: readonly DeviceRow[]): { android: AppEntryInstallBucket[]; ios: AppEntryInstallBucket[] } {
  const seen = new Set<string>();
  const counts = { android: new Map<string, number>(), ios: new Map<string, number>() };
  for (const r of rows) {
    if (r.platform !== "android" && r.platform !== "ios") continue;
    const key = `${r.platform}:${r.device_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const version = (r.app_version ?? "").trim() || "unknown";
    const m = counts[r.platform];
    m.set(version, (m.get(version) ?? 0) + 1);
  }
  const sort = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([version, devices]) => ({ version, devices }))
      .sort((a, b) => b.devices - a.devices || (a.version < b.version ? 1 : -1));
  return { android: sort(counts.android), ios: sort(counts.ios) };
}

export async function loadAppEntryInstalls(sb: Sb, now: Date = new Date()): Promise<AppEntryOverviewInstalls> {
  const since = new Date(now.getTime() - APP_ENTRY_INSTALL_WINDOW_DAYS * 86400000).toISOString();
  const { data, error } = await sb
    .from("user_devices")
    .select("platform, device_id, app_version")
    .eq("is_active", true)
    .in("platform", ["android", "ios"])
    .gte("last_seen_at", since)
    .order("last_seen_at", { ascending: false })
    .limit(APP_ENTRY_INSTALL_ROW_LIMIT);
  if (error) return { ok: false, error: "user_devices_read_failed" };
  const rows = (data ?? []) as DeviceRow[];
  return {
    ok: true,
    windowDays: APP_ENTRY_INSTALL_WINDOW_DAYS,
    ...bucketInstalledVersions(rows),
    truncated: rows.length >= APP_ENTRY_INSTALL_ROW_LIMIT,
    rowLimit: APP_ENTRY_INSTALL_ROW_LIMIT,
  };
}

export async function loadAppEntryOverview(sb: Sb, now: Date = new Date()): Promise<AppEntryOverview> {
  const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);
  const [os, firstEntry, intro, popup, installs] = await Promise.all([
    safe(loadOs(sb), { ok: false, error: "os_launch_read_failed" } as AppEntryOverviewOs),
    safe(loadFirstEntry(sb), { ok: false, error: "startup_config_read_failed" } as AppEntryOverviewFirstEntry),
    safe(loadIntro(sb, now), {
      pool: { ok: false, error: "intro_pool_read_failed" },
      scenes: { ok: false, error: "intro_live_read_failed" },
    } as AppEntryOverviewIntro),
    safe(loadPopup(sb, now), {
      policy: { ok: false, error: "popup_policy_read_failed" },
      eligible: { ok: false, error: "popup_campaigns_read_failed" },
    } as AppEntryOverviewPopup),
    safe(loadAppEntryInstalls(sb, now), { ok: false, error: "user_devices_read_failed" } as AppEntryOverviewInstalls),
  ]);
  return { ok: true, generatedAt: now.toISOString(), os, firstEntry, intro, popup, installs };
}
