import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import { setLiveRelease } from "@/lib/intro/live/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  let releaseId = "";
  let expectedSourceDraftVersion: number | undefined;
  try {
    const body = (await req.json()) as {
      releaseId?: string;
      expectedSourceDraftVersion?: number;
    };
    releaseId = typeof body.releaseId === "string" ? body.releaseId.trim() : "";
    if (typeof body.expectedSourceDraftVersion === "number") {
      expectedSourceDraftVersion = body.expectedSourceDraftVersion;
    }
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  if (!releaseId) {
    return NextResponse.json({ ok: false, error: "missing_releaseId" }, { status: 400 });
  }
  try {
    const live = await setLiveRelease(sb, {
      releaseId,
      userId: admin.userId,
      expectedSourceDraftVersion,
    });
    return NextResponse.json({
      ok: true as const,
      live,
      note: "SERVER_LIVE_SUCCESS_NE_DEVICE_INTRO_SUCCESS",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "set_live_failed";
    const status = (e as { status?: number }).status === 409 ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
