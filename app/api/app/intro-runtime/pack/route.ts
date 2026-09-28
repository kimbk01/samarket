import { NextResponse } from "next/server";
import { loadLiveIntroPack } from "@/lib/intro-show/pack-builder";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  try {
    const pack = await loadLiveIntroPack(sb);
    if (!pack) return new NextResponse(null, { status: 204 });
    return NextResponse.json({ ok: true, pack });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "pack_failed" },
      { status: 500 },
    );
  }
}
