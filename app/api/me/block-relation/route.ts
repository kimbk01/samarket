import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { isBlockedEitherWay } from "@/lib/community-messenger/social-relations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET ?otherUserId=uuid
 * 양방향 차단 여부 — SSOT `user_social_relations` + legacy fallback
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const otherUserId = req.nextUrl.searchParams.get("otherUserId")?.trim() ?? "";
  if (!otherUserId) {
    return NextResponse.json(
      { ok: false, error: "other_user_id_required", code: "other_user_id_required" },
      { status: 400 }
    );
  }

  const isBlocked = await isBlockedEitherWay(auth.userId, otherUserId);
  return NextResponse.json({ ok: true, isBlocked });
}
