"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerHomeBottomSheetShell } from "@/components/community-messenger/MessengerSheetUi";
import { DibayDialog } from "@/components/ui/dibay-overlay/DibayDialog";
import { SamarketUserAvatarThumb } from "@/components/profile/SamarketUserAvatarThumb";
import type { ContactsRequestState } from "@/components/community-messenger/contacts/use-contacts-friend-cta";
import { contactsApi } from "@/lib/community-messenger/contacts/contacts-api-client";
import type { ContactsMemberRow } from "@/lib/community-messenger/contacts/contacts-contract";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { formatAtUsername } from "@/lib/users/user-label";
import type { ContactsCallDefault } from "@/lib/community-messenger/contacts/contacts-contract";
import {
  MessengerContactsCallChoiceSheet,
  openContactsPhoneCall,
  startContactsDibayCall,
} from "@/components/community-messenger/contacts/MessengerContactsCallChoiceSheet";
import { unlockCommunityMessengerCallPlaybackFromUserGesture } from "@/lib/community-messenger/call-feedback-sound";

/**
 * 연락처 회원 프로필 (친구 아님) — 친구 추가 · 메시지(일반 1:1, 거래·주문 방과 따로) · 휴대폰 전화(이 기기 번호만) ·
 * 추천에서 숨기기(상대 모름) · 차단(기존 차단 API) — 둘 다 확인 후 실행. 받은 요청이면 「수락」(기존 수락 경로).
 * 거래·주문 상대 여부는 표시하지 않는다 (Owner #17).
 * 「전화 걸기」 = 4단계 C1·C2: 기본 통화 방식(매번 묻기 → 선택 시트 · DIBAY → 기존 발신 함수 · 휴대폰 → tel:).
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
  onRemoved,
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
  /** 친구 추가 · 수락 — 메신저 친구 요청 SSOT (결과 안내도 그쪽이 한다) */
  onAddFriend: () => Promise<boolean>;
  onAccept: () => Promise<boolean>;
  onRemoved: (userId: string) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [choiceOpen, setChoiceOpen] = useState(false);
  /** 숨기기·차단은 확인 후 실행 (메신저 차단과 같은 흐름: 확인 → 처리 중 → 결과 안내) */
  const [confirm, setConfirm] = useState<"hide" | "block" | null>(null);
  const publicId = member.dibay_id || member.username;

  const run = async (key: string, fn: () => Promise<boolean>, done?: string) => {
    if (busy) return;
    setBusy(key);
    const ok = await fn().catch(() => false);
    setBusy(null);
    if (!ok) {
      showMessengerSnackbar(t("cm_contacts_action_failed"), { variant: "error" });
      return;
    }
    if (done) showMessengerSnackbar(done);
  };

  const row = (key: string, label: string, sub: string | null, onClick: () => void, opts: { danger?: boolean; disabled?: boolean } = {}) => (
    <button
      key={key}
      type="button"
      disabled={opts.disabled || busy !== null}
      aria-busy={busy === key}
      onClick={onClick}
      className="flex min-h-[52px] w-full items-center justify-between gap-3 border-t border-[color:var(--overlay-border)] px-4 text-left"
      style={{
        // 막힘은 흐리게(opacity)가 아니라 보조 글자색으로 (UI SSOT)
        color:
          opts.disabled || (busy !== null && busy !== key)
            ? "var(--overlay-text-secondary)"
            : opts.danger
              ? "var(--sam-danger)"
              : "var(--overlay-text-primary)",
      }}
    >
      <span className="text-[15px]">{label}</span>
      {sub ? (
        <span className="text-[12px]" style={{ color: "var(--overlay-text-secondary)" }}>
          {sub}
        </span>
      ) : null}
    </button>
  );

  /** 친구 추가·수락 — 결과 안내는 친구 요청 SSOT 가 하므로 여기서는 처리 중 표시와 닫기만 */
  const friendCta = async (key: "add" | "accept", fn: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(key);
    const ok = await fn().catch(() => false);
    setBusy(null);
    if (ok) onClose();
  };

  const doHide = () =>
    run(
      "hide",
      async () => {
        const r = await contactsApi.suppress(member.user_id);
        if (r.ok) {
          setConfirm(null);
          onRemoved(member.user_id);
          onClose();
        }
        return r.ok;
      },
      t("cm_contacts_hidden_done")
    );

  const doBlock = () =>
    run(
      "block",
      async () => {
        const res = await fetch("/api/community-messenger/relations/block", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId: member.user_id, blockSource: "profile" }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (res.ok && j.ok) {
          setConfirm(null);
          onRemoved(member.user_id);
          onClose();
          return true;
        }
        return false;
      },
      t("cm_contacts_blocked_done")
    );

  if (choiceOpen) {
    return (
      <MessengerContactsCallChoiceSheet
        peerUserId={member.user_id}
        peerLabel={name}
        deviceNumber={deviceNumber}
        onClose={() => {
          setChoiceOpen(false);
          onClose();
        }}
      />
    );
  }

  return (
    <MessengerHomeBottomSheetShell onClose={onClose} closeAriaLabel={t("cm_contacts_cancel")} anchor="fit-content" dialogAriaLabel={name}>
      <div className="pb-[max(1rem,var(--safe-bottom))] pt-4" data-cm-contacts-member-sheet="">
        <div className="flex flex-col items-center gap-1 px-4 pb-3">
          <SamarketUserAvatarThumb avatarUrl={member.avatar_url} size={72} roundedClassName="rounded-[24px]" />
          <p className="mt-1 text-[18px] font-semibold" style={{ color: "var(--overlay-text-primary)" }}>
            {name}
          </p>
          <p className="text-[12.5px]" style={{ color: "var(--overlay-text-secondary)" }}>
            {[publicId ? formatAtUsername(publicId) : null, member.on_this_device ? t("cm_contacts_on_this_device") : t("cm_contacts_member_other_device")]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {requestState === "received"
          ? row("accept", t("cm_contacts_accept"), null, () => void friendCta("accept", onAccept))
          : requestState !== "sent"
            ? row("add", t("cm_contacts_add_friend"), null, () => void friendCta("add", onAddFriend))
            : null}
        {row("message", t("cm_contacts_member_message"), null, () =>
          void run("message", async () => {
            const res = await fetch("/api/community-messenger/direct/start", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ targetUserId: member.user_id }),
            });
            const j = (await res.json().catch(() => ({}))) as { ok?: boolean; roomId?: string };
            if (!res.ok || !j.ok || !j.roomId) return false;
            onClose();
            router.push(`/community-messenger/rooms/${encodeURIComponent(j.roomId)}`);
            return true;
          })
        )}
        {row("phone", t("cm_contacts_member_phone_call"), null, () => {
          if (callDefault === "dibay") {
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
        })}
        {row("hide", t("cm_contacts_member_hide"), t("cm_contacts_member_hide_sub"), () => setConfirm("hide"))}
        {row("block", t("cm_contacts_member_block"), null, () => setConfirm("block"), { danger: true })}
      </div>
      <DibayDialog
        open={confirm !== null}
        onClose={() => (busy ? undefined : setConfirm(null))}
        title={confirm === "block" ? t("cm_contacts_block_confirm_title", { name }) : t("cm_contacts_hide_confirm_title")}
        description={confirm === "block" ? t("cm_contacts_block_confirm_desc") : t("cm_contacts_hide_confirm_desc")}
        actions={[
          {
            key: "cancel",
            label: t("cm_contacts_cancel"),
            roleTone: "secondary",
            onClick: () => setConfirm(null),
            disabled: busy !== null,
          },
          {
            key: "ok",
            label: confirm === "block" ? t("cm_contacts_member_block") : t("cm_contacts_member_hide"),
            roleTone: confirm === "block" ? "destructive" : "primary",
            loading: busy !== null,
            onClick: () => void (confirm === "block" ? doBlock() : doHide()),
          },
        ]}
      />
    </MessengerHomeBottomSheetShell>
  );
}
