import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { loadAppReleases, markUpdatedReleaseNotificationsRead } from "@/lib/app-releases/app-release-sync";
import { isInstalledOlderThanRelease, parseAppVersionLabel } from "@/lib/app-releases/app-release-version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET `?platform=android|ios&installed=1.2.5 (24)` — 업데이트 내역 (앱 업데이트 v2).
 * 줄마다 `isNew`(설치 버전보다 새 버전)·`isCurrent`. 설치 버전이 최신이면 그 회원의 「업데이트 안내」 알림을 읽음 처리.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const sp = req.nextUrl.searchParams;
  const platform = sp.get("platform") === "ios" ? "ios" : sp.get("platform") === "android" ? "android" : null;
  if (!platform) return NextResponse.json({ ok: false, error: "invalid_platform" }, { status: 400 });
  const installed = parseAppVersionLabel(sp.get("installed"));
  try {
    const rows = await loadAppReleases(sb, platform);
    const releases = rows.map((r) => ({
      version: r.version_name,
      versionCode: r.version_code,
      releasedAt: r.released_at,
      notesKo: r.notes_ko,
      notesEn: r.notes_en,
      storeUrl: r.store_url,
      isNew: isInstalledOlderThanRelease(platform, installed, r),
      isCurrent:
        installed != null &&
        installed.name === r.version_name &&
        (platform !== "android" || installed.code == null || r.version_code == null || installed.code === r.version_code),
    }));
    let notificationsRead = 0;
    if (installed && !releases.some((r) => r.isNew)) {
      notificationsRead = await markUpdatedReleaseNotificationsRead(sb, { userId: auth.userId, platform, installed }).catch(
        () => 0
      );
    }
    return NextResponse.json({
      ok: true,
      releases,
      hasUpdate: releases.some((r) => r.isNew),
      latestStoreUrl: rows.find((r) => r.store_url)?.store_url ?? null,
      notificationsRead,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "releases_fetch_failed" }, { status: 500 });
  }
}
