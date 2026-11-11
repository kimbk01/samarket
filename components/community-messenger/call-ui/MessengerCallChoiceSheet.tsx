"use client";

/**
 * 통화 시트 — 앱의 모든 1:1 발신 진입점이 쓰는 단 하나의 발신 창 (발신 창 통일 3판 · Owner 승인 2026-11-12).
 * 시안: `docs/audit/call-choice-sheet-mockup-v3-2026-11-12.html`.
 *
 * - 모양: `DibayBottomSheet` + `DibayOverlayButton` (앱 공용 시트·버튼 그대로 — 높이 48 · 모서리 12 · 15/600 ·
 *   눌림 = 진해짐 + 0.98배 · 비활성 = 회색 배경). 맨 위 상대 사진 56 + 이름(시트 제목).
 * - 버튼: 「음성 통화」(주) · 「영상 통화」 · 「휴대폰 전화」 · 「취소」. 못 쓰는 버튼은 회색 + 바로 아래 이유 한 줄.
 * - DIBAY 음성·영상: 고르면 바로 `onDibayCall(kind)` — 시트 선택이 확인 역할이라 확인 팝업을 다시 띄우지 않는다.
 * - 휴대폰 전화: 이 기기 연락처(연락처 동기화)에 상대 번호가 있을 때만 `tel:` (서버·통화 세션 없음). 번호는 기기 밖으로 보내지 않는다.
 * - 연락처 코드를 읽으므로 **호출처는 이 파일을 지연 import** 한다 (연락처 hot path 계약 — 방 진입·bootstrap 미연결).
 */
import { useMemo, useState, type ReactNode } from "react";
import { Phone, Smartphone, Video } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import { openContactsPhoneCall } from "@/components/community-messenger/contacts/MessengerContactsCallChoiceSheet";
import { resolveContactsPeerNumber } from "@/components/community-messenger/contacts/contacts-friend-call";
import type { RoomCallChoiceRow } from "@/lib/community-messenger/call-ui/room-call-choice";

/** 통화 기록 말풍선 pointerup 직후 합성 click 이 배경을 눌러 시트를 바로 닫는 것을 막는다 (옛 확인 팝업과 같은 350ms) */
const BACKDROP_DISMISS_GUARD_MS = 350;

const ENABLED_ROW: RoomCallChoiceRow = { enabled: true };

export type MessengerCallSheetProps = {
  /** 시트 제목 = 받는 사람 이름 (매장 주문 구매자 = 매장명). 비면 「대화 상대」 */
  peerLabel: string;
  peerAvatarUrl?: string | null;
  viewerUserId: string | null;
  peerUserId: string | null;
  /** 방 판정(`resolveRoomCallChoice`) 결과 — 방 밖(홈·통화 탭·연락처)은 생략 = 둘 다 사용 가능(최종 판정은 서버) */
  voice?: RoomCallChoiceRow;
  video?: RoomCallChoiceRow;
  /** 발신 시작 중 — DIBAY 두 버튼을 잠근다 */
  busy?: boolean;
  /** 호출처가 이미 이 기기 번호를 안다면(연락처 회원 시트) 그 값 — 생략하면 연락처 번호표에서 찾는다 */
  phoneNumber?: string | null;
  onClose: () => void;
  onDibayCall: (kind: "voice" | "video") => void;
};

