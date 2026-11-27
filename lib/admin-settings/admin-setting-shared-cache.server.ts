import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidateTag, unstable_cache } from "next/cache";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

/**
 * 관리자 설정(`admin_settings`) 한 키 — 서버 인스턴스 공유 캐시 (2026-11-27 · Owner 「1·2단계 구현」).
 * 설계: docs/audit/supabase-request-surge-2026-11-18/final-design-2026-11-27.md 단계 1.
 *
 * 운영 실측(11-27 00:00~16:55 PHT): `admin_settings` 1,960번. 값은 관리자가 저장할 때만 바뀌는데
 * 인스턴스 메모리(30·60초)에만 두거나 캐시 없이 읽어, 새 인스턴스·요청마다 DB 를 다시 읽었다.
 * → Next Data Cache(인스턴스 공유, `philife-feed-shared-config-cache.server.ts` 와 같은 방식).
 *
 * - 저장: 이 키를 쓰는 모든 저장 지점이 저장 성공 뒤 `invalidateAdminSettingSharedCache(key)` → 다음 요청부터 새 값.
 *   (저장 지점 목록 = 무효화 목록 — `admin-setting-shared-cache-writers.test.ts` 가 소스로 검사)
 * - 안전망: 1시간 자연 만료(저장 지점 밖에서 DB 를 직접 고친 경우 최대 1시간 옛 값).
 * - 읽기 실패는 캐시하지 않는다 — 공유 캐시가 실패하면(DB 오류·요청 밖) 호출부 클라이언트로 지금처럼 직접 읽는다.
 */
export const ADMIN_SETTING_SHARED_REVALIDATE_SEC = 3600;

/**
 * 공유 캐시로 읽는 키 — 추가할 때는 그 키의 모든 저장 지점에 무효화를 넣는다(시험이 검사).
 * 읽는 모듈이 이 파일을 import 하므로 순환을 피하려고 문자열로 둔다 — 각 모듈 상수와 같은지는 시험이 검사.
 */
export const ADMIN_SETTING_SHARED_KEYS = [
  "app_settings_bundle_v1",
  "philife_neighborhood_section",
  "startup_config_v1",
  "launch_intro_pool_policy_v1",
  "trade_detail_ops",
] as const;

export type AdminSettingSharedKey = (typeof ADMIN_SETTING_SHARED_KEYS)[number];

export function adminSettingSharedCacheTag(key: string): string {
  return `admin-setting:${key}`;
}

export type AdminSettingSharedRow = { value_json: unknown; updated_at: string | null };

/** supabase `maybeSingle()` 결과와 같은 모양 — 호출부의 기존 오류 처리를 그대로 쓰게 한다 */
export type AdminSettingSharedResult = {
  data: AdminSettingSharedRow | null;
  error: { message?: string; code?: string } | null;
};

class AdminSettingSharedReadError extends Error {}

const sharedLoaders = new Map<string, () => Promise<AdminSettingSharedRow | null>>();

function sharedLoaderFor(key: AdminSettingSharedKey): () => Promise<AdminSettingSharedRow | null> {
  let loader = sharedLoaders.get(key);
  if (!loader) {
    loader = unstable_cache(
      async (): Promise<AdminSettingSharedRow | null> => {
        const { data, error } = await getSupabaseServer()
          .from("admin_settings")
          .select("value_json, updated_at")
          .eq("key", key)
          .maybeSingle();
        if (error) throw new AdminSettingSharedReadError(error.message || "admin_setting_read_failed");
        if (!data) return null;
        const row = data as { value_json?: unknown; updated_at?: string | null };
        return { value_json: row.value_json ?? null, updated_at: row.updated_at ?? null };
      },
      ["admin-setting-shared:v1", key],
      { revalidate: ADMIN_SETTING_SHARED_REVALIDATE_SEC, tags: [adminSettingSharedCacheTag(key)] }
    );
    sharedLoaders.set(key, loader);
  }
  return loader;
}

async function readDirect(key: string, sb: SupabaseClient): Promise<AdminSettingSharedResult> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json, updated_at")
    .eq("key", key)
    .maybeSingle();
  if (error) return { data: null, error };
  if (!data) return { data: null, error: null };
  const row = data as { value_json?: unknown; updated_at?: string | null };
  return { data: { value_json: row.value_json ?? null, updated_at: row.updated_at ?? null }, error: null };
}

/**
 * 공유 캐시 읽기. 실패하면 `fallbackSb`(없으면 서비스 클라이언트)로 직접 읽은 결과를 그대로 돌려준다.
 * 관리자 편집 화면·저장 직전 비교(CAS)는 이 함수를 쓰지 않는다 — 항상 DB 를 직접 읽는다.
 */
export async function readAdminSettingShared(
  key: AdminSettingSharedKey,
  fallbackSb?: SupabaseClient | null
): Promise<AdminSettingSharedResult> {
  try {
    return { data: await sharedLoaderFor(key)(), error: null };
  } catch {
    /* DB 오류·요청 밖(스크립트·시험) — 지금처럼 직접 */
  }
  try {
    return await readDirect(key, (fallbackSb ?? getSupabaseServer()) as SupabaseClient);
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}

/** 저장 성공 뒤 호출 — 다음 요청부터 새 값. 요청 밖(스크립트·시험)이면 1시간 자연 만료. */
export function invalidateAdminSettingSharedCache(key: AdminSettingSharedKey): void {
  try {
    revalidateTag(adminSettingSharedCacheTag(key), { expire: 0 });
  } catch {
    /* 요청 밖 — 자연 만료 */
  }
}
