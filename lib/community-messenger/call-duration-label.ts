/** 통화 로그·채팅 call_stub 종료 라벨 등에 공통 사용 (분·초 표기). */
export function formatCommunityMessengerCallDurationLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  if (mins < 1) return `${secs}초`;
  return `${mins}분 ${secs.toString().padStart(2, "0")}초`;
}
