import { NextRequest } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { listNeighborhoodComments } from "@/lib/neighborhood/queries";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import { jsonError, jsonOk } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export { POST } from "../../../../community/posts/[postId]/comments/route";

const CANONICAL_CACHE_TTL_MS = 30_000;
const canonicalPostIdCache = new Map<string, { canonical: string | null; expiresAt: number }>();

async function resolveCanonicalPostIdCached(raw: string): Promise<string | null> {
  const now = Date.now();
  const hit = canonicalPostIdCache.get(raw);
  if (hit && hit.expiresAt > now) return hit.canonical;
  const canonical = await resolveCanonicalCommunityPostId(raw);
  canonicalPostIdCache.set(raw, { canonical, expiresAt: now + CANONICAL_CACHE_TTL_MS });
  return canonical;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return jsonError("postId가 필요합니다.", 400);

  const [viewerUserId, canonicalPostId] = await Promise.all([
    getOptionalAuthenticatedUserId(),
    resolveCanonicalPostIdCached(raw),
  ]);
  if (!canonicalPostId) return jsonError("not_found", 404);

  const tree = await listNeighborhoodComments(canonicalPostId, viewerUserId);
  return jsonOk({
    tree,
  });
}
