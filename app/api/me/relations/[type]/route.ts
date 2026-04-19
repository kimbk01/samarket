import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RelationType = "favorite" | "hidden" | "blocked";

const RELATION_CONFIG: Record<RelationType, { table: string; column: string }> = {
  favorite: { table: "user_favorites", column: "favorite_user_id" },
  hidden: { table: "user_hides", column: "hidden_user_id" },
  blocked: { table: "user_blocks", column: "blocked_user_id" },
};

function getRelationType(raw: string): RelationType | null {
  if (raw === "favorite" || raw === "hidden" || raw === "blocked") return raw;
  return null;
}

function isMissingTableError(message: string, table: string): boolean {
  const lowered = message.toLowerCase();
  return lowered.includes(table.toLowerCase()) && lowered.includes("does not exist");
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ type: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { type: rawType } = await context.params;
  const type = getRelationType(String(rawType ?? "").trim());
  if (!type) {
    return NextResponse.json({ ok: false, error: "invalid_relation_type" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: true, items: [], source: "fallback" });
  }

  const { table, column } = RELATION_CONFIG[type];
  const { data, error } = await (sb.from(table) as any)
    .select(`id, ${column}, created_at`)
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error.message ?? "", table)) {
      return NextResponse.json({ ok: true, items: [], source: "missing_table" });
    }
    return NextResponse.json({ ok: false, error: error.message ?? "relation_fetch_failed" }, { status: 500 });
  }

  const relationRows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  const targetIds = relationRows
    .map((row) => String(row[column] ?? "").trim())
    .filter(Boolean);

  const profileMap = new Map<string, Record<string, unknown>>();
  if (targetIds.length > 0) {
    const { data: profiles } = await sb
      .from("profiles")
      .select("id, nickname, avatar_url, region_name")
      .in("id", targetIds);
    for (const row of (profiles ?? []) as Record<string, unknown>[]) {
      const id = String(row.id ?? "").trim();
      if (id) profileMap.set(id, row);
    }
  }

  const items = relationRows.map((row) => {
    const targetId = String(row[column] ?? "").trim();
    const profile = profileMap.get(targetId);
    return {
      id: String(row.id ?? ""),
      targetId,
      createdAt: String(row.created_at ?? ""),
      nickname: typeof profile?.nickname === "string" ? profile.nickname : null,
      avatarUrl: typeof profile?.avatar_url === "string" ? profile.avatar_url : null,
      regionName: typeof profile?.region_name === "string" ? profile.region_name : null,
    };
  });

  return NextResponse.json({ ok: true, items, source: "db" });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ type: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { type: rawType } = await context.params;
  const type = getRelationType(String(rawType ?? "").trim());
  if (!type) {
    return NextResponse.json({ ok: false, error: "invalid_relation_type" }, { status: 400 });
  }

  const relationId = req.nextUrl.searchParams.get("id")?.trim();
  if (!relationId) {
    return NextResponse.json({ ok: false, error: "missing_relation_id" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { table } = RELATION_CONFIG[type];
  const { error } = await sb.from(table).delete().eq("id", relationId).eq("user_id", auth.userId);
  if (error) {
    if (isMissingTableError(error.message ?? "", table)) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: error.message ?? "relation_delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
