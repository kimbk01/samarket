/** 커뮤니티 글 메타 → 포인트 정책 board_key */
export function resolveCommunityBoardKey(input: {
  isQuestion?: boolean;
  topicSlug?: string | null;
  category?: string | null;
}): "general" | "qna" {
  if (input.isQuestion === true) return "qna";
  const topic = String(input.topicSlug ?? "").trim().toLowerCase();
  const category = String(input.category ?? "").trim().toLowerCase();
  if (topic === "question" || topic === "qna" || category === "question") return "qna";
  return "general";
}
