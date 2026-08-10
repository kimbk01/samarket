/** 커뮤니티 글 메타 → 포인트 정책 board_key */
export function resolveCommunityBoardKey(input: {
  isQuestion?: boolean;
  topicSlug?: string | null;
  category?: string | null;
}): "general" | "qna" {
  if (input.isQuestion === true) return "qna";
  const topic = String(input.topicSlug ?? "").trim().toLowerCase();
  if (topic === "question" || topic === "qna") return "qna";
  /** Legacy bridge only when topic_slug missing — category is not Topic identity */
  if (!topic) {
    const category = String(input.category ?? "").trim().toLowerCase();
    if (category === "question") return "qna";
  }
  return "general";
}
