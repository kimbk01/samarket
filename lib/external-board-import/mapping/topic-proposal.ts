/**
 * External taxonomy → DIBAY topic proposal only.
 * Never auto-creates community_topics.
 */
export type TopicProposalStatus = "matched" | "propose" | "none";

export type TopicProposal = {
  status: TopicProposalStatus;
  recommendedHint: string | null;
  matchedTopicId: string | null;
  matchedTopicName: string | null;
  proposalLabel: string | null;
};

export function buildExternalTopicProposal(input: {
  recommendedTopicHint: string | null | undefined;
  sourceCategory?: string | null;
  liveTopics: Array<{ id: string; name: string; slug: string; name_en?: string | null }>;
}): TopicProposal {
  const hint = String(input.recommendedTopicHint || input.sourceCategory || "")
    .trim()
    .toLowerCase();
  if (!hint) {
    return {
      status: "none",
      recommendedHint: null,
      matchedTopicId: null,
      matchedTopicName: null,
      proposalLabel: null,
    };
  }
  const matched = input.liveTopics.find((t) => {
    const name = String(t.name || "").toLowerCase();
    const slug = String(t.slug || "").toLowerCase();
    const en = String(t.name_en || "").toLowerCase();
    return name.includes(hint) || slug.includes(hint) || en.includes(hint) || hint.includes(slug);
  });
  if (matched) {
    return {
      status: "matched",
      recommendedHint: hint,
      matchedTopicId: matched.id,
      matchedTopicName: matched.name,
      proposalLabel: null,
    };
  }
  return {
    status: "propose",
    recommendedHint: hint,
    matchedTopicId: null,
    matchedTopicName: null,
    proposalLabel: `새 DIBAY 주제 후보: ${input.recommendedTopicHint || input.sourceCategory}`,
  };
}
