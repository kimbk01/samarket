/**
 * 채팅 `call_stub` 한 줄 라벨 — 클라·서버 공통 (클라는 `service.ts` 직접 import 금지 시 사용).
 * SSOT: `call-event-presentation.formatCallEventSharedListLabel`
 */
import type { CommunityMessengerCallKind, CommunityMessengerCallStatus } from "@/lib/community-messenger/types";
import { formatCallEventSharedListLabel } from "@/lib/community-messenger/call-event-presentation";

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
  return formatCallEventSharedListLabel(callKind, status, durationSeconds);
}
