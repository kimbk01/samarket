import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const dynamic = "force-dynamic";

function isMissingTableError(message: string): boolean {
  const lowered = message.toLowerCase();
  return lowered.includes("app_notices") && lowered.includes("does not exist");
}

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: true, notices: [], source: "fallback" });
  }

  const { data, error } = await sb
    .from("app_notices")
    .select("id, title, body, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    if (isMissingTableError(error.message ?? "")) {
      return NextResponse.json({ ok: true, notices: [], source: "missing_table" });
    }
    return NextResponse.json({ ok: false, error: error.message ?? "notices_fetch_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    notices: (data ?? []).map((row) => ({
      id: String(row.id ?? ""),
      title: String(row.title ?? ""),
      body: String(row.body ?? ""),
      createdAt: String(row.created_at ?? ""),
    })),
    source: "db",
  });
}
