import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { handleAppReleaseReport, loadAppReleases } from "@/lib/app-releases/app-release-report";
import { isInstalledOlderThanRelease, parseAppVersionLabel } from "@/lib/app-releases/app-release-version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePlatform(v: unknown): "android" | "ios" | null {
  return v === "ios" ? "ios" : v === "android" ? "android" : null;
}

/**
 * GET `?platform=&installed=1.2.5 (24)` — 업데이트 내역 (앱 업데이트 v3). 설치 버전 기록 + 업데이트했으면 안내 알림 읽음.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const sp = req.nextUrl.searchParams;
  const platform = parsePlatform(sp.get("platform"));
  if (!platform) return NextResponse.json({ ok: false, error: "invalid_platform" }, { status: 400 });
  const installed = parseAppVersionLabel(sp.get("installed"));
  try {
    const report = await handleAppReleaseReport(sb, auth.userId, { platform, installed });
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
    return NextResponse.json({
      ok: true,
      releases,
      hasUpdate: releases.some((r) => r.isNew),
      latestStoreUrl: rows.find((r) => r.store_url)?.store_url ?? null,
      notificationsRead: report.notificationsRead,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "releases_fetch_failed" }, { status: 500 });
  }
}

/**
 * POST `{ platform, installed, available_version_code? }` — 기기 보고 (앱 열 때 설치 버전이 바뀌었거나, Play 가 새 버전을 알려 줄 때만).
 * 새 버전 보고면 그 회원 1명에게만 「업데이트 안내」 종 알림(푸시·소리 없음, 버전당 1번).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as {
    platform?: unknown;
    installed?: unknown;
    available_version_code?: unknown;
  };
  const platform = parsePlatform(body.platform);
  if (!platform) return NextResponse.json({ ok: false, error: "invalid_platform" }, { status: 400 });
  const installed = parseAppVersionLabel(typeof body.installed === "string" ? body.installed : null);
  const code = Number(body.available_version_code);
  try {
    const result = await handleAppReleaseReport(sb, auth.userId, {
      platform,
      installed,
      availableVersionCode: Number.isInteger(code) && code > 0 && code < 1e9 ? code : null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "report_failed" }, { status: 500 });
  }
}
