import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9_.]{2,18}[a-z0-9])$/;
const RESERVED = new Set([
  "admin",
  "administrator",
  "support",
  "owner",
  "system",
  "official",
  "staff",
  "root",
  "mod",
  "help",
  "dibay",
  "samarket",
]);

function normalizeUsername(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_service_role_required" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const raw = body as { username?: unknown };
  const normalized = normalizeUsername(raw.username);
  if (!normalized) {
    return NextResponse.json({ ok: false, error: "username_required" }, { status: 400 });
  }
  if (!USERNAME_RE.test(normalized)) {
    return NextResponse.json({ ok: false, error: "username_invalid_format" }, { status: 400 });
  }
  if (RESERVED.has(normalized)) {
    return NextResponse.json({ ok: false, error: "username_reserved" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("profiles")
    .select("id, username")
    .ilike("username", normalized)
    .limit(1);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const takenByOther =
    Array.isArray(data) && data.some((r) => String((r as any)?.id ?? "").trim() && String((r as any).id) !== auth.userId);

  return NextResponse.json({
    ok: true,
    available: !takenByOther,
    normalized,
  });
}

