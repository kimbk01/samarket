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