export default function MessengerCallChoiceSheet({
  peerLabel,
  peerAvatarUrl = null,
  viewerUserId,
  peerUserId,
  voice = ENABLED_ROW,
  video = ENABLED_ROW,
  busy = false,
  phoneNumber: phoneNumberProp,
  onClose,
  onDibayCall,
}: MessengerCallSheetProps) {
  const { t } = useI18n();
  /**
   * 첫 렌더 시각 — effect(페인트 뒤)가 아니라 렌더 때 정해야 pointerup 직후 합성 click 보다 먼저 잡힌다
   * (PR #161 Bugbot: ref 0 으로 시작하면 가드가 항상 통과해 말풍선·통화 탭에서 시트가 바로 닫힘).
   */
  const [openedAt] = useState(() => Date.now());

  /** 시트를 열 때 1번만 읽는다 (기기 안 번호표) */
  const phoneNumber = useMemo(() => {
    if (phoneNumberProp !== undefined) return phoneNumberProp;
    return viewerUserId && peerUserId ? resolveContactsPeerNumber(viewerUserId, peerUserId) : null;
  }, [peerUserId, phoneNumberProp, viewerUserId]);

  const title = peerLabel.trim() || t("common_partner");
  const handleClose = () => {
    if (Date.now() - openedAt < BACKDROP_DISMISS_GUARD_MS) return;
    onClose();
  };
  const dibay = (kind: "voice" | "video") => {
    if (busy) return;
    /** 발신을 먼저 알리고 시트를 닫는다 — 호출처가 「발신 중」을 알고 닫기 동작을 고를 수 있게 (연락처 회원 시트: 실패 시 선택 화면 유지) */
    onDibayCall(kind);
    onClose();
  };

  const reason = (key: string, text: string): ReactNode => (
    <p key={key} className="dibay-overlay-caption -mt-1 text-center" data-cm-call-sheet-reason={key}>
      {text}
    </p>
  );

  /** 음성·영상이 같은 이유로 막히면 이유는 두 버튼 아래 한 번만 */
  const sameDibayReason =
    !voice.enabled && !video.enabled && voice.reasonKey === video.reasonKey ? voice.reasonKey : null;

  return (
    <DibayBottomSheet open onClose={handleClose} ariaLabel={t("cm_contacts_member_phone_call")}>
      <div data-cm-call-sheet="">
        <div className="mb-2 flex justify-center">
          <div className="relative h-14 w-14 overflow-hidden rounded-full bg-[color:var(--sm-color-primary-soft)]">
            <SamarketThumbnail
              src={resolveUserAvatarImageSrc(peerAvatarUrl)}
              fill
              roundedClassName="rounded-full"
              className="bg-[color:var(--sm-color-primary-soft)]"
              fallbackSrc=""
              fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
            />
          </div>
        </div>
        <h2 className="dibay-overlay-title dibay-overlay-title--sheet truncate">{title}</h2>
        <div className="dibay-overlay-actions dibay-overlay-actions--stack">
          <DibayOverlayButton
            roleTone="primary"
            disabled={!voice.enabled || busy}
            onClick={() => dibay("voice")}
            data-cm-call-sheet-action="voice"
          >
            <Phone size={20} strokeWidth={2.4} aria-hidden />
            <span>{t("nav_voice_call_label")}</span>
          </DibayOverlayButton>
          {!voice.enabled && !sameDibayReason ? reason("voice", t(voice.reasonKey)) : null}
          <DibayOverlayButton
            roleTone="secondary"
            disabled={!video.enabled || busy}
            onClick={() => dibay("video")}
            data-cm-call-sheet-action="video"
          >
            <Video size={20} strokeWidth={2.4} aria-hidden />
            <span>{t("nav_video_call_label")}</span>
          </DibayOverlayButton>
          {sameDibayReason
            ? reason("dibay", t(sameDibayReason))
            : !video.enabled
              ? reason("video", t(video.reasonKey))
              : null}
          <DibayOverlayButton
            roleTone="secondary"
            disabled={!phoneNumber}
            onClick={() => {
              if (!phoneNumber) return;
              onClose();
              openContactsPhoneCall(phoneNumber);
            }}
            data-cm-call-sheet-action="phone"
          >
            <Smartphone size={20} strokeWidth={2.4} aria-hidden />
            <span>{t("cm_contacts_call_phone")}</span>
          </DibayOverlayButton>
          {!phoneNumber ? reason("phone", t("cm_call_sheet_no_number")) : null}
          <DibayOverlayButton roleTone="text" onClick={onClose} data-cm-call-sheet-action="cancel">
            {t("common_cancel")}
          </DibayOverlayButton>
        </div>
      </div>
    </DibayBottomSheet>
  );
}
