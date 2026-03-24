/**
 * 24단계: 포인트 정책 유틸 (라벨, 보드 옵션)
 */

export const REWARD_TYPE_LABELS: Record<string, string> = {
  fixed: "고정 포인트",
  random: "확률형 포인트",
};

export const TARGET_TYPE_LABELS: Record<string, string> = {
  write: "글쓰기",
  comment: "댓글",
};

export const USER_TYPE_LABELS: Record<string, string> = {
  free: "비입금 회원",
  premium: "유료 회원",
};

export const BOARD_OPTIONS = [
  { key: "general", name: "자유게시판" },
  { key: "qna", name: "Q&A" },
  { key: "trade_tips", name: "거래 팁" },
];

export function getBoardName(boardKey: string): string {
  return BOARD_OPTIONS.find((b) => b.key === boardKey)?.name ?? boardKey;
}
