"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, EyeOff, MessageCircle, Phone, UserPlus, X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  DibayBottomSheet,
  DibayMenuList,
  DibayQuickActions,
  type DibayMenuItem,
  type DibayQuickAction,
} from "@/components/ui/dibay-overlay";
import { DibayDialog } from "@/components/ui/dibay-overlay/DibayDialog";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { SamarketUserAvatarThumb } from "@/components/profile/SamarketUserAvatarThumb";
import type { ContactsRequestState } from "@/components/community-messenger/contacts/use-contacts-friend-cta";
import type { ContactsCallDefault, ContactsMemberRow } from "@/lib/community-messenger/contacts/contacts-contract";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { formatAtUsername } from "@/lib/users/user-label";
import {
  openContactsPhoneCall,
  startContactsDibayCall,
} from "@/components/community-messenger/contacts/MessengerContactsCallChoiceSheet";
import MessengerCallChoiceSheet from "@/components/community-messenger/call-ui/MessengerCallChoiceSheet";
import { unlockCommunityMessengerCallPlaybackFromUserGesture } from "@/lib/community-messenger/call-feedback-sound";

/**
 * 연락처 회원 프로필 (친구 아님 · 통합 시안 「cp」) — 친구 프로필 시트와 같은 오버레이 SSOT:
 * 머리(사진·이름·「@아이디 · 내 연락처/다른 기기 연락처」) → 가로 빠른 행동(친구 추가/수락 · 메시지 · 전화) →
 * 메뉴(추천에서 숨기기 · 차단 — 위험 행동은 마지막, 둘 다 확인 후 실행).
 * 거래·주문 상대 여부는 표시하지 않는다 (Owner #17). 「전화」 = 4단계 C1·C2 기본 통화 방식.
 */
