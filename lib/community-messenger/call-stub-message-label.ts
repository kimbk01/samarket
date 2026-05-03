/**
 * 채팅 `call_stub` 한 줄 라벨 — 클라·서버 공통 (클라는 `service.ts` 직접 import 금지 시 사용).
 */
import type { CommunityMessengerCallKind, CommunityMessengerCallStatus } from "@/lib/community-messenger/types";
import { formatCommunityMessengerCallDurationLabel } from "@/lib/community-messenger/call-duration-label";

export function formatCommunityMessengerCallStubStatus(status: CommunityMessengerCallStatus): string {
  if (status === "missed") return "부재중";
  if (status === "rejected") return "거절됨";
  if (status === "cancelled") return "취소됨";
  if (status === "ended") return "통화 종료";
  if (status === "incoming") return "수신 중";
  return "발신 중";
}

export function buildCommunityMessengerCallStubLabel(
  callKind: CommunityMessengerCallKind,
  status: CommunityMessengerCallStatus,
  durationSeconds?: number
): string {
  const kindLabel = callKind === "video" ? "영상 통화" : "음성 통화";
  const dur = Math.max(0, Math.floor(Number(durationSeconds ?? 0)));
  if (status === "ended" && dur > 0) {
    return `${kindLabel} · ${formatCommunityMessengerCallDurationLabel(dur)}`;
  }
  return `${kindLabel} · ${formatCommunityMessengerCallStubStatus(status)}`;
}
