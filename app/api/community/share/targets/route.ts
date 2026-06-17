import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { listCommunityShareTargets } from "@/lib/community/share/list-community-share-targets";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community:share-targets:${getRateLimitKey(req, auth.userId)}`,
    limit: 60,
    windowMs: 60_000,
    message: "요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_share_targets_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { recent, friends } = await listCommunityShareTargets(auth.userId);
  return NextResponse.json({ ok: true, recent, friends });
}