export function MessengerContactsMemberSheet({
  member,
  name,
  deviceNumber,
  callDefault = "ask",
  onClose,
  requestState,
  onAddFriend,
  onAccept,
  onHide,
  onBlock,
}: {
  member: ContactsMemberRow;
  /** 표시 이름 — `contactsMemberDisplayName` (행·시트·확인 문구 공통) */
  name: string;
  /** 이 기기에 저장된 번호 (E.164) — 없으면 휴대폰 전화 불가 */
  deviceNumber: string | null;
  /** 기본 통화 방식 (C2) */
  callDefault?: ContactsCallDefault;
  onClose: () => void;
  /** 홈 친구 요청 상태 우선 (`useContactsFriendCta`) */
  requestState: ContactsRequestState;
  /** 친구 추가 · 수락 · 숨기기 · 차단 — 결과 안내는 각 SSOT 경로가 한다. 성공 여부만 돌려준다 */
  onAddFriend: () => Promise<boolean>;
  onAccept: () => Promise<boolean>;
  onHide: () => Promise<boolean>;
  onBlock: () => Promise<boolean>;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [choiceOpen, setChoiceOpen] = useState(false);
  /**
   * 통화 시트에서 DIBAY 발신을 시작함 — 성공하면 회원 시트를 닫고, 실패하면 회원 시트를 그대로 둔다 (PR #161 Bugbot).
   * 실패해도 통화 시트를 다시 열지 않는다: 전화 인증 시트·진행 중 통화 화면을 가드가 이미 띄웠을 수 있어 덮으면 안 된다.
   */
  const dialingRef = useRef(false);
  /** 숨기기·차단은 확인 후 실행 (메신저 차단과 같은 흐름: 확인 → 처리 중 → 결과 안내) */
  const [confirm, setConfirm] = useState<"hide" | "block" | null>(null);
  const publicId = member.dibay_id || member.username;

  /** 처리 중 표시 → 성공이면 닫기 (결과 안내는 각 경로) */
  const act = async (key: string, fn: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(key);
    const ok = await fn().catch(() => false);
    setBusy(null);
    if (ok) {
      setConfirm(null);
      onClose();
    }
  };

  const openMessage = () =>
    act("message", async () => {
      const res = await fetch("/api/community-messenger/direct/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: member.user_id }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; roomId?: string };
      if (!res.ok || !j.ok || !j.roomId) {
        showMessengerSnackbar(t("cm_contacts_action_failed"), { variant: "error" });
        return false;
      }
      router.push(`/community-messenger/rooms/${encodeURIComponent(j.roomId)}`);
      return true;
    });

  const call = () => {
    if (callDefault === "dibay") {
      // 발신 중이면 기존 가드(guardInstantOutgoingCallStart)가 진행 중 통화로 보낸다 — 버튼을 막지 않는다 (재점검 #9)
      unlockCommunityMessengerCallPlaybackFromUserGesture();
      void startContactsDibayCall(router, member.user_id, "voice", name).then((ok) => {
        if (ok) onClose();
      });
      return;
    }
    if (callDefault === "phone" && deviceNumber) {
      openContactsPhoneCall(deviceNumber);
      return;
    }
    setChoiceOpen(true);
  };

  /** 기본 통화 방식 「매번 묻기」 → 통화 시트 (발신 창 통일 3판 — 앱 모든 발신과 같은 시트) */
  if (choiceOpen) {
    return (
      <MessengerCallChoiceSheet
        peerLabel={name}
        peerAvatarUrl={member.avatar_url}
        viewerUserId={null}
        peerUserId={member.user_id}
        phoneNumber={deviceNumber}
        onClose={() => {
          setChoiceOpen(false);
          if (!dialingRef.current) onClose();
        }}
        onDibayCall={(kind) => {
          dialingRef.current = true;
          unlockCommunityMessengerCallPlaybackFromUserGesture();
          void startContactsDibayCall(router, member.user_id, kind, name).then((ok) => {
            dialingRef.current = false;
            if (ok) onClose();
          });
        }}
      />
    );
  }

  const anyBusy = busy !== null;
  const received = requestState === "received";
  const friendAction: DibayQuickAction[] =
    requestState === "sent"
      ? []
      : [
          {
            key: received ? "accept" : "add",
            icon: received ? <Check strokeWidth={2.2} /> : <UserPlus strokeWidth={2.2} />,
            label: received ? t("cm_contacts_accept") : t("cm_contacts_add_friend"),
            onClick: () => void act(received ? "accept" : "add", received ? onAccept : onAddFriend),
            disabled: anyBusy,
            loading: busy === "accept" || busy === "add",
            primary: true,
          },
        ];
  const quickActions: DibayQuickAction[] = [
    ...friendAction,
    {
      key: "message",
      icon: <MessageCircle strokeWidth={2.2} />,
      label: t("cm_contacts_member_message"),
      onClick: () => void openMessage(),
      disabled: anyBusy,
      loading: busy === "message",
      primary: friendAction.length === 0,
    },
    {
      key: "phone",
      icon: <Phone strokeWidth={2.2} />,
      label: t("cm_contacts_member_phone_call"),
      onClick: call,
      disabled: anyBusy,
    },
  ];
  const menu: DibayMenuItem[] = [
    {
      key: "hide",
      icon: <EyeOff />,
      label: t("cm_contacts_member_hide"),
      hint: t("cm_contacts_member_hide_sub"),
      onClick: () => setConfirm("hide"),
      disabled: anyBusy,
    },
  ];
  const danger: DibayMenuItem[] = [
    { key: "block", icon: <Ban />, label: t("cm_contacts_member_block"), onClick: () => setConfirm("block"), disabled: anyBusy, danger: true },
  ];

  return (
    <DibayBottomSheet open onClose={onClose} ariaLabel={name} showHandle>
      <div className={`relative ${OverlayUi.profileHeader}`} data-cm-contacts-member-sheet="">
        <button type="button" className="dibay-overlay-icon-btn absolute -right-2 -top-2" aria-label={t("nav_close")} onClick={onClose}>
          <X className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
        <SamarketUserAvatarThumb avatarUrl={member.avatar_url} size={72} roundedClassName="rounded-full" />
        <h2 className={`mt-2 ${OverlayUi.title} ${OverlayUi.titleSheet}`}>{name}</h2>
        <p className={`mt-0.5 ${OverlayUi.caption}`}>
          {[publicId ? formatAtUsername(publicId) : null, member.on_this_device ? t("cm_contacts_my_contact") : t("cm_contacts_member_other_device")]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <DibayQuickActions items={quickActions} />
      <DibayMenuList groups={[menu, danger]} />
      <DibayDialog
        open={confirm !== null}
        onClose={() => (busy ? undefined : setConfirm(null))}
        title={confirm === "block" ? t("cm_contacts_block_confirm_title", { name }) : t("cm_contacts_hide_confirm_title")}
        description={confirm === "block" ? t("cm_contacts_block_confirm_desc") : t("cm_contacts_hide_confirm_desc")}
        actions={[
          { key: "cancel", label: t("cm_contacts_cancel"), roleTone: "secondary", onClick: () => setConfirm(null), disabled: anyBusy },
          {
            key: "ok",
            label: confirm === "block" ? t("cm_contacts_member_block") : t("cm_contacts_member_hide"),
            roleTone: confirm === "block" ? "destructive" : "primary",
            loading: anyBusy,
            onClick: () => void act(confirm ?? "hide", confirm === "block" ? onBlock : onHide),
          },
        ]}
      />
    </DibayBottomSheet>
  );
}
