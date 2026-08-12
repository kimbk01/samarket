/**
 * Neighborhood feed list merge — preserve row refs only when projection-equal.
 * CONTRACT: author_name / engagement counts are mutable server projections —
 * must NOT reuse prev row when they differ (Identity SSOT / cache convergence).
 */

import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";

export function mergeNeighborhoodFeedById(
  prev: NeighborhoodFeedPostDTO[],
  incoming: NeighborhoodFeedPostDTO[],
  append: boolean
): NeighborhoodFeedPostDTO[] {
  if (!append) {
    const seen = new Set<string>();
    const out: NeighborhoodFeedPostDTO[] = [];
    for (const p of incoming) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out;
  }
  const seen = new Set(prev.map((p) => p.id));
  const out = [...prev];
  for (const p of incoming) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

export function dedupeNeighborhoodFeedById(list: NeighborhoodFeedPostDTO[]): NeighborhoodFeedPostDTO[] {
  return mergeNeighborhoodFeedById([], list, false);
}

export function isSameNeighborhoodFeedRow(
  a: NeighborhoodFeedPostDTO,
  b: NeighborhoodFeedPostDTO
): boolean {
  const ax = a as NeighborhoodFeedPostDTO & {
    updated_at?: string;
    created_at?: string;
    content?: string;
  };
  const bx = b as NeighborhoodFeedPostDTO & {
    updated_at?: string;
    created_at?: string;
    content?: string;
  };
  return (
    ax.id === bx.id &&
    (ax.updated_at ?? "") === (bx.updated_at ?? "") &&
    (ax.created_at ?? "") === (bx.created_at ?? "") &&
    (ax.content ?? "") === (bx.content ?? "") &&
    (ax.author_name ?? "") === (bx.author_name ?? "") &&
    (ax.author_id ?? "") === (bx.author_id ?? "") &&
    Number(ax.like_count ?? 0) === Number(bx.like_count ?? 0) &&
    Number(ax.comment_count ?? 0) === Number(bx.comment_count ?? 0) &&
    Number(ax.view_count ?? 0) === Number(bx.view_count ?? 0)
  );
}

export function isSameNeighborhoodFeedRows(
  prev: NeighborhoodFeedPostDTO[],
  next: NeighborhoodFeedPostDTO[]
): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i];
    const b = next[i];
    if (!a || !b) return false;
    if (!isSameNeighborhoodFeedRow(a, b)) return false;
  }
  return true;
}

/**
 * Network/cache apply — reuse prev row refs only when projection-equal.
 * Server incoming wins for identity/engagement deltas.
 */
export function patchNeighborhoodFeedRows(
  prev: NeighborhoodFeedPostDTO[],
  incoming: NeighborhoodFeedPostDTO[]
): NeighborhoodFeedPostDTO[] {
  const deduped = mergeNeighborhoodFeedById([], incoming, false);
  if (isSameNeighborhoodFeedRows(prev, deduped)) return prev;
  const prevById = new Map(prev.map((p) => [p.id, p]));
  let reused = 0;
  const out = deduped.map((row) => {
    const old = prevById.get(row.id);
    if (old && isSameNeighborhoodFeedRow(old, row)) {
      reused += 1;
      return old;
    }
    return row;
  });
  if (reused === out.length && out.length === prev.length) {
    const sameOrder = out.every((row, i) => row === prev[i]);
    if (sameOrder) return prev;
  }
  return out;
}
