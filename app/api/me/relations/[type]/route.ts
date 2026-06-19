import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";
import {
  listBlockedByMeIds,
  listHiddenUserRelationshipRows,
  removeHiddenUserRelationshipById,
  unblockUserSocial,
} from "@/lib/community-messenger/social-relations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RelationType = "favorite" | "hidden" | "blocked";

const LEGACY_RELATION_CONFIG: Record<"favorite", { table: string; column: string }> = {
  favorite: { table: "user_favorites", column: "favorite_user_id" },
};

function getRelationType(raw: string): RelationType | null {
  if (raw === "favorite" || raw === "hidden" || raw === "blocked") return raw;
  return null;
}

function isMissingTableError(message: string, table?: string): boolean {
  const lowered = message.toLowerCase();
  if (table && !lowered.includes(table.toLowerCase())) return false;
  return (
    lowered.includes("does not exist") ||
    lowered.includes("schema cache") ||
    lowered.includes("could not find the table")
  );
}

type RelationListItem = {
  id: string;
  targetId: string;
  createdAt: string;
  nickname: string | null;
  username: string | null;
  avatarUrl: string | null;
  regionName: string | null;
};

async function fetchProfileMap(
  sb: NonNullable<ReturnType<typeof tryCreateSupabaseServiceClient>>,
  targetIds: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const profileMap = new Map<string, Record<string, unknown>>();
  if (targetIds.length === 0) return profileMap;

  const { data: profiles } = await sb
    .from("profiles")
    .select("id, display_name, nickname, username, avatar_url, region_name")
    .in("id", targetIds);

  for (const row of (profiles ?? []) as Record<string, unknown>[]) {
    const id = String(row.id ?? "").trim();
    if (id) profileMap.set(id, row);
  }
  return profileMap;
}

function mapProfilesToRelationItems(
  rows: Array<{ id: string; targetId: string; createdAt: string }>,
  profileMap: Map<string, Record<string, unknown>>
): RelationListItem[] {
  return rows.map((row) => {
    const profile = profileMap.get(row.targetId);
    const displayName = typeof profile?.display_name === "string" ? profile.display_name : null;
    const legacy = typeof profile?.nickname === "string" ? profile.nickname : null;
    const username = typeof profile?.username === "string" ? profile.username : null;
    const label = labelFromDisplayAndUsername(displayName ?? legacy, username).trim();
    return {
      id: row.id,
      targetId: row.targetId,
      createdAt: row.createdAt,
      nickname: label || legacy || null,
      username,
      avatarUrl: typeof profile?.avatar_url === "string" ? profile.avatar_url : null,
      regionName: typeof profile?.region_name === "string" ? profile.region_name : null,
    };
  });
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

  if (type === "blocked") {
    const targetIds = await listBlockedByMeIds(auth.userId);
    if (targetIds.length === 0) {
      return NextResponse.json({ ok: true, items: [], source: "user_social_relations" });
    }
    const { data: socialRows } = await (sb as any)
      .from("user_social_relations")
      .select("id, target_user_id, created_at")
      .eq("owner_user_id", auth.userId)
      .eq("relation_type", "blocked")
      .in("target_user_id", targetIds);
    const relationRows = ((socialRows ?? []) as Array<{
      id?: string;
      target_user_id?: string;
      created_at?: string;
    }>)
      .map((row) => ({
        id: String(row.id ?? row.target_user_id ?? "").trim(),
        targetId: String(row.target_user_id ?? "").trim(),
        createdAt: String(row.created_at ?? ""),
      }))
      .filter((row) => row.id && row.targetId);
    const profileMap = await fetchProfileMap(sb, targetIds);
    const items = mapProfilesToRelationItems(relationRows, profileMap);
    return NextResponse.json({ ok: true, items, source: "user_social_relations" });
  }

  if (type === "hidden") {
    const relationRows = await listHiddenUserRelationshipRows(auth.userId);
    const targetIds = relationRows.map((row) => row.targetUserId);
    const profileMap = await fetchProfileMap(sb, targetIds);
    const items = mapProfilesToRelationItems(
      relationRows.map((row) => ({
        id: row.id,
        targetId: row.targetUserId,
        createdAt: row.createdAt,
      })),
      profileMap
    );
    return NextResponse.json({ ok: true, items, source: "user_relationships" });
  }

  const { table, column } = LEGACY_RELATION_CONFIG.favorite;
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

  const relationRows = (Array.isArray(data) ? (data as Record<string, unknown>[]) : [])
    .map((row) => ({
      id: String(row.id ?? "").trim(),
      targetId: String(row[column] ?? "").trim(),
      createdAt: String(row.created_at ?? ""),
    }))
    .filter((row) => row.id && row.targetId);
  const targetIds = relationRows.map((row) => row.targetId);
  const profileMap = await fetchProfileMap(sb, targetIds);
  const items = mapProfilesToRelationItems(relationRows, profileMap);

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
  const targetUserId = req.nextUrl.searchParams.get("targetUserId")?.trim();

  if (type === "blocked") {
    const target = targetUserId || "";
    if (!target) {
      return NextResponse.json({ ok: false, error: "missing_target_user_id" }, { status: 400 });
    }
    const result = await unblockUserSocial(auth.userId, target);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error ?? "unblock_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (type === "hidden") {
    if (!relationId) {
      return NextResponse.json({ ok: false, error: "missing_relation_id" }, { status: 400 });
    }
    const result = await removeHiddenUserRelationshipById(auth.userId, relationId);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error ?? "hidden_remove_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (!relationId) {
    return NextResponse.json({ ok: false, error: "missing_relation_id" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { table } = LEGACY_RELATION_CONFIG.favorite;
  const { error } = await sb.from(table).delete().eq("id", relationId).eq("user_id", auth.userId);
  if (error) {
    if (isMissingTableError(error.message ?? "", table)) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: error.message ?? "relation_delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
