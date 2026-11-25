/**
 * Neighborhood feed list merge — preserve row refs only when projection-equal.
 * CONTRACT: every server field is a mutable projection (author_name · counts · topic skin · images · title …) —
 * must NOT reuse prev row when any of them differ (Identity SSOT / cache convergence).
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

/**
 * 서버가 준 칸 전부를 비교한다 (2026-11-25 · 감사 lounge-share-thumbnail §1-7).
 *
 * 이전에는 좋아요·댓글·조회·작성자·본문만 비교해, 어드민이 주제 목록 모양(`feed_list_skin`)을 바꾸거나
 * 사진·제목·주제 이름이 바뀌어도 「같은 글」로 보고 저장본(최대 7일)을 계속 그렸다
 * — 「질문있어요」 썸네일 숨김 해제 뒤에도 목록에 썸네일이 안 나온 원인.
 * 칸을 골라 적으면 새 칸이 생길 때마다 같은 결함이 다시 생기므로 칸 목록을 두지 않는다.
 */
function sameFieldValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function isSameNeighborhoodFeedRow(
  a: NeighborhoodFeedPostDTO,
  b: NeighborhoodFeedPostDTO
): boolean {
  if (a === b) return true;
  if (a.id !== b.id) return false;
  const ax = a as unknown as Record<string, unknown>;
  const bx = b as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(ax), ...Object.keys(bx)]);
  for (const k of keys) {
    if (!sameFieldValue(ax[k], bx[k])) return false;
  }
  return true;
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
