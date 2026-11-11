"use client";

/**
 * 통화 선택 시트 — 방 헤더 📞 하나를 누르면 「DIBAY 음성 통화 · DIBAY 영상 통화 · 휴대폰 전화」.
 * 연락처(이 기기 번호표)를 읽으므로 **📞 를 누를 때만 지연 import** 한다 — 방 진입·bootstrap·Realtime 경로에는
 * 연락처 코드를 넣지 않는다 (연락처 SSOT 「방 진입 미연결」 · `contacts-sync-1a.test.ts` hot path 계약).
 * 설계: `docs/audit/call-entry-button-audit-2026-11-12.html` 2판 (Owner 승인 2026-11-12).
 * - 세 줄은 항상 같은 자리. 막힌 줄은 흐림이 아닌 보조 글자색 + 이유 (연락처 선택 시트와 같은 UI 기준·같은 문구 키).
 * - DIBAY: 고르면 바로 방 발신(`onDibayCall` → `startManagedDirectCall`) — 시트 선택이 확인 역할이라 확인 팝업을 다시 띄우지 않는다.
 * - 휴대폰 전화: 이 기기 연락처에 상대 번호가 있을 때만 `tel:` (서버·통화 세션 없음). 없으면 회색.
 */
import { useMemo } from "react";
import { Phone, Smartphone, Video } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerHomeBottomSheetShell } from "@/components/community-messenger/MessengerSheetUi";
import { openContactsPhoneCall } from "@/components/community-messenger/contacts/MessengerContactsCallChoiceSheet";
import { resolveContactsPeerNumber } from "@/components/community-messenger/contacts/contacts-friend-call";
import type { RoomCallChoice, RoomCallChoiceRow } from "@/lib/community-messenger/call-ui/room-call-choice";

export default function MessengerCallChoiceSheet({
  peerLabel,
  viewerUserId,
  peerUserId,
  choice,
  onClose,
  onDibayCall,
}: {
  peerLabel: string;
  viewerUserId: string | null;
  peerUserId: string | null;
  choice: RoomCallChoice;
  onClose: () => void;
  onDibayCall: (kind: "voice" | "video") => void;
}) {
  const { t } = useI18n();
  /** 시트를 열 때 1번만 읽는다 (기기 안 번호표) */
  const phoneNumber = useMemo(
    () => (viewerUserId && peerUserId ? resolveContactsPeerNumber(viewerUserId, peerUserId) : null),
    [peerUserId, viewerUserId]
  );

  const row = (
    key: string,
    icon: ReactNode,
    label: string,
    sub: string,
    enabled: boolean,
    onClick: () => void
  ) => (
    <button
      key={key}
      type="button"
      disabled={!enabled}
      onClick={onClick}
      data-cm-room-call-choice={key}
      className="flex min-h-[56px] w-full items-center gap-3 border-t border-[color:var(--overlay-border)] px-4 py-2 text-left"
      style={{ color: enabled ? "var(--overlay-text-primary)" : "var(--overlay-text-secondary)" }}
    >
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center"
        style={{ color: enabled ? "var(--sam-primary)" : "var(--overlay-text-secondary)" }}
        aria-hidden
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px]">{label}</span>
        <span className="text-[12px]" style={{ color: "var(--overlay-text-secondary)" }}>
          {sub}
        </span>
      </span>
    </button>
  );

  const dibayRow = (kind: "voice" | "video", r: RoomCallChoiceRow) =>
    row(
      kind,
      kind === "voice" ? <Phone size={20} strokeWidth={2} /> : <Video size={20} strokeWidth={2} />,
      t(kind === "voice" ? "cm_contacts_call_dibay_voice" : "cm_contacts_call_dibay_video"),
      r.enabled ? t("cm_contacts_call_dibay_sub") : t(r.reasonKey),
      r.enabled,
      () => {
        onClose();
        onDibayCall(kind);
      }
    );

  return (
    <MessengerHomeBottomSheetShell
      onClose={onClose}
      closeAriaLabel={t("cm_contacts_cancel")}
      anchor="fit-content"
      dialogAriaLabel={t("cm_contacts_member_phone_call")}
    >
      <div className="pb-[max(1rem,var(--safe-bottom))] pt-4" data-cm-room-call-choice-sheet="">
        <p className="truncate px-4 pb-2 text-[16px] font-semibold" style={{ color: "var(--overlay-text-primary)" }}>
          {t("cm_contacts_member_phone_call")}
          {peerLabel ? ` · ${peerLabel}` : ""}
        </p>
        {dibayRow("voice", choice.voice)}
        {dibayRow("video", choice.video)}
        {row(
          "phone",
          <Smartphone size={20} strokeWidth={2} />,
          t("cm_contacts_call_phone"),
          phoneNumber ? t("cm_contacts_member_phone_call_sub") : t("cm_contacts_member_no_number"),
          Boolean(phoneNumber),
          () => {
            if (!phoneNumber) return;
            onClose();
            openContactsPhoneCall(phoneNumber);
          }
        )}
      </div>
    </MessengerHomeBottomSheetShell>
  );
}
