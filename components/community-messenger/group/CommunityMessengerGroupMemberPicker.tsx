"use client";

import { useEffect, useMemo, useState } from "react";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import type { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  GROUP_MEMBER_PICKER_ELIGIBILITY,
  isGroupMemberPickerSelectable,
  resolveGroupMemberPickerEligibility,
} from "@/lib/community-messenger/group/group-member-picker-eligibility";
import { useGroupMemberPickerUserSearch } from "@/lib/community-messenger/group/use-group-member-picker-user-search";
import { CommunityMessengerGroupMemberPickerRow } from "@/components/community-messenger/group/CommunityMessengerGroupMemberPickerRow";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import { Sam } from "@/lib/ui/css-vars";
import { COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH } from "@/lib/community-messenger/user-public-id-search";

type Translate = ReturnType<typeof useI18n>["t"];

export type CommunityMessengerGroupMemberPickerProps = {
  t: Translate;
  mode: "create" | "invite";
  viewerUserId: string | null | undefined;
  friends: CommunityMessengerProfileLite[];
  /** Room members — invite mode marks ALREADY_MEMBER. Create typically empty. */
  memberIds?: ReadonlySet<string>;
  selectedIds: string[];
  onSelectedIdsChange: (next: string[]) => void;
  /** Optional profile cache so selected chips keep labels after search clears. */
  selectedProfiles?: Record<string, CommunityMessengerProfileLite>;
  onSelectedProfileRemember?: (user: CommunityMessengerProfileLite) => void;
  pendingFriendRequestIds?: ReadonlySet<string>;
  onFriendRequest: (user: CommunityMessengerProfileLite) => void | Promise<void>;
  friendRequestBusyUserId?: string | null;
  /** Primary CTA owned by Create/Invite wrapper (mutation stays outside picker). */
  primaryCta: {
    label: string;
    disabled: boolean;
    busy?: boolean;
    onClick: () => void;
  };
  /** Invite mode policy notice under CTA — secondary hierarchy only. */
  showFriendOnlyPolicyNotice?: boolean;
};

type PickerTab = "search" | "friends";

/**
 * Shared member discovery SSOT for private group Create + Invite.
 * Owns: query · search results · friend list presentation · selection · eligibility CTAs.
 * Does not own create/invite mutation.
 */
