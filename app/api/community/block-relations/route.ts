import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUserId,
  requireAuthenticatedUserIdStrict,
} from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { cleanupCommunityMessengerFriendGraphOnBlock } from "@/lib/community-messenger/service";
import {
  blockUserSocial,
  isBlockedByMe,
  unblockUserSocial,
} from "@/lib/community-messenger/social-relations";

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
 * 차단 시 같은 대상의 neighbor_follow 가 있으면 제거합니다.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const phone = await requirePhoneVerified(auth.userId);
  if (!phone.ok) return phone.response;

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

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const alreadyBlocked = await isBlockedByMe(auth.userId, target);
  if (alreadyBlocked) {
    const result = await unblockUserSocial(auth.userId, target);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error ?? "unblock_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, blocked: false });
  }

  const { data: fol } = await sb
    .from("user_relationships")
    .select("id")
    .eq("user_id", auth.userId)
    .eq("target_user_id", target)
    .or("relation_type.eq.neighbor_follow,type.eq.neighbor_follow")
    .maybeSingle();
  if (fol?.id) {
    await sb.from("user_relationships").delete().eq("id", (fol as { id: string }).id);
  }

  const result = await blockUserSocial(auth.userId, target);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? "block_failed" }, { status: 500 });
  }

  const cleanup = await cleanupCommunityMessengerFriendGraphOnBlock(auth.userId, target);
  if (!cleanup.ok) {
    console.error("[community/block-relations] community messenger friend graph cleanup failed", cleanup.error);
  }

  return NextResponse.json({ ok: true, blocked: true });
}
