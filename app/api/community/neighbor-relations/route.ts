import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isBlockedEitherWay } from "@/lib/community-messenger/social-relations";
import { NEIGHBOR_FOLLOW_LIMIT } from "@/lib/community/neighbor-follow-contract";
import { countStoredNeighborFollows } from "@/lib/community/neighbor-follow-list.server";
import { requireRegistrationForAction } from "@/lib/auth/require-registration-for-action.server";
import { internalErrorResponse } from "@/lib/security/internal-error-response";

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
    .eq("type", "neighbor_follow")
    .maybeSingle();

  return NextResponse.json({ ok: true, following: !!ex });
}

/**
 * 관심이웃 추가·해제 — **상태 지정** (`{ targetUserId, following }`). 같은 상태면 그대로 200(멱등).
 * 토글을 없앤 이유: 한 화면 두 버튼이 서로 다른 상태를 보고 같은 요청을 보내면 반대 동작이 됐다(감사 E1).
 * 추가만: 상대 존재·탈퇴 확인 → 양방향 차단 거절 → 가입 확인 → 100명 상한(`NEIGHBOR_FOLLOW_LIMIT`).
 * 해제는 가입 없이(설계 2026-11-21 §4 C).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let body: { targetUserId?: string; following?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const target = String(body.targetUserId ?? "").trim();
  if (!target || target === auth.userId) {
    return NextResponse.json({ ok: false, error: "bad_target" }, { status: 400 });
  }
  if (typeof body.following !== "boolean") {
    return NextResponse.json({ ok: false, error: "following_required" }, { status: 400 });
  }
  const want = body.following;

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
    if (want && rel.blocks.has(target)) {
      return NextResponse.json({ ok: false, error: "blocked_target" }, { status: 400 });
    }
    if (want) rel.follows.add(target);
    else rel.follows.delete(target);
    scope.__samarketNeighborhoodDevSampleState.relations.set(auth.userId, rel);
    return NextResponse.json({ ok: true, following: want, fallback: "dev_samples" });
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
    .eq("type", "neighbor_follow")
    .maybeSingle();

  if (!want) {
    if (ex) {
      const { error } = await sb.from("user_relationships").delete().eq("id", (ex as { id: string }).id);
      if (error) return internalErrorResponse("save_failed", "[community/neighbor-relations POST remove]", error);
    }
    return NextResponse.json({ ok: true, following: false });
  }

  if (ex) return NextResponse.json({ ok: true, following: true });

  const { data: prof } = await sb
    .from("profiles")
    .select("id, status, deleted_at")
    .eq("id", target)
    .maybeSingle();
  const p = prof as { id?: string; status?: string | null; deleted_at?: string | null } | null;
  if (!p?.id || String(p.status ?? "").trim() === "deleted" || p.deleted_at) {
    return NextResponse.json({ ok: false, error: "target_unavailable" }, { status: 404 });
  }

  if (await isBlockedEitherWay(auth.userId, target)) {
    return NextResponse.json({ ok: false, error: "blocked_target" }, { status: 400 });
  }

  /** 섞인 경로(설계 2026-11-21 §4 C) — 새 행동 분기만 가입(전화 + 대표 주소) 확인, 거절·해제는 가입 없이 */
  const registrationGate = await requireRegistrationForAction(auth.userId);
  if (registrationGate) return registrationGate;

  const stored = await countStoredNeighborFollows(sb, auth.userId);
  if (stored === null) {
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 503 });
  }
  if (stored >= NEIGHBOR_FOLLOW_LIMIT) {
    return NextResponse.json(
      { ok: false, error: "neighbor_follow_limit", limit: NEIGHBOR_FOLLOW_LIMIT },
      { status: 409 },
    );
  }

  const { error } = await sb.from("user_relationships").insert({
    user_id: auth.userId,
    target_user_id: target,
    type: "neighbor_follow",
    relation_type: "neighbor_follow",
  });
  /** 같은 순간 두 번 추가 — 유일 인덱스(user_id,target_user_id,type) 충돌은 이미 추가된 상태 */
  if (error && (error as { code?: string }).code !== "23505") {
    return internalErrorResponse("save_failed", "[community/neighbor-relations POST]", error);
  }
  return NextResponse.json({ ok: true, following: true });
}
