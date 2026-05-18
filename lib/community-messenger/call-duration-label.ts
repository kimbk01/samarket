import { formatCmHomeCallDurationLabel } from "@/lib/community-messenger/cm-home-list-copy";

/** 통화 로그·채팅 call_stub 종료 라벨 등에 공통 사용 (분·초 표기). */
export function formatCommunityMessengerCallDurationLabel(seconds: number): string {
  return formatCmHomeCallDurationLabel(seconds);
}
