"use client";

import { SamarketUserAvatarThumb } from "@/components/profile/SamarketUserAvatarThumb";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MESSENGER_ROW_BTN_CLASS } from "@/components/community-messenger/friend-cta/MessengerFriendRelationCta";
import { Sam } from "@/lib/ui/sam-component-classes";
import type { ContactsMemberRow } from "@/lib/community-messenger/contacts/contacts-contract";

/**
 * 연락처 회원 행 — 친구 탭 행(시안 4판: 높이 64 · 사진 44 둥근 사각 16 · 이름 16/600 · 2행 12.5 회색)과 같은 모양.
 * 이 기기 연락처면 기기에 저장된 이름(서버로 보내지 않음), 아니면 DIBAY 닉네임 + 「다른 기기」.
 */
export function MessengerContactsMemberRow({
  member,
  deviceName,
  busy,
  onPress,
  onAddFriend,
}: {
  member: ContactsMemberRow;
  deviceName: string | null;
  busy: boolean;
  onPress: () => void;
  onAddFriend: () => void;
}) {
  const { t } = useI18n();
  const name = (member.on_this_device && deviceName) || member.nickname || member.dibay_id || member.username || "";
  const sub = member.on_this_device ? t("cm_contacts_on_this_device") : null;
  return (
    <div className="flex w-full items-center" data-cm-messenger-list-row="" data-cm-list-surface="friend" data-cm-contacts-member="">
      <button type="button" onClick={onPress} className="flex min-w-0 flex-1 items-center text-left active:bg-[color:var(--messenger-primary-soft)]">
        <div data-cm-list-avatar-slot="" className="relative shrink-0">
          <SamarketUserAvatarThumb avatarUrl={member.avatar_url} size={44} roundedClassName="rounded-[16px]" className="h-full w-full" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <p data-cm-list-title="" className="flex min-w-0 items-center gap-1.5" style={{ color: "var(--cm-chat-fg)" }}>
            <span className="truncate">{name}</span>
            {member.recently_joined ? (
              <span className="shrink-0 rounded-full bg-[color:var(--sam-primary-soft)] px-1.5 text-[11px] font-semibold leading-[18px] text-sam-primary">
                {t("cm_contacts_badge_recent")}
              </span>
            ) : null}
          </p>
          <p data-cm-list-preview="" className="flex min-w-0 items-center gap-1.5" style={{ color: "var(--cm-chat-sub)" }}>
            {member.on_this_device ? (
              <span className="truncate">{sub}</span>
            ) : (
              <span className="shrink-0 rounded-full bg-[color:var(--cm-chat-band)] px-1.5 text-[11px] leading-[18px]">
                {t("cm_contacts_badge_other_device")}
              </span>
            )}
          </p>
        </div>
      </button>
      <span className="shrink-0 pl-2 pr-4">
        {member.request_state === "sent" ? (
          <span className={`${Sam.btn.secondaryCombo} ${MESSENGER_ROW_BTN_CLASS} pointer-events-none opacity-70`}>{t("cm_contacts_requested")}</span>
        ) : (
          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={onAddFriend}
            className={`${Sam.btn.primaryCombo} ${MESSENGER_ROW_BTN_CLASS}`}
          >
            {member.request_state === "received" ? t("cm_contacts_accept") : t("cm_contacts_add_friend")}
          </button>
        )}
      </span>
    </div>
  );
}
