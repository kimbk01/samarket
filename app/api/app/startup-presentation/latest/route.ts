import { NextResponse } from "next/server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { loadR15CurrentGeneration } from "@/lib/startup-presentation/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json(
      { ok: true as const, manifest: null },
      { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } }
    );
  }
  const current = await loadR15CurrentGeneration(sb);
  if (!current.ok) {
    return NextResponse.json(
      { ok: true as const, manifest: null },
      { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } }
    );
  }
  return NextResponse.json(
    { ok: true as const, manifest: current.manifest },
    { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } }
  );
}
