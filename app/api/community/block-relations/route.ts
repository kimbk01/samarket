import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUserId,
  requireAuthenticatedUserIdStrict,
} from "@/lib/auth/api-session";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { cleanupCommunityMessengerFriendGraphOnBlock } from "@/lib/community-messenger/service";
import {
  blockUserSocial,
  isBlockedByMe,
  unblockUserSocial,
} from "@/lib/community-messenger/social-relations";
import {
  hideDirectRoomsOnBlockForViewer,
  restoreDirectRoomsOnUnblockForViewer,
} from "@/lib/community-messenger/participant-block-hide";
import { terminateDirectCallsOnBlockBestEffort } from "@/lib/community-messenger/block-call-termination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLE_AUTHOR_ID = "00000000-0000-4000-8000-000000000001";

/** 차단 여부 조회 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;

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
    return NextResponse.json({ ok: true, blocked: rel?.blocks?.has(target) === true, fallback: "dev_samples" });
  }

  const blocked = await isBlockedByMe(auth.userId, target);
  return NextResponse.json({ ok: true, blocked });
}

/**
 * 차단 토글 — `user_social_relations` + legacy `user_relationships`
 * 차단 시 양방향 관심이웃(neighbor_follow) 삭제는 공통 `blockUserSocial` 이 한다(관심이웃 설계 C).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;

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
      rel.blocks.delete(target);
      scope.__samarketNeighborhoodDevSampleState.relations.set(auth.userId, rel);
      return NextResponse.json({ ok: true, blocked: false, fallback: "dev_samples" });
    }
    rel.follows.delete(target);
    rel.blocks.add(target);
    scope.__samarketNeighborhoodDevSampleState.relations.set(auth.userId, rel);
    return NextResponse.json({ ok: true, blocked: true, fallback: "dev_samples" });
  }

  try {
    getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const alreadyBlocked = await isBlockedByMe(auth.userId, target);
  if (alreadyBlocked) {
    const result = await unblockUserSocial(auth.userId, target);
    if (!result.ok) {
      /** 재감사 2026-11-27: DB 원문은 로그로만, 응답은 코드 */
      if (result.error) console.error("[community/block-relations] unblock failed", result.error);
      return NextResponse.json({ ok: false, error: "unblock_failed", code: "unblock_failed" }, { status: 500 });
    }
    await restoreDirectRoomsOnUnblockForViewer(auth.userId, target);
    return NextResponse.json({ ok: true, blocked: false });
  }

  const result = await blockUserSocial(auth.userId, target);
  if (!result.ok) {
    /** 재감사 2026-11-27: DB 원문은 로그로만, 응답은 코드 */
    if (result.error) console.error("[community/block-relations] block failed", result.error);
    return NextResponse.json({ ok: false, error: "block_failed", code: "block_failed" }, { status: 500 });
  }

  const cleanup = await cleanupCommunityMessengerFriendGraphOnBlock(auth.userId, target);
  if (!cleanup.ok) {
    console.error("[community/block-relations] community messenger friend graph cleanup failed", cleanup.error);
  }

  await hideDirectRoomsOnBlockForViewer({
    viewerUserId: auth.userId,
    peerUserId: target,
  });

  /** 메신저 차단 경로(relations/block)와 동일 정책 — pair 일반 DM 의 ringing/active 통화 종료, 실패해도 차단은 성공 */
  await terminateDirectCallsOnBlockBestEffort({
    blockerUserId: auth.userId,
    blockedUserId: target,
    logTag: "community/block-relations",
  });

  return NextResponse.json({ ok: true, blocked: true });
}
