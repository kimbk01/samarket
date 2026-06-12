import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  createDefaultAppSettingsBundle,
  loadAppSettingsBundleFromDb,
} from "@/lib/admin-settings/app-settings-db";
import { DEFAULT_APP_SETTINGS } from "@/lib/admin-settings/admin-settings-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 공개 읽기: 앱 운영설정 (변경 이력 제외) */
export async function GET(): Promise<NextResponse> {
  try {
    const sb = getSupabaseServer();
    const loaded = await loadAppSettingsBundleFromDb(sb);
    const settings = loaded.ok
      ? { ...DEFAULT_APP_SETTINGS, ...loaded.bundle.settings }
      : createDefaultAppSettingsBundle().settings;
    return NextResponse.json({ ok: true, settings });
  } catch {
    return NextResponse.json({
      ok: true,
      settings: createDefaultAppSettingsBundle().settings,
    });
  }
}
