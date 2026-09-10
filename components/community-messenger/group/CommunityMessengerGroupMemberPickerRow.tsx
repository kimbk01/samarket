"use client";

import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import type { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  GROUP_MEMBER_PICKER_ELIGIBILITY,
  type GroupMemberPickerEligibility,
} from "@/lib/community-messenger/group/group-member-picker-eligibility";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import { Sam } from "@/lib/ui/css-vars";

type Translate = ReturnType<typeof useI18n>["t"];

export type CommunityMessengerGroupMemberPickerRowProps = {
  t: Translate;
  user: CommunityMessengerProfileLite;
  eligibility: GroupMemberPickerEligibility;
  selected: boolean;
  friendRequestBusy: boolean;
  onToggleSelect: (next: boolean) => void;
  onFriendRequest: () => void;
};

/**
 * Shared Create/Invite row — avatar · name · @handle · relationship · selection/CTA.
 */
export function CommunityMessengerGroupMemberPickerRow({
  t,
  user,
  eligibility,
  selected,
  friendRequestBusy,
  onToggleSelect,
  onFriendRequest,
}: CommunityMessengerGroupMemberPickerRowProps) {
  const handle = user.subtitle?.trim() || "";
  const selectable = eligibility === GROUP_MEMBER_PICKER_ELIGIBILITY.FRIEND;

  const statusNode = (() => {
    switch (eligibility) {
      case GROUP_MEMBER_PICKER_ELIGIBILITY.ALREADY_MEMBER:
        return (
          <span className={`${Sam.text.helper} font-medium text-sam-muted`}>
            {t("cm_ui_participant_status_joined")}
          </span>
        );
      case GROUP_MEMBER_PICKER_ELIGIBILITY.FRIEND:
        return (
          <span className={`${Sam.text.helper} font-medium text-emerald-700`}>
            {t("nav_messenger_friend")}
          </span>
        );
      case GROUP_MEMBER_PICKER_ELIGIBILITY.PENDING_FRIEND_REQUEST:
        return (
          <span className={`${Sam.text.helper} font-medium text-sam-muted`}>
            {t("cm_ui_group_member_picker_request_pending")}
          </span>
        );
      case GROUP_MEMBER_PICKER_ELIGIBILITY.NON_FRIEND:
        return (
          <button
            type="button"
            disabled={friendRequestBusy}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onFriendRequest();
            }}
            className={`${Sam.text.helper} font-semibold text-[color:var(--sam-brand,#2563eb)] disabled:opacity-50`}
          >
            {friendRequestBusy ? t("common_loading") : t("cm_ui_friend_request")}
          </button>
        );
      case GROUP_MEMBER_PICKER_ELIGIBILITY.SELF:
      default:
        return null;
    }
  })();

  const body = (
    <>
      {selectable ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onToggleSelect(e.target.checked)}
          className="h-4 w-4 shrink-0 rounded border-sam-border text-sam-fg focus:ring-sam-border"
          aria-label={user.label}
        />
      ) : (
        <span className="inline-block h-4 w-4 shrink-0" aria-hidden />
      )}
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-sam-surface ring-1 ring-sam-border">
        <SamarketThumbnail
          src={resolveUserAvatarImageSrc(user.avatarUrl)}
          fill
          roundedClassName="rounded-full"
          className="bg-sam-surface"
          fallbackSrc=""
          fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
        />
      </div>
      <div className="min-w-0 flex-1 pr-2">
        <p className={`${Sam.text.body} font-semibold text-sam-fg truncate`}>{user.label}</p>
        {handle ? (
          <p className={`${Sam.text.helper} text-sam-muted truncate`}>{handle}</p>
        ) : null}
      </div>
      <div className="shrink-0">{statusNode}</div>
    </>
  );

  if (selectable) {
    return (
      <label className="flex cursor-pointer items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
        {body}
      </label>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
      {body}
    </div>
  );
}
