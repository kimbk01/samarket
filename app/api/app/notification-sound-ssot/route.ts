import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { loadNotificationSoundSsotCached } from "@/lib/notifications/load-notification-sound-ssot-server";
import { loadNotificationSoundSsotShared } from "@/lib/notifications/notification-sound-ssot-shared-cache.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * App client — read-only admin SSOT snapshot for in-app sound hydrate.
 * Foreground playback only; no per-user sound overrides in payload.
 */
export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  try {
    /** 2026-11-26 D6 — 인스턴스 공유 캐시 먼저, 실패 시 기존 경로(인스턴스 메모리 60초) */
    const data = await loadNotificationSoundSsotShared().catch(() =>
      loadNotificationSoundSsotCached(getSupabaseServer())
    );
    return NextResponse.json({
      ok: true,
      assets: data.assets,
      events: data.events,
      mappings: data.mappings,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
