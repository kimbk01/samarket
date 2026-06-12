import type { MemberVisualConfig } from "@/lib/types/member-benefit";

/** 회원 유형별 프로필 액자·뱃지 시각 설정 (정책 DB와 독립·고정 UI 토큰) */
export const MEMBER_VISUAL_CONFIGS: MemberVisualConfig[] = [
  {
    memberType: "normal",
    frameType: "dark",
    badgeLabel: "",
    textClassName: "text-gray-800",
    accentType: "border-gray-300",
  },
  {
    memberType: "premium",
    frameType: "gold",
    badgeLabel: "특별회원",
    textClassName: "text-amber-900",
    accentType: "border-amber-400",
  },
  {
    memberType: "admin",
    frameType: "admin_special",
    badgeLabel: "관리자",
    textClassName: "text-indigo-800",
    accentType: "border-indigo-400",
  },
];

export function getMemberVisualConfig(
  memberType: "normal" | "premium" | "admin"
): MemberVisualConfig {
  return MEMBER_VISUAL_CONFIGS.find((c) => c.memberType === memberType) ?? MEMBER_VISUAL_CONFIGS[0];
}
