import { NextResponse } from "next/server";
import { loadOpeningRuntimeManifest } from "@/lib/opening-show/runtime.server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }
  const loaded = await loadOpeningRuntimeManifest(sb);
  if (!loaded.ok) {
    return NextResponse.json(
      { ok: false, error: loaded.error },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (!loaded.live) {
    return NextResponse.json(
      { ok: true, live: false },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json(
    {
      ok: true,
      live: true,
      revisionId: loaded.manifest.revisionId,
      revisionNumber: loaded.manifest.revisionNumber,
      documentVersion: loaded.manifest.documentVersion,
      sceneDurationMs: loaded.manifest.sceneDurationMs,
      checksum: loaded.manifest.checksum,
      scenes: loaded.manifest.scenes,
      assets: loaded.manifest.assets,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
