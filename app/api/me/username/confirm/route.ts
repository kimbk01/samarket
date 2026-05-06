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

function mapDbError(message: string): { status: number; error: string } {
  const m = (message ?? "").toLowerCase();
  if (m.includes("duplicate key") || m.includes("unique") || m.includes("profiles_username_lower_unique_idx")) {
    return { status: 409, error: "username_taken" };
  }
  if (m.includes("profiles_username_format_check")) {
    return { status: 400, error: "username_invalid_format" };
  }
  return { status: 500, error: message || "confirm_failed" };
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

  // 이미 확정된 계정은 수정 불가.
  const { data: current, error: curErr } = await sb
    .from("profiles")
    .select("id, username, username_confirmed")
    .eq("id", auth.userId)
    .maybeSingle();

  if (curErr) {
    return NextResponse.json({ ok: false, error: curErr.message }, { status: 500 });
  }
  const alreadyConfirmed = current && (current as any).username_confirmed === true;
  if (alreadyConfirmed) {
    return NextResponse.json({ ok: false, error: "username_already_confirmed" }, { status: 409 });
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("profiles")
    .update({
      username: normalized,
      username_confirmed: true,
      username_set_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", auth.userId)
    .eq("username_confirmed", false)
    .select("username")
    .maybeSingle();

  if (error) {
    const mapped = mapDbError(error.message ?? "confirm_failed");
    return NextResponse.json({ ok: false, error: mapped.error }, { status: mapped.status });
  }
  if (!data || typeof (data as any).username !== "string") {
    return NextResponse.json({ ok: false, error: "username_confirm_failed" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, username: String((data as any).username) });
}

