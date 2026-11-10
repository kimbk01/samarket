"use client";

/**
 * 연락처 회원 「전화」 선택 (연락처 동기화 4단계 C1 · 영향 분석 docs/design/messenger-contacts-call-stage4-impact.md).
 * - DIBAY 음성·영상: 기존 발신 함수를 그대로 쓴다 (홈·거래 통화 버튼과 같은 순서:
 *   guardInstantOutgoingCallStart → launchOutgoingDirectCall · 실패는 alertOutgoingCallFailure · 전화 인증 필요면 그 안내).
 *   통화 세션·푸시·네이티브·권한 판정은 바꾸지 않는다 (상대 통화 설정·차단은 서버가 그대로 판정).
 * - 휴대폰 전화: 이 기기에 저장된 번호로 `tel:` (서버·통화 세션 없음).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerHomeBottomSheetShell } from "@/components/community-messenger/MessengerSheetUi";
import { unlockCommunityMessengerCallPlaybackFromUserGesture } from "@/lib/community-messenger/call-feedback-sound";
import { launchOutgoingDirectCall } from "@/lib/community-messenger/call-session-navigation-seed";
import {
  guardInstantOutgoingCallStart,
  isOutgoingCallPhoneVerificationRequired,
  navigateBlockedOutgoingCall,
} from "@/lib/call/outgoing-call-start-guard";
import { useOutgoingCallBlocked } from "@/lib/call/use-outgoing-call-blocked";
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

export function MessengerContactsCallChoiceSheet({
  peerUserId,
  peerLabel,
  deviceNumber,
  onClose,
  onDibayCall,
}: {
  peerUserId: string;
  peerLabel: string | null;
  deviceNumber: string | null;
  onClose: () => void;
  /**
   * DIBAY 통화를 호출한 화면의 기존 경로로 보낼 때 (친구 프로필 = 홈 발신 확인 경로 그대로 — C1 「지금과 같은 경로」).
   * 없으면 연락처 회원과 같은 기존 발신 함수.
   */
  onDibayCall?: (kind: ContactsCallKind) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { blocked: outgoingBlocked } = useOutgoingCallBlocked();
  const [busy, setBusy] = useState(false);

  const dibay = async (kind: ContactsCallKind) => {
    if (busy || outgoingBlocked) return;
    if (onDibayCall) {
      onClose();
      onDibayCall(kind);
      return;
    }
    unlockCommunityMessengerCallPlaybackFromUserGesture();
    setBusy(true);
    const ok = await startContactsDibayCall(router, peerUserId, kind, peerLabel);
    setBusy(false);
    if (ok) onClose();
  };

  const row = (key: string, label: string, sub: string, onClick: () => void, disabled: boolean) => (
    <button
      key={key}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-[52px] w-full items-center justify-between gap-3 border-t border-[color:var(--overlay-border)] px-4 text-left"
      // 막힘은 흐리게(opacity)가 아니라 보조 글자색으로 (UI SSOT)
      style={{ color: disabled ? "var(--overlay-text-secondary)" : "var(--overlay-text-primary)" }}
    >
      <span className="text-[15px]">{label}</span>
      <span className="text-[12px]" style={{ color: "var(--overlay-text-secondary)" }}>
        {sub}
      </span>
    </button>
  );

  return (
    <MessengerHomeBottomSheetShell onClose={onClose} closeAriaLabel={t("cm_contacts_cancel")} anchor="fit-content" dialogAriaLabel={t("cm_contacts_member_phone_call")}>
      <div className="pb-[max(1rem,var(--safe-bottom))] pt-4" data-cm-contacts-call-choice="">
        <p className="px-4 pb-2 text-[16px] font-semibold" style={{ color: "var(--overlay-text-primary)" }}>
          {t("cm_contacts_member_phone_call")}
          {peerLabel ? ` · ${peerLabel}` : ""}
        </p>
        {row("voice", t("cm_contacts_call_dibay_voice"), t("cm_contacts_call_dibay_sub"), () => void dibay("voice"), busy || outgoingBlocked)}
        {row("video", t("cm_contacts_call_dibay_video"), t("cm_contacts_call_dibay_sub"), () => void dibay("video"), busy || outgoingBlocked)}
        {row(
          "phone",
          t("cm_contacts_call_phone"),
          deviceNumber ? t("cm_contacts_member_phone_call_sub") : t("cm_contacts_member_no_number"),
          () => {
            if (!deviceNumber) return;
            openContactsPhoneCall(deviceNumber);
            onClose();
          },
          !deviceNumber || busy
        )}
      </div>
    </MessengerHomeBottomSheetShell>
  );
}
