/**
 * 커뮤니티 포인트 내역 표시 라벨 (설계 §C-13) — 원장 유형·종류를 한국어로. Client-safe.
 */

export const COMMUNITY_POINT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "전체 유형" },
  { value: "community_reward", label: "커뮤니티 보상" },
  { value: "community_reclaim", label: "보상 회수" },
  { value: "promotion_order", label: "게시글 홍보 (차감·환급)" },
  { value: "admin_manual", label: "관리자 지급·회수" },
];

const RELATED: Record<string, string> = {
  community_reward: "커뮤니티 보상",
  community_reclaim: "보상 회수",
  promotion_order: "게시글 홍보",
  admin_manual: "관리자",
};

const ENTRY: Record<string, string> = {
  reward: "지급",
  reverse: "회수",
  spend: "차감",
  refund: "환급",
  admin_credit: "지급",
  admin_debit: "회수",
  admin_adjust: "조정",
  charge: "충전",
  expire: "소멸",
};

export function communityPointTypeLabel(relatedType: string | null | undefined, entryType: string | null | undefined): string {
  const r = RELATED[String(relatedType ?? "")] ?? "기타";
  const e = ENTRY[String(entryType ?? "")];
  return e ? `${r} ${e}` : r;
}
