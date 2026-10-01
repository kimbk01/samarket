import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { launchIntroAdminSnapshot } from "@/lib/launch-intro/admin-snapshot";
import { publishLaunchIntroDraft } from "@/lib/launch-intro/server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PUBLISH = immutable publication + Live pointer. Body: { draftId, version, eligibility? } (schedule, P5) */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  let body: { draftId?: unknown; version?: unknown; eligibility?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.draftId !== "string" || typeof body.version !== "number") {
    return NextResponse.json({ ok: false, error: "draft_required" }, { status: 400 });
  }
  const res = await publishLaunchIntroDraft(sb, {
    draftId: body.draftId,
    expectedVersion: body.version,
    eligibility: body.eligibility ?? null,
    actor: admin.userId ?? null,
  });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status ?? 500 });
  const snap = await launchIntroAdminSnapshot(sb);
  if (!snap.ok) return NextResponse.json({ ok: false, error: snap.error }, { status: 500 });
  return NextResponse.json(snap);
}
