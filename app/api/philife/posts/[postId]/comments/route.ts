import { NextRequest } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import {
  getNeighborhoodPostDetail,
  listNeighborhoodComments,
} from "@/lib/neighborhood/queries";
import type { NeighborhoodCommentNode } from "@/lib/neighborhood/types";
import { jsonError, jsonOk } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export { POST } from "../../../../community/posts/[postId]/comments/route";

function flattenNeighborhoodComments(
  nodes: NeighborhoodCommentNode[]
): Omit<NeighborhoodCommentNode, "children">[] {
  const flat: Omit<NeighborhoodCommentNode, "children">[] = [];
  const walk = (items: NeighborhoodCommentNode[]) => {
    for (const item of items) {
      flat.push({
        id: item.id,
        post_id: item.post_id,
        user_id: item.user_id,
        parent_id: item.parent_id,
        content: item.content,
        created_at: item.created_at,
        author_name: item.author_name,
        like_count: item.like_count,
        liked_by_viewer: item.liked_by_viewer,
        updated_at: item.updated_at,
        is_edited: item.is_edited,
      });
      if (item.children.length > 0) walk(item.children);
    }
  };
  walk(nodes);
  return flat;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return jsonError("postId가 필요합니다.", 400);

  const viewerUserId = await getOptionalAuthenticatedUserId();
  const post = await getNeighborhoodPostDetail(raw, { viewerUserId });
  if (!post) return jsonError("not_found", 404);

  const tree = await listNeighborhoodComments(post.id, viewerUserId);
  return jsonOk({
    comments: flattenNeighborhoodComments(tree),
    tree,
  });
}
