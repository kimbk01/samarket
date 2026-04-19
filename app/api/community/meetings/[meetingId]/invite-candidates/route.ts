import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ meetingId: string }>;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ ok: true, candidates: [] });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data: meeting } = await sb
    .from("meetings")
    .select("id, created_by, host_user_id")
    .eq("id", id)
    .maybeSingle();
  const m = meeting as { id?: string; created_by?: string | null; host_user_id?: string | null } | null;
  if (!m?.id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const hostUserId = String(m.host_user_id ?? m.created_by ?? "").trim();
  const { data: coHost } = await sb
    .from("meeting_members")
    .select("id")
    .eq("meeting_id", id)
    .eq("user_id", auth.userId)
    .eq("status", "joined")
    .eq("role", "co_host")
    .maybeSingle();
  if (hostUserId !== auth.userId && !(coHost as { id?: string } | null)?.id) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const [{ data: members }, { data: bans }, { data: profiles }, { data: testUsers }] = await Promise.all([
    sb.from("meeting_members").select("user_id").eq("meeting_id", id),
    sb.from("meeting_member_bans").select("user_id").eq("meeting_id", id).is("released_at", null),
    sb
      .from("profiles")
      .select("id, nickname, username, region_name")
      .or(`nickname.ilike.%${query}%,username.ilike.%${query}%`)
      .limit(8),
    sb
      .from("test_users")
      .select("id, display_name, username")
      .or(`display_name.ilike.%${query}%,username.ilike.%${query}%`)
      .limit(8),
  ]);

  const [{ data: hostProfile }, { data: neighborRows }] = await Promise.all([
    sb.from("profiles").select("region_name").eq("id", hostUserId).maybeSingle(),
    sb
      .from("user_relationships")
      .select("target_user_id")
      .eq("user_id", hostUserId)
      .or("relation_type.eq.neighbor_follow,type.eq.neighbor_follow"),
  ]);

  const excluded = new Set<string>([
    auth.userId,
    hostUserId,
    ...((members ?? []) as Array<{ user_id?: string | null }>).map((row) => String(row.user_id ?? "").trim()).filter(Boolean),
    ...((bans ?? []) as Array<{ user_id?: string | null }>).map((row) => String(row.user_id ?? "").trim()).filter(Boolean),
  ]);
  const hostRegion = String((hostProfile as { region_name?: string | null } | null)?.region_name ?? "").trim().toLowerCase();
  const neighborFollowIds = new Set(
    ((neighborRows ?? []) as Array<{ target_user_id?: string | null }>)
      .map((row) => String(row.target_user_id ?? "").trim())
      .filter(Boolean)
  );

  const seen = new Set<string>();
  const candidates: Array<{
    userId: string;
    label: string;
    secondary: string;
    sameRegion: boolean;
    neighborFollow: boolean;
    score: number;
  }> = [];

  for (const row of (profiles ?? []) as Array<{ id?: string; nickname?: string | null; username?: string | null; region_name?: string | null }>) {
    const userId = String(row.id ?? "").trim();
    if (!userId || excluded.has(userId) || seen.has(userId)) continue;
    seen.add(userId);
    const label = String(row.nickname ?? row.username ?? userId).trim() || userId;
    const secondary = String(row.username ?? userId).trim() || userId;
    const sameRegion = !!hostRegion && String(row.region_name ?? "").trim().toLowerCase() === hostRegion;
    const neighborFollow = neighborFollowIds.has(userId);
    const startsWithQuery =
      label.toLowerCase().startsWith(query.toLowerCase()) || secondary.toLowerCase().startsWith(query.toLowerCase());
    candidates.push({
      userId,
      label,
      secondary,
      sameRegion,
      neighborFollow,
      score: (neighborFollow ? 100 : 0) + (sameRegion ? 10 : 0) + (startsWithQuery ? 1 : 0),
    });
  }

  for (const row of (testUsers ?? []) as Array<{ id?: string; display_name?: string | null; username?: string | null }>) {
    const userId = String(row.id ?? "").trim();
    if (!userId || excluded.has(userId) || seen.has(userId)) continue;
    seen.add(userId);
    const label = String(row.display_name ?? row.username ?? userId).trim() || userId;
    const secondary = String(row.username ?? userId).trim() || userId;
    const neighborFollow = neighborFollowIds.has(userId);
    const startsWithQuery =
      label.toLowerCase().startsWith(query.toLowerCase()) || secondary.toLowerCase().startsWith(query.toLowerCase());
    candidates.push({
      userId,
      label,
      secondary,
      sameRegion: false,
      neighborFollow,
      score: (neighborFollow ? 100 : 0) + (startsWithQuery ? 1 : 0),
    });
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.label.localeCompare(b.label, "ko");
  });

  return NextResponse.json({
    ok: true,
    candidates: candidates.slice(0, 8).map(({ score: _score, ...candidate }) => candidate),
  });
}
