import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { NEIGHBOR_FOLLOW_LIMIT } from "@/lib/community/neighbor-follow-contract";
import { requireRegistrationForAction } from "@/lib/auth/require-registration-for-action.server";
import { isUuidLikeString } from "@/lib/shared/uuid-string";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLE_AUTHOR_ID = "00000000-0000-4000-8000-000000000001";

/**
 * 관심이웃 추가·해제 — **상태 지정** (`{ targetUserId, following }`). 같은 상태면 그대로 200(멱등).
 * 토글을 없앤 이유: 한 화면 두 버튼이 서로 다른 상태를 보고 같은 요청을 보내면 반대 동작이 됐다(감사 E1).
 * 추가: 가입 확인 → DB 함수 `neighbor_follow_set_for` 1회(상대 존재·탈퇴 → 양방향 차단 → 100명 상한 → 추가를 두 회원 쌍·회원 잠금 안
 * 한 트랜잭션에서 — 동시 요청으로 상한을 넘던 결함 D4). 해제는 가입 없이 같은 함수(설계 2026-11-21 §4 C).
 * DB 오류는 성공으로 바꾸지 않고 503(D3). 대상 id 는 uuid 만(D5). 관계 조회는 `GET /api/community/user-relation`.
 * 설계: docs/audit/interest-neighbor-full-fix-design-2026-11-28.md §5-2
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
  if (!target || target === auth.userId || !isUuidLikeString(target)) {
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

  if (want) {
    /** 섞인 경로(설계 2026-11-21 §4 C) — 새 행동(추가)만 가입(전화 + 대표 주소) 확인, 해제는 가입 없이 */
    const registrationGate = await requireRegistrationForAction(auth.userId);
    if (registrationGate) return registrationGate;
  }

  const { data, error } = await sb.rpc("neighbor_follow_set_for", {
    p_user: auth.userId,
    p_target: target,
    p_follow: want,
    p_limit: NEIGHBOR_FOLLOW_LIMIT,
  });
  const r = (data ?? null) as { ok?: boolean; following?: boolean; count?: number; error?: string } | null;
  if (error || !r) {
    console.error("[community/neighbor-relations POST] rpc failed", error?.message ?? "empty");
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 503 });
  }
  if (!r.ok) {
    const code = String(r.error ?? "save_failed");
    /** 거절 코드·상태값은 예전 그대로(설계 v2 §5-2 · 검토 L4) */
    const status =
      code === "target_unavailable"
        ? 404
        : code === "neighbor_follow_limit"
          ? 409
          : code === "blocked_target" || code === "bad_target"
            ? 400
            : 503;
    return NextResponse.json(
      code === "neighbor_follow_limit" ? { ok: false, error: code, limit: NEIGHBOR_FOLLOW_LIMIT } : { ok: false, error: code },
      { status },
    );
  }
  return NextResponse.json({ ok: true, following: r.following === true, count: typeof r.count === "number" ? r.count : 0 });
}
