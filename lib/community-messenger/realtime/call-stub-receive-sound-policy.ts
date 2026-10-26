/**
 * 통화 기록 메시지(`call_stub`) 수신음 규칙 — N-1 (docs/audit/messenger-2026-10-26-remaining-reaudit-plan.md §1).
 *
 * 통화 기록의 보낸 사람은 「끊은 사람」이라, 상대가 끊으면 내 쪽 홈 실시간에는 상대가 보낸 새 메시지로 들어와
 * 앱 수신음이 울렸다(2026-10-26 실기기 0단계: 인앱 알림음을 끄면 사라짐 — 원인 확정).
 * 서버가 통화 기록을 안 읽은 수에 넣는 규칙(부재중만, `service.ts` C-N1)과 같게 부재중만 소리를 낸다.
 */
export function messengerRealtimeRowPlaysReceiveSound(row: Record<string, unknown>): boolean {
  if (row.message_type !== "call_stub") return true;
  const meta = row.metadata;
  const callStatus =
    meta && typeof meta === "object" && typeof (meta as { callStatus?: unknown }).callStatus === "string"
      ? (meta as { callStatus: string }).callStatus.trim().toLowerCase()
      : "";
  return callStatus === "missed";
}
