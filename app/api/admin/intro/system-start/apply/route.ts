import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import { applySystemStartLive } from "@/lib/intro/system-start/live-apply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Layer B Apply — Live System Start generation for next cold start.
 * Does not mutate OS Splash / LaunchScreen binaries.
 */
export async function POST() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    const live = await applySystemStartLive(sb, { userId: admin.userId });
    return NextResponse.json({
      ok: true as const,
      live,
      message:
        "적용 완료 — 다음 앱 실행(콜드 스타트)부터 새 시스템 시작 화면이 표시됩니다.",
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error:
          e instanceof Error
            ? e.message
            : "시스템 시작 화면 적용에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}
