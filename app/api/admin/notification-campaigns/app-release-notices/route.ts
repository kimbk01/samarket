import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  listAppReleaseNoticeGroups,
  listAppReleaseNoticeRecipients,
} from "@/lib/admin/notification-campaigns/app-release-notice-list";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — 「업데이트 내역」 탭 (Owner 구현 승인 2026-11-02 · 시안 v3). 자동 업데이트 안내를 버전별로.
 * `?platform=android&version_code=24` 이면 그 버전 안내를 받은 회원 목록.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const svc = tryCreateSupabaseServiceClient();
  if (!svc) return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  const sp = req.nextUrl.searchParams;
  const platform = sp.get("platform")?.trim() ?? "";
  try {
    if (platform) {
      const codeRaw = sp.get("version_code")?.trim() ?? "";
      const code = codeRaw && Number.isFinite(Number(codeRaw)) ? Number(codeRaw) : null;
      const recipients = await listAppReleaseNoticeRecipients(svc, platform, code);
      return NextResponse.json({ ok: true, recipients });
    }
    const releases = await listAppReleaseNoticeGroups(svc);
    return NextResponse.json({ ok: true, releases });
  } catch (err) {
    console.error("[admin/app-release-notices] failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}
