"use client";

import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import type { useI18n } from "@/components/i18n/AppLanguageProvider";

type Translate = ReturnType<typeof useI18n>["t"];

export type CommunityMessengerPrivateGroupCreatePanelProps = {
  t: Translate;
  groupTitle: string;
  onGroupTitleChange: (value: string) => void;
  groupTitlePreview: string;
  groupMembers: string[];
  selectedMemberProfiles: CommunityMessengerProfileLite[];
  onClearSelection: () => void;
  onToggleMember: (user: CommunityMessengerProfileLite, checked: boolean) => void;
  onBack: () => void;
  inviteSearchQuery: string;
  onInviteSearchQueryChange: (value: string) => void;
  inviteSearchBusy: boolean;
  inviteSearchFailed: boolean;
  filteredFriends: CommunityMessengerProfileLite[];
  nonFriendSearchResults: CommunityMessengerProfileLite[];
  hasFriends: boolean;
  showInviteSearchEmpty: boolean;
};

function GroupInviteMemberRow({
  user,
  checked,
  helper,
  onToggle,
}: {
  user: CommunityMessengerProfileLite;
  checked: boolean;
  helper: string;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-ui-rect border border-sam-border-soft px-3 py-3">
      <div className="min-w-0 pr-2">
        <p className="sam-text-body font-medium text-sam-fg">{user.label}</p>
        <p className="sam-text-helper text-sam-muted">{helper}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
        className="h-4 w-4 shrink-0 rounded border-sam-border text-sam-fg focus:ring-sam-border"
      />
    </label>
  );
}

export function CommunityMessengerPrivateGroupCreatePanel({
  t,
  groupTitle,
  onGroupTitleChange,
  groupTitlePreview,
  groupMembers,
  selectedMemberProfiles,
  onClearSelection,
  onToggleMember,
  onBack,
  inviteSearchQuery,
  onInviteSearchQueryChange,
  inviteSearchBusy,
  inviteSearchFailed,
  filteredFriends,
  nonFriendSearchResults,
  hasFriends,
  showInviteSearchEmpty,
}: CommunityMessengerPrivateGroupCreatePanelProps) {
  const inviteSearchNormalized = inviteSearchQuery.trim();

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="sam-text-body-secondary font-medium text-sam-fg">{t("nav_messenger_private_group")}</p>
          <h2 className="mt-1 sam-text-page-title font-semibold text-sam-fg">{t("cm_ui_create_friend_invite_group")}</h2>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-helper text-sam-fg"
        >
          {t("tier1_back")}
        </button>
      </div>
      <input
        value={groupTitle}
        onChange={(e) => onGroupTitleChange(e.target.value)}
        placeholder={t("cm_ui_group_title_placeholder_example")}
        className="mt-4 h-11 w-full rounded-ui-rect border border-sam-border px-3 sam-text-body outline-none focus:border-sam-border"
      />
      <div className="mt-3 flex items-center justify-between gap-3 sam-text-helper text-sam-muted">
        <span>{t("cm_ui_selected_members_count", { count: groupMembers.length })}</span>
        {groupMembers.length ? (
          <button
            type="button"
            onClick={onClearSelection}
            className="rounded-ui-rect border border-sam-border px-3 py-1.5 sam-text-helper font-medium text-sam-fg"
          >
            {t("cm_ui_clear_selection")}
          </button>
        ) : null}
      </div>
      {groupTitlePreview ? (
        <div className="mt-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 sam-text-helper text-sam-muted">
          {t("cm_ui_upcoming_group_name")}: <span className="font-semibold text-sam-fg">{groupTitlePreview}</span>
        </div>
      ) : null}
      {selectedMemberProfiles.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedMemberProfiles.map((member) => (
            <button
              key={`group-selected-${member.id}`}
              type="button"
              onClick={() => onToggleMember(member, false)}
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper font-medium text-sam-fg"
            >
              {member.label} ×
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-4">
        <input
          value={inviteSearchQuery}
          onChange={(e) => onInviteSearchQueryChange(e.target.value.slice(0, 40))}
          maxLength={40}
          placeholder={t("cm_ui_group_invite_search_placeholder")}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="h-10 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 sam-text-body outline-none focus:border-sam-border"
        />
        {inviteSearchBusy ? (
          <p className="mt-2 sam-text-helper text-sam-muted">{t("common_loading")}</p>
        ) : null}
      </div>
      {inviteSearchNormalized && nonFriendSearchResults.length ? (
        <div className="mt-4">
          <p className="sam-text-body-secondary font-semibold text-sam-fg">{t("cm_ui_group_invite_section_users")}</p>
          <div className="mt-2 max-h-[180px] space-y-2 overflow-y-auto">
            {nonFriendSearchResults.map((user) => (
              <GroupInviteMemberRow
                key={`group-user-result-${user.id}`}
                user={user}
                checked={groupMembers.includes(user.id)}
                helper={user.subtitle ?? t("cm_ui_group_invite_section_users")}
                onToggle={(checked) => onToggleMember(user, checked)}
              />
            ))}
          </div>
        </div>
      ) : null}
      {showInviteSearchEmpty ? (
        <p className="mt-3 sam-text-helper text-sam-muted">{t("cm_ui_no_search_results")}</p>
      ) : null}
      {inviteSearchFailed ? (
        <p className="mt-3 sam-text-helper text-sam-muted">{t("nav_messenger_action_failed")}</p>
      ) : null}
      <div className="mt-4">
        <p className="sam-text-body-secondary font-semibold text-sam-fg">{t("cm_ui_group_invite_section_friends")}</p>
        <div className="mt-3 max-h-[240px] space-y-2 overflow-y-auto">
          {filteredFriends.map((friend) => {
            const hiddenSelected = Boolean(friend.isHiddenFriend);
            const friendHelper = hiddenSelected
              ? [friend.subtitle, t("cm_ui_hidden_friend")].filter(Boolean).join(" · ")
              : (friend.subtitle ?? t("nav_messenger_friend"));
            return (
              <GroupInviteMemberRow
                key={friend.id}
                user={friend}
                checked={groupMembers.includes(friend.id)}
                helper={friendHelper}
                onToggle={(checked) => onToggleMember(friend, checked)}
              />
            );
          })}
        </div>
        {hasFriends && !filteredFriends.length ? (
          <p className="mt-3 sam-text-helper text-sam-muted">{t("cm_ui_no_search_results")}</p>
        ) : null}
        {!hasFriends ? (
          <p className="mt-3 sam-text-helper text-sam-muted">{t("cm_ui_group_invite_empty_friends")}</p>
        ) : null}
      </div>
    </>
  );
}
