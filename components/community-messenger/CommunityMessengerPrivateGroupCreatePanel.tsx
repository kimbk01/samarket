"use client";

import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import type { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CommunityMessengerGroupMemberPicker } from "@/components/community-messenger/group/CommunityMessengerGroupMemberPicker";

type Translate = ReturnType<typeof useI18n>["t"];

export type PrivateGroupCreateSubStep = "members" | "details";

export type CommunityMessengerPrivateGroupCreatePanelProps = {
  t: Translate;
  subStep: PrivateGroupCreateSubStep;
  groupTitle: string;
  onGroupTitleChange: (value: string) => void;
  groupTitlePreview: string;
  groupMembers: string[];
  selectedMemberProfiles: CommunityMessengerProfileLite[];
  selectedProfilesById: Record<string, CommunityMessengerProfileLite>;
  onSelectedProfilesRemember: (user: CommunityMessengerProfileLite) => void;
  onSelectedIdsChange: (ids: string[]) => void;
  onClearSelection: () => void;
  onBack: () => void;
  onContinueFromMembers: () => void;
  viewerUserId: string | null | undefined;
  friends: CommunityMessengerProfileLite[];
  onFriendRequest: (user: CommunityMessengerProfileLite) => void | Promise<void>;
  friendRequestBusyUserId?: string | null;
};

/**
 * Private group Create — thin wrapper over shared member picker SSOT.
 * Mutation (POST /groups/create) stays in Home.
 */
export function CommunityMessengerPrivateGroupCreatePanel({
  t,
  subStep,
  groupTitle,
  onGroupTitleChange,
  groupTitlePreview,
  groupMembers,
  selectedMemberProfiles,
  selectedProfilesById,
  onSelectedProfilesRemember,
  onSelectedIdsChange,
  onClearSelection,
  onBack,
  onContinueFromMembers,
  viewerUserId,
  friends,
  onFriendRequest,
  friendRequestBusyUserId,
}: CommunityMessengerPrivateGroupCreatePanelProps) {
  if (subStep === "details") {
    return (
      <>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="sam-text-body-secondary font-medium text-sam-fg">{t("nav_messenger_private_group")}</p>
            <h2 className="mt-1 sam-text-page-title font-semibold text-sam-fg">
              {t("cm_ui_new_group_details_title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-helper text-sam-fg"
          >
            {t("tier1_back")}
          </button>
        </div>
        <div className="mt-4 flex h-20 w-20 items-center justify-center rounded-full bg-sam-surface text-sam-muted sam-text-page-title">
          {(groupTitle.trim() || "G").slice(0, 1)}
        </div>
        <input
          value={groupTitle}
          onChange={(e) => onGroupTitleChange(e.target.value)}
          placeholder={t("cm_ui_group_title_placeholder_example")}
          className="mt-4 h-11 w-full rounded-ui-rect border border-sam-border px-3 sam-text-body outline-none focus:border-sam-border"
        />
        <p className="mt-3 sam-text-helper text-sam-muted">
          {t("cm_ui_selected_members_count", { count: groupMembers.length })}
        </p>
        {selectedMemberProfiles.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedMemberProfiles.map((member) => (
              <span
                key={`group-detail-selected-${member.id}`}
                className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper font-medium text-sam-fg"
              >
                {member.label}
              </span>
            ))}
          </div>
        ) : null}
        {groupTitlePreview ? (
          <div className="mt-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 sam-text-helper text-sam-muted">
            {t("cm_ui_upcoming_group_name")}: <span className="font-semibold text-sam-fg">{groupTitlePreview}</span>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <div>
          <p className="sam-text-body-secondary font-medium text-sam-fg">{t("nav_messenger_private_group")}</p>
          <h2 className="mt-1 sam-text-page-title font-semibold text-sam-fg">{t("cm_ui_new_group_title")}</h2>
        </div>
        <div className="flex items-center gap-2">
          {groupMembers.length ? (
            <button
              type="button"
              onClick={onClearSelection}
              className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-helper text-sam-fg"
            >
              {t("cm_ui_clear_selection")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onBack}
            className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-helper text-sam-fg"
            aria-label={t("nav_close")}
          >
            {t("nav_close")}
          </button>
        </div>
      </div>
      <CommunityMessengerGroupMemberPicker
        t={t}
        mode="create"
        viewerUserId={viewerUserId}
        friends={friends}
        selectedIds={groupMembers}
        onSelectedIdsChange={onSelectedIdsChange}
        selectedProfiles={selectedProfilesById}
        onSelectedProfileRemember={onSelectedProfilesRemember}
        onFriendRequest={onFriendRequest}
        friendRequestBusyUserId={friendRequestBusyUserId}
        showFriendOnlyPolicyNotice={false}
        primaryCta={{
          label:
            groupMembers.length > 0
              ? t("cm_ui_group_create_with_n", { count: groupMembers.length })
              : t("cm_ui_group_create_with_n", { count: 0 }),
          disabled: groupMembers.length === 0,
          onClick: onContinueFromMembers,
        }}
      />
    </div>
  );
}
