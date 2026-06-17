import type { CommunityCommentDTO } from "@/lib/community-feed/types";
import type { NeighborhoodCommentNode } from "@/lib/neighborhood/types";

export function findCommentById(roots: NeighborhoodCommentNode[], id: string | null | undefined): NeighborhoodCommentNode | null {
  if (!id?.trim()) return null;
  const walk = (nodes: NeighborhoodCommentNode[]): NeighborhoodCommentNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children.length) {
        const d = walk(node.children);
        if (d) return d;
      }
    }
    return null;
  };
  return walk(roots);
}

function walkMap(
  nodes: NeighborhoodCommentNode[],
  id: string,
  mapFn: (n: NeighborhoodCommentNode) => NeighborhoodCommentNode
): NeighborhoodCommentNode[] {
  return nodes.map((n) => {
    if (n.id === id) return mapFn(n);
    if (n.children.length) {
      return { ...n, children: walkMap(n.children, id, mapFn) };
    }
    return n;
  });
}

export function updateCommentInTree(
  roots: NeighborhoodCommentNode[],
  id: string,
  patch: Partial<NeighborhoodCommentNode>
): NeighborhoodCommentNode[] {
  return walkMap(roots, id, (n) => ({ ...n, ...patch, children: n.children }));
}

/** `listCommunityPostComments` flat DTO → 필라이프 상세 댓글 트리 */
export function flatCommentsToNeighborhoodTree(flat: CommunityCommentDTO[]): NeighborhoodCommentNode[] {
  const nodes: NeighborhoodCommentNode[] = flat.map((r) => ({
    id: r.id,
    post_id: r.post_id,
    user_id: r.user_id,
    parent_id: r.parent_id,
    content: r.content,
    created_at: r.created_at,
    updated_at: r.updated_at,
    is_edited: r.is_edited,
    author_name: r.author_name,
    like_count: r.like_count,
    liked_by_viewer: r.liked_by_viewer,
    children: [],
  }));
  const hasAnyReply = nodes.some((n) => n.parent_id);
  if (!hasAnyReply) return nodes;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roots: NeighborhoodCommentNode[] = [];
  for (const n of nodes) {
    if (n.parent_id && byId.has(n.parent_id)) {
      byId.get(n.parent_id)!.children.push(n);
    } else {
      roots.push(n);
    }
  }
  return roots;
}
