import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { applyOsEntryDraftToLive, loadOsEntryAdminSnapshot } from "@/lib/os-entry/db";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** SERVICE APPLY: DRAFT → LIVE atomic revision bump. */
export async function POST() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const applied = await applyOsEntryDraftToLive(sb, admin.userId);
  if (!applied.ok) {
    const status = applied.error === "incomplete_bundle" ? 400 : 500;
    return NextResponse.json({ ok: false, error: applied.error }, { status });
  }

  const snap = await loadOsEntryAdminSnapshot(sb);
  return NextResponse.json({
    ok: true as const,
    live: applied.live,
    draft: snap.ok ? snap.snapshot.draft : null,
    revision: applied.live.revision,
  });
}