export function CommunityMessengerGroupMemberPicker({
  t,
  mode,
  viewerUserId,
  friends,
  memberIds,
  selectedIds,
  onSelectedIdsChange,
  selectedProfiles,
  onSelectedProfileRemember,
  pendingFriendRequestIds,
  onFriendRequest,
  friendRequestBusyUserId,
  primaryCta,
  showFriendOnlyPolicyNotice = mode === "invite",
}: CommunityMessengerGroupMemberPickerProps) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<PickerTab>("friends");
  const [localPending, setLocalPending] = useState<Set<string>>(() => new Set());

  const memberIdSet = useMemo(() => memberIds ?? new Set<string>(), [memberIds]);
  const pendingSet = useMemo(() => {
    const next = new Set(pendingFriendRequestIds ?? []);
    for (const id of localPending) next.add(id);
    return next;
  }, [localPending, pendingFriendRequestIds]);

  const search = useGroupMemberPickerUserSearch({
    enabled: true,
    query,
    viewerUserId,
  });

  const queryTrimmed = query.trim();
  const searchActive = queryTrimmed.length >= COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH;

  useEffect(() => {
    if (searchActive) setTab("search");
  }, [searchActive]);

  const friendIdSet = useMemo(() => new Set(friends.map((f) => f.id)), [friends]);

  const filteredFriends = useMemo(() => {
    const keyword = queryTrimmed.toLowerCase();
    const list = friends.filter((friend) => {
      const eligibility = resolveGroupMemberPickerEligibility({
        userId: friend.id,
        viewerUserId,
        isFriend: true,
        memberIds: memberIdSet,
        pendingFriendRequestIds: pendingSet,
      });
      if (eligibility === GROUP_MEMBER_PICKER_ELIGIBILITY.SELF) return false;
      if (!keyword) return true;
      const haystack = [friend.label, friend.subtitle ?? ""].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
    return list;
  }, [friends, memberIdSet, pendingSet, queryTrimmed, viewerUserId]);

  const searchRows = useMemo(() => {
    if (!searchActive) return [];
    return search.results.filter((user) => {
      const eligibility = resolveGroupMemberPickerEligibility({
        userId: user.id,
        viewerUserId,
        isFriend: user.isFriend || friendIdSet.has(user.id),
        memberIds: memberIdSet,
        pendingFriendRequestIds: pendingSet,
      });
      return eligibility !== GROUP_MEMBER_PICKER_ELIGIBILITY.SELF;
    });
  }, [friendIdSet, memberIdSet, pendingSet, search.results, searchActive, viewerUserId]);

  const selectedUsers = useMemo(() => {
    const byId = new Map<string, CommunityMessengerProfileLite>();
    for (const friend of friends) byId.set(friend.id, friend);
    for (const user of search.results) byId.set(user.id, user);
    if (selectedProfiles) {
      for (const [id, profile] of Object.entries(selectedProfiles)) {
        byId.set(id, profile);
      }
    }
    return selectedIds
      .map((id) => byId.get(id))
      .filter((u): u is CommunityMessengerProfileLite => Boolean(u));
  }, [friends, search.results, selectedIds, selectedProfiles]);

  const toggleSelect = (user: CommunityMessengerProfileLite, checked: boolean) => {
    const eligibility = resolveGroupMemberPickerEligibility({
      userId: user.id,
      viewerUserId,
      isFriend: user.isFriend || friendIdSet.has(user.id),
      memberIds: memberIdSet,
      pendingFriendRequestIds: pendingSet,
    });
    if (checked && !isGroupMemberPickerSelectable(eligibility)) return;
    onSelectedProfileRemember?.(user);
    if (checked) {
      onSelectedIdsChange(selectedIds.includes(user.id) ? selectedIds : [...selectedIds, user.id]);
      return;
    }
    onSelectedIdsChange(selectedIds.filter((id) => id !== user.id));
  };

  const handleFriendRequest = async (user: CommunityMessengerProfileLite) => {
    await onFriendRequest(user);
    setLocalPending((prev) => {
      const next = new Set(prev);
      next.add(user.id);
      return next;
    });
  };

  const listRows = tab === "search" ? searchRows : filteredFriends;
  const emptyFriends = friends.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-cm-group-member-picker={mode}>
      <div className="shrink-0">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, 40))}
          maxLength={40}
          placeholder={t("cm_ui_group_invite_search_placeholder")}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={`${Sam.input.base} h-11 w-full`}
          data-cm-group-member-picker-search=""
        />
        {search.busy ? (
          <p className={`mt-2 ${Sam.text.helper} text-sam-muted`}>{t("common_loading")}</p>
        ) : null}
        {search.failed ? (
          <p className={`mt-2 ${Sam.text.helper} text-sam-muted`}>{t("nav_messenger_action_failed")}</p>
        ) : null}
      </div>

      <div className={`mt-3 flex shrink-0 gap-4 border-b border-sam-border ${Sam.tabs.bar}`}>
        <button
          type="button"
          onClick={() => setTab("search")}
          className={
            tab === "search"
              ? `${Sam.tabs.tabActive} border-b-2 border-[color:var(--sam-brand,#2563eb)] pb-2`
              : `${Sam.tabs.tab} pb-2 text-sam-muted`
          }
        >
          {t("cm_ui_group_member_picker_search_tab", {
            count: searchActive ? searchRows.length : 0,
          })}
        </button>
        <button
          type="button"
          onClick={() => setTab("friends")}
          className={
            tab === "friends"
              ? `${Sam.tabs.tabActive} border-b-2 border-[color:var(--sam-brand,#2563eb)] pb-2`
              : `${Sam.tabs.tab} pb-2 text-sam-muted`
          }
        >
          {t("cm_ui_group_member_picker_friends_tab", { count: filteredFriends.length })}
        </button>
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
        {tab === "friends" && emptyFriends ? (
          <p className={`${Sam.text.helper} leading-5 text-sam-muted`}>
            {t("cm_ui_group_member_picker_empty_friends")}
          </p>
        ) : null}
        {tab === "search" && searchActive && !search.busy && searchRows.length === 0 && !search.failed ? (
          <p className={`${Sam.text.helper} text-sam-muted`}>{t("cm_ui_no_search_results")}</p>
        ) : null}
        {tab === "search" && !searchActive ? (
          <p className={`${Sam.text.helper} text-sam-muted`}>
            {t("cm_ui_group_member_picker_search_hint")}
          </p>
        ) : null}
        {listRows.map((user) => {
          const eligibility = resolveGroupMemberPickerEligibility({
            userId: user.id,
            viewerUserId,
            isFriend: user.isFriend || friendIdSet.has(user.id),
            memberIds: memberIdSet,
            pendingFriendRequestIds: pendingSet,
          });
          return (
            <CommunityMessengerGroupMemberPickerRow
              key={`${mode}-${tab}-${user.id}`}
              t={t}
              user={user}
              eligibility={eligibility}
              selected={selectedIds.includes(user.id)}
              friendRequestBusy={friendRequestBusyUserId === user.id}
              onToggleSelect={(checked) => toggleSelect(user, checked)}
              onFriendRequest={() => void handleFriendRequest(user)}
            />
          );
        })}
      </div>

      <div className="mt-4 shrink-0 border-t border-sam-border pt-3">
        {selectedUsers.length ? (
          <div className="mb-3 flex items-center gap-2 overflow-x-auto">
            {selectedUsers.map((user) => (
              <button
                key={`selected-chip-${user.id}`}
                type="button"
                onClick={() => toggleSelect(user, false)}
                className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-sam-border"
                aria-label={user.label}
              >
                <SamarketThumbnail
                  src={resolveUserAvatarImageSrc(user.avatarUrl)}
                  fill
                  roundedClassName="rounded-full"
                  className="bg-sam-surface"
                  fallbackSrc=""
                  fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
                />
              </button>
            ))}
            <span className={`${Sam.text.helper} shrink-0 text-sam-muted`}>
              {t("cm_ui_group_member_picker_selected_count", { count: selectedIds.length })}
            </span>
          </div>
        ) : (
          <p className={`mb-3 ${Sam.text.helper} text-sam-muted`}>
            {t("cm_ui_group_member_picker_selected_count", { count: 0 })}
          </p>
        )}
        <button
          type="button"
          onClick={primaryCta.onClick}
          disabled={primaryCta.disabled || primaryCta.busy}
          className={`${Sam.btn.primaryCombo} ${Sam.btn.block} disabled:opacity-40`}
          data-cm-group-member-picker-primary=""
        >
          {primaryCta.busy ? t("common_loading") : primaryCta.label}
        </button>
        {showFriendOnlyPolicyNotice ? (
          <p className={`mt-3 ${Sam.text.helper} leading-5 text-sam-muted`}>
            {t("cm_ui_group_member_picker_friend_only_notice")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
