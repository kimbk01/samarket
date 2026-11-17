import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { loadAppEntryOverview } from "@/lib/admin/app-entry/overview-server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 앱 진입 어드민 v3 §B 「한눈에 보기」 — 읽기 전용. 가드 = 다른 광고·앱 진입 어드민 조회(GET)와 같음(`requireAdminApiUser`).
 * 값은 앱이 받는 것과 같은 서버 함수로 만든다(`loadAppEntryOverview`).
 */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  return NextResponse.json(await loadAppEntryOverview(sb));
}
