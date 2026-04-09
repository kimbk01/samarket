import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const dynamic = "force-dynamic";

const FALLBACK_VERSION = "1.0.0";

function isMissingTableError(message: string): boolean {
  const lowered = message.toLowerCase();
  return lowered.includes("app_meta") && lowered.includes("does not exist");
}

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({
      ok: true,
      version: FALLBACK_VERSION,
      build: null,
      source: "fallback",
    });
  }

  const { data, error } = await sb
    .from("app_meta")
    .select("key, value")
    .in("key", ["app_version", "app_build"]);

  if (error) {
    if (isMissingTableError(error.message ?? "")) {
      return NextResponse.json({
        ok: true,
        version: FALLBACK_VERSION,
        build: null,
        source: "missing_table",
      });
    }
    return NextResponse.json({ ok: false, error: error.message ?? "version_fetch_failed" }, { status: 500 });
  }

  const meta = new Map<string, string>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const key = String(row.key ?? "").trim();
    if (!key) continue;
    meta.set(key, String(row.value ?? "").trim());
  }

  return NextResponse.json({
    ok: true,
    version: meta.get("app_version") || FALLBACK_VERSION,
    build: meta.get("app_build") || null,
    source: "db",
  });
}
