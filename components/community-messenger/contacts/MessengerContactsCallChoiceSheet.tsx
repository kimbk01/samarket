"use client";

/**
 * 연락처 회원 「전화」 발신 함수 (연락처 동기화 4단계 C1 · 영향 분석 docs/design/messenger-contacts-call-stage4-impact.md).
 * 선택 화면은 앱 공용 통화 시트 `components/community-messenger/call-ui/MessengerCallChoiceSheet.tsx` 하나로 통일 (발신 창 통일 3판 · Owner 2026-11-12).
 * - DIBAY 음성·영상: 기존 발신 함수를 그대로 쓴다 (홈·거래 통화 버튼과 같은 순서:
 *   guardInstantOutgoingCallStart → launchOutgoingDirectCall · 실패는 alertOutgoingCallFailure · 전화 인증 필요면 그 안내).
 *   통화 세션·푸시·네이티브·권한 판정은 바꾸지 않는다 (상대 통화 설정·차단은 서버가 그대로 판정).
 * - 휴대폰 전화: 이 기기에 저장된 번호로 `tel:` (서버·통화 세션 없음).
 */
import { useRouter } from "next/navigation";
import { launchOutgoingDirectCall } from "@/lib/community-messenger/call-session-navigation-seed";
import {
  guardInstantOutgoingCallStart,
  isOutgoingCallPhoneVerificationRequired,
  navigateBlockedOutgoingCall,
} from "@/lib/call/outgoing-call-start-guard";
import { alertOutgoingCallFailure } from "@/lib/community-messenger/call-outgoing-failure-alert";

export type ContactsCallKind = "voice" | "video";

/** DIBAY 통화 시작 — 기존 함수 그대로 (새 판정·새 경로 없음) */
export async function startContactsDibayCall(
  router: ReturnType<typeof useRouter>,
  peerUserId: string,
  kind: ContactsCallKind,
  peerLabel: string | null
): Promise<boolean> {
  const guard = guardInstantOutgoingCallStart({ peerUserId, kind });
  if (!guard.ok) {
    if (isOutgoingCallPhoneVerificationRequired(guard)) return false;
    if (guard.blockedCallId) navigateBlockedOutgoingCall(router, guard.blockedCallId);
    else alertOutgoingCallFailure(guard.userMessage);
    return false;
  }
  const result = await launchOutgoingDirectCall({ kind, peerUserId, peerLabel: peerLabel?.trim() || undefined }, router);
  if (!result.ok) {
    if (isOutgoingCallPhoneVerificationRequired(result)) return false;
    alertOutgoingCallFailure(result.userMessage);
    return false;
  }
  return true;
}

export function openContactsPhoneCall(deviceNumber: string): void {
  window.location.assign(`tel:${deviceNumber}`);
}
