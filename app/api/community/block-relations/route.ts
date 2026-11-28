import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
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
import { isUuidLikeString } from "@/lib/shared/uuid-string";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLE_AUTHOR_ID = "00000000-0000-4000-8000-000000000001";

/**
 * 차단·차단 해제 — **상태 지정** `{ targetUserId, blocked }` (같은 상태면 그대로 200). `user_social_relations` + legacy `user_relationships`.
 * 예전 토글은 한 화면 두 버튼이 다른 값을 보면 반대 동작이 됐다(관심이웃 E1 과 같은 구조 — 설계 v2 §5-2).
 * 옛 요청(`blocked` 없음 — 열린 탭·재시작 안 한 앱)은 이번 배포 동안만 토글로 받고 로그를 남긴다 → 다음 배포에서 400.
 * 차단 시 양방향 관심이웃 삭제는 DB 트리거(`trg_usr_blocked_clears_neighbor_follow`)가 한다.
 * 차단 때 통화 종료·방 숨김, 해제 때 방 복구의 조건·순서는 바꾸지 않는다(통화 규정).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;

  let body: { targetUserId?: string; blocked?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const target = String(body.targetUserId ?? "").trim();
  const wantBlocked = typeof body.blocked === "boolean" ? body.blocked : null;
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
    const devDesired = wantBlocked ?? !rel.blocks.has(target);
    if (!devDesired) {
      rel.blocks.delete(target);
      scope.__samarketNeighborhoodDevSampleState.relations.set(auth.userId, rel);
      return NextResponse.json({ ok: true, blocked: false, fallback: "dev_samples" });
    }
    rel.follows.delete(target);
    rel.blocks.add(target);
    scope.__samarketNeighborhoodDevSampleState.relations.set(auth.userId, rel);
    return NextResponse.json({ ok: true, blocked: true, fallback: "dev_samples" });
  }

  if (!target || target === auth.userId || !isUuidLikeString(target)) {
    return NextResponse.json({ ok: false, error: "bad_target" }, { status: 400 });
  }
  try {
    getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const alreadyBlocked = await isBlockedByMe(auth.userId, target);
  if (wantBlocked === null) {
    console.info("[community/block-relations] legacy_toggle_request", { target });
  }
  const desired = wantBlocked ?? !alreadyBlocked;
  if (desired === alreadyBlocked) {
    return NextResponse.json({ ok: true, blocked: desired });
  }
  if (!desired) {
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
