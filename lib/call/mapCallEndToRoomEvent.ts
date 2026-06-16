import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

/**
 * 통화 종료 사유 → 채팅방 `call_stub` / 목록 미리보기용 한글 한 줄.
 * 서버가 저장하는 `CommunityMessengerCallStatus` 와 맞춘다.
 */
export type CallEndReason =
  | "canceled"
  | "declined"
  | "missed"
  | "failed"
  | "ended"
  | "incoming"
  | "dialing";

export function mapCallEndToRoomEventLine(kind: CommunityMessengerCallKind, reason: CallEndReason, durationSeconds?: number): string {
  const voice = kind === "voice";
  const label = voice ? "음성 통화" : "영상 통화";
  switch (reason) {
    case "canceled":
      return `${label} · 취소됨`;
    case "declined":
      return `${label} · 거절됨`;
    case "missed":
      return "부재중 통화";
    case "failed":
      return "통화 연결 실패";
    case "ended": {
      const s = Math.max(0, Math.floor(durationSeconds ?? 0));
      if (voice) return `${label} · ${s}초`;
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${label} · ${m}분 ${sec}초`;
    }
    case "incoming":
      return `${label} · 수신 중`;
    case "dialing":
      return `${label} · 발신 중`;
    default:
      return label;
  }
}
