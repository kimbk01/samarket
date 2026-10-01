import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { launchIntroAdminSnapshot } from "@/lib/launch-intro/admin-snapshot";
import { setLaunchIntroLiveState, type LaunchIntroStateAction } from "@/lib/launch-intro/server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: readonly LaunchIntroStateAction[] = ["pause", "resume", "unpublish", "reactivate"];

/** LIVE STATE MACHINE. Body: { action, publicationId? } — rejected transitions return 409. */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  let body: { action?: unknown; publicationId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const action = body.action as LaunchIntroStateAction;
  if (!ACTIONS.includes(action)) return NextResponse.json({ ok: false, error: "action_invalid" }, { status: 400 });
  const res = await setLaunchIntroLiveState(sb, {
    action,
    publicationId: typeof body.publicationId === "string" ? body.publicationId : null,
    actor: admin.userId ?? null,
  });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status ?? 500 });
  const snap = await launchIntroAdminSnapshot(sb);
  if (!snap.ok) return NextResponse.json({ ok: false, error: snap.error }, { status: 500 });
  return NextResponse.json(snap);
}
