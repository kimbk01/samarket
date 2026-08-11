/**
 * GLOBAL default → Q&A default → TOPIC override.
 * Hidden fallback forbidden: every resolve names its source.
 */
import { isQnaCommunityContent } from "@/lib/community-points/reward-eligibility";
import type { BoardPointPolicy } from "@/lib/types/point-policy";

export type CommunityPolicyLayer = "global" | "qna" | "topic";

export type CommunityPolicyResolveSource = "topic_override" | "qna_default" | "global_default";

export const COMMUNITY_GLOBAL_BOARD_KEY = "general";
export const COMMUNITY_QNA_BOARD_KEY = "qna";

export type ResolvedCommunityPointPolicy = {
  policy: BoardPointPolicy;
  source: CommunityPolicyResolveSource;
  topicSlug: string;
  isQna: boolean;
};

export function communityPolicyLayerForBoardKey(boardKey: string): CommunityPolicyLayer {
  const key = String(boardKey ?? "").trim().toLowerCase();
  if (key === COMMUNITY_GLOBAL_BOARD_KEY) return "global";
  if (key === COMMUNITY_QNA_BOARD_KEY) return "qna";
  return "topic";
}

export function isTopicOverrideActive(policy: BoardPointPolicy | null | undefined): boolean {
  if (!policy || policy.isActive === false) return false;
  if (policy.inheritGlobal === true) return false;
  return communityPolicyLayerForBoardKey(policy.boardKey) === "topic";
}

export function resolveCommunityPointPolicy(input: {
  topicSlug?: string | null;
  isQuestion?: boolean;
  policies: BoardPointPolicy[];
}): ResolvedCommunityPointPolicy | null {
  const byKey = new Map(
    input.policies.map((p) => [String(p.boardKey ?? "").trim().toLowerCase(), p] as const)
  );
  const topicSlug = String(input.topicSlug ?? "").trim().toLowerCase();
  const isQna = isQnaCommunityContent({ isQuestion: input.isQuestion, topicSlug });

  const topicRow = topicSlug ? byKey.get(topicSlug) ?? null : null;
  if (isTopicOverrideActive(topicRow)) {
    return { policy: topicRow as BoardPointPolicy, source: "topic_override", topicSlug, isQna };
  }

  if (isQna) {
    const qna = byKey.get(COMMUNITY_QNA_BOARD_KEY);
    if (qna && qna.isActive !== false) {
      return { policy: qna, source: "qna_default", topicSlug, isQna };
    }
  }

  const global = byKey.get(COMMUNITY_GLOBAL_BOARD_KEY);
  if (!global) return null;
  return { policy: global, source: "global_default", topicSlug, isQna };
}

export function communityPolicyAdminMode(policy: BoardPointPolicy | null | undefined): "inherit" | "override" {
  if (!policy) return "inherit";
  if (isTopicOverrideActive(policy)) return "override";
  return "inherit";
}
