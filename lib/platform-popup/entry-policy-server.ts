import { unstable_cache } from "next/cache";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  DEFAULT_PLATFORM_POPUP_ENTRY_POLICY,
  PLATFORM_POPUP_ENTRY_POLICY_CACHE_TAG,
  PLATFORM_POPUP_ENTRY_POLICY_KEY,
  normalizePlatformPopupEntryPolicy,
  type PlatformPopupEntryPolicy,
} from "@/lib/platform-popup/entry-policy";

export type PlatformPopupEntryPolicyPayload = {
  policy: PlatformPopupEntryPolicy;
  /** 낙관적 동시성 판 — `admin_settings.updated_at` (저장된 적 없으면 null) */
  revision: string | null;
};

export class PlatformPopupEntryPolicyReadError extends Error {}

/** 캐시 없이 — 어드민 GET·저장 직전 비교. 읽기 오류면 던진다(기본값과 구분). */
export async function loadPlatformPopupEntryPolicyFromStore(): Promise<PlatformPopupEntryPolicyPayload> {
  const sb = tryGetSupabaseForStores();
  if (!sb) return { policy: { ...DEFAULT_PLATFORM_POPUP_ENTRY_POLICY }, revision: null };
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json, updated_at")
    .eq("key", PLATFORM_POPUP_ENTRY_POLICY_KEY)
    .maybeSingle();
  if (error) throw new PlatformPopupEntryPolicyReadError(error.message);
  const valueJson = (data as { value_json?: unknown } | null)?.value_json ?? null;
  return {
    policy: normalizePlatformPopupEntryPolicy(valueJson),
    revision: valueJson ? ((data as { updated_at?: string | null }).updated_at ?? null) : null,
  };
}

/** 어드민 저장은 태그로 즉시 만료 — 자연 만료는 안전망(1시간). 2026-11-27 운영: 60초 자연 만료로 16.9시간 153번 읽음 */
const cached = unstable_cache(async () => loadPlatformPopupEntryPolicyFromStore(), ["platform-popup:entry-policy:v1"], {
  revalidate: 3600,
  tags: [PLATFORM_POPUP_ENTRY_POLICY_CACHE_TAG],
});

/** 팝업 조회 — 캐시(저장 시 태그 즉시 만료). 읽기 실패면 이번 요청만 기본값(켜짐). */
export async function loadPlatformPopupEntryPolicyCached(): Promise<PlatformPopupEntryPolicy> {
  try {
    return (await cached()).policy;
  } catch {
    return { ...DEFAULT_PLATFORM_POPUP_ENTRY_POLICY };
  }
}
