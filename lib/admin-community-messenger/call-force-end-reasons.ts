export const COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS = [
  { code: "policy_violation", label: "운영 정책 위반" },
  { code: "abuse_report", label: "신고 누적/악용 의심" },
  { code: "spam_or_ad", label: "스팸/광고성 통화" },
  { code: "safety_risk", label: "안전 위험 대응" },
  { code: "user_request", label: "이용자 요청 처리" },
  { code: "other", label: "기타 운영 판단" },
] as const;

export type CommunityMessengerCallForceEndReasonCode =
  (typeof COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS)[number]["code"];

export function isCommunityMessengerCallForceEndReasonCode(
  value: unknown
): value is CommunityMessengerCallForceEndReasonCode {
  return COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS.some((item) => item.code === value);
}

export function getCommunityMessengerCallForceEndReasonLabel(value: unknown): string {
  return COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS.find((item) => item.code === value)?.label ?? "사유 미확인";
}
