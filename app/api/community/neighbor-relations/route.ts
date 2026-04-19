import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLE_AUTHOR_ID = "00000000-0000-4000-8000-000000000001";

/** 관심이웃 여부 조회 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const target = req.nextUrl.searchParams.get("targetUserId")?.trim() ?? "";
  if (!target || target === auth.userId) {
    return NextResponse.json({ ok: false, error: "bad_target" }, { status: 400 });
  }
  if (process.env.NODE_ENV !== "production" && target === SAMPLE_AUTHOR_ID) {
    const state = (globalThis as {
      __samarketNeighborhoodDevSampleState?: {
        relations?: Map<string, { follows: Set<string>; blocks: Set<string> }>;
      };
    }).__samarketNeighborhoodDevSampleState;
    const rel = state?.relations?.get(auth.userId);
    return NextResponse.json({ ok: true, following: rel?.follows?.has(target) === true, fallback: "dev_samples" });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data: ex } = await sb
    .from("user_relationships")
    .select("id")
    .eq("user_id", auth.userId)
    .eq("target_user_id", target)
    .or("relation_type.eq.neighbor_follow,type.eq.neighbor_follow")
    .maybeSingle();

  return NextResponse.json({ ok: true, following: !!ex });
}

/** 관심이웃(neighbor_follow) 토글 — 친구 추가 없음 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let body: { targetUserId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const target = String(body.targetUserId ?? "").trim();
  if (!target || target === auth.userId) {
    return NextResponse.json({ ok: false, error: "bad_target" }, { status: 400 });
  }
  if (process.env.NODE_ENV !== "production" && target === SAMPLE_AUTHOR_ID) {
    const scope = globalThis as {
      __samarketNeighborhoodDevSampleState?: {
        relations?: Map<string, { follows: Set<string>; blocks: Set<string> }>;
      };
    };
    if (!scope.__samarketNeighborhoodDevSampleState) {
      scope.__samarketNeighborhoodDevSampleState = { relations: new Map() };
    }
    if (!scope.__samarketNeighborhoodDevSampleState.relations) {
      scope.__samarketNeighborhoodDevSampleState.relations = new Map();
    }
    const rel =
      scope.__samarketNeighborhoodDevSampleState.relations.get(auth.userId) ??
      { follows: new Set<string>(), blocks: new Set<string>() };
    if (rel.blocks.has(target)) {
      return NextResponse.json({ ok: false, error: "blocked_target" }, { status: 400 });
    }
    if (rel.follows.has(target)) {
      rel.follows.delete(target);
      scope.__samarketNeighborhoodDevSampleState.relations.set(auth.userId, rel);
      return NextResponse.json({ ok: true, following: false, fallback: "dev_samples" });
    }
    rel.follows.add(target);
    scope.__samarketNeighborhoodDevSampleState.relations.set(auth.userId, rel);
    return NextResponse.json({ ok: true, following: true, fallback: "dev_samples" });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data: bl } = await sb
    .from("user_relationships")
    .select("id")
    .eq("user_id", auth.userId)
    .eq("target_user_id", target)
    .or("relation_type.eq.blocked,type.eq.blocked")
    .maybeSingle();
  if (bl) {
    return NextResponse.json({ ok: false, error: "blocked_target" }, { status: 400 });
  }

  const { data: ex } = await sb
    .from("user_relationships")
    .select("id")
    .eq("user_id", auth.userId)
    .eq("target_user_id", target)
    .or("relation_type.eq.neighbor_follow,type.eq.neighbor_follow")
    .maybeSingle();

  if (ex) {
    await sb.from("user_relationships").delete().eq("id", (ex as { id: string }).id);
    return NextResponse.json({ ok: true, following: false });
  }

  const { error } = await sb.from("user_relationships").insert({
    user_id: auth.userId,
    target_user_id: target,
    type: "neighbor_follow",
    relation_type: "neighbor_follow",
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, following: true });
}
