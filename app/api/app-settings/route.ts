import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  createDefaultAppSettingsBundle,
  loadAppSettingsBundleFromDb,
} from "@/lib/admin-settings/app-settings-db";
import { DEFAULT_APP_SETTINGS } from "@/lib/admin-settings/admin-settings-utils";
import {
  PUBLIC_CONFIG_CDN_CACHE_CONTROL,
  PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL,
} from "@/lib/http/public-config-cache-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 공개 읽기: 앱 운영설정 (변경 이력 제외)
 * D3: 모든 회원에게 같은 값 → DB 에서 읽은 응답만 CDN 60초 캐시. 기본값(읽기 실패) 응답은 캐시 금지.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const sb = getSupabaseServer();
    const loaded = await loadAppSettingsBundleFromDb(sb);
    if (!loaded.ok) {
      return NextResponse.json(
        { ok: true, settings: createDefaultAppSettingsBundle().settings },
        { headers: { "Cache-Control": PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL } }
      );
    }
    return NextResponse.json(
      { ok: true, settings: { ...DEFAULT_APP_SETTINGS, ...loaded.bundle.settings } },
      { headers: { "Cache-Control": PUBLIC_CONFIG_CDN_CACHE_CONTROL } }
    );
  } catch {
    return NextResponse.json(
      { ok: true, settings: createDefaultAppSettingsBundle().settings },
      { headers: { "Cache-Control": PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL } }
    );
  }
}
