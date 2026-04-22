import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";
import type { CommunityCommentDTO } from "@/lib/community-feed/types";
import type { NeighborhoodCommentNode } from "@/lib/neighborhood/types";
import { philifePostCommentsUrl } from "@domain/philife/api";

export type CommunityPostCommentsJson = {
  ok?: boolean;
  comments?: CommunityCommentDTO[];
  tree?: NeighborhoodCommentNode[];
  error?: string;
};

export type CommunityPostCommentsResult = {
  status: number;
  json: CommunityPostCommentsJson;
};

const TTL_MS = 8_000;
const cacheByPostId = new Map<string, { expiresAt: number; value: CommunityPostCommentsResult }>();

function commentsFlightKey(postId: string): string {
  return `community:post:${postId}:comments`;
}

export function invalidateCommunityPostCommentsDeduped(postId: string): void {
  const pid = String(postId ?? "").trim();
  if (!pid) return;
  cacheByPostId.delete(pid);
  forgetSingleFlight(commentsFlightKey(pid));
}

/**
 * 커뮤니티 상세 댓글 GET — 상세/복귀/중복 마운트가 겹쳐도 한 갈래로 합친다.
 */
export function fetchCommunityPostCommentsDeduped(
  postId: string,
  opts?: { force?: boolean }
): Promise<CommunityPostCommentsResult> {
  const pid = String(postId ?? "").trim();
  if (!pid) {
    return Promise.resolve({
      status: 400,
      json: { ok: false, comments: [], tree: [], error: "post_id_required" },
    });
  }
  if (opts?.force) {
    invalidateCommunityPostCommentsDeduped(pid);
  } else {
    const hit = cacheByPostId.get(pid);
    if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.value);
  }

  const key = commentsFlightKey(pid);
  return runSingleFlight(key, async (): Promise<CommunityPostCommentsResult> => {
    const hit = cacheByPostId.get(pid);
    if (!opts?.force && hit && hit.expiresAt > Date.now()) {
      return hit.value;
    }
    const res = await fetch(philifePostCommentsUrl(pid), { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as CommunityPostCommentsJson;
    const result: CommunityPostCommentsResult = { status: res.status, json };
    if (res.ok && json.ok) {
      cacheByPostId.set(pid, {
        value: result,
        expiresAt: Date.now() + TTL_MS,
      });
    }
    return result;
  });
}
