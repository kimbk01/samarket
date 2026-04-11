"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { MessengerLineFriendRow } from "@/components/community-messenger/MessengerLineFriendRow";
import { MessengerEmptyCard } from "@/components/community-messenger/MessengerSearchSheet";
import { SettingsToggleRow } from "@/components/community-messenger/MessengerSheetUi";
import type { CommunityMessengerLocalSettings } from "@/lib/community-messenger/preferences";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

function AvatarCircle({
  src,
  label,
  sizeClassName,
  textClassName,
}: {
  src?: string | null;
  label: string;
  sizeClassName: string;
  textClassName: string;
}) {
  const safeSrc = typeof src === "string" && src.trim().length > 0 ? src.trim() : "";
  const [imageFailed, setImageFailed] = useState(false);
  const initial = label.trim().slice(0, 1).toUpperCase() || "?";
  useEffect(() => {
    setImageFailed(false);
  }, [safeSrc]);
  return (
    <div className={`shrink-0 overflow-hidden rounded-full bg-gray-100 ${sizeClassName}`}>
      {safeSrc && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={safeSrc} alt="" className="h-full w-full object-cover" onError={() => setImageFailed(true)} />
      ) : (
        <div className={`flex h-full w-full items-center justify-center font-semibold text-gray-600 ${textClassName}`}>
          {initial}
        </div>
      )}
    </div>
  );
}

function InfoSection({
  title,
  subtitle,
  sectionRef,
  children,
}: {
  title: string;
  subtitle?: string;
  sectionRef?: { current: HTMLElement | null };
  children: ReactNode;
}) {
  return (
    <section ref={sectionRef} className="rounded-ui-rect border border-gray-200 bg-white p-4">
      <div className="mb-3">
        <h2 className="text-[16px] font-semibold text-gray-900">{title}</h2>
        {subtitle ? <p className="mt-1 text-[13px] text-gray-500">{subtitle}</p> : null}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function ProfileCard({
  profile,
  actionSlot,
}: {
  profile: CommunityMessengerProfileLite;
  actionSlot: ReactNode;
}) {
  const avatarSrc = profile.avatarUrl?.trim() ? profile.avatarUrl.trim() : null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-ui-rect border border-gray-200 bg-white px-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <AvatarCircle src={avatarSrc} label={profile.label} sizeClassName="h-11 w-11" textClassName="text-[15px]" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-[14px] font-semibold text-gray-900">{profile.label}</p>
            {profile.isFavoriteFriend ? (
              <span className="rounded-ui-rect border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                즐겨찾기
              </span>
            ) : null}
            {profile.isHiddenFriend ? (
              <span className="rounded-ui-rect border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                숨김
              </span>
            ) : null}
            {profile.following ? (
              <span className="rounded-ui-rect border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                팔로우 중
              </span>
            ) : null}
          </div>
          <p className="truncate text-[12px] text-gray-500">{profile.subtitle ?? "SAMarket 사용자"}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actionSlot}</div>
    </div>
  );
}

export type MessengerFriendAddTab = "contacts" | "id";

type Props = {
  onClose: () => void;
  friendAddTab: MessengerFriendAddTab;
  onFriendAddTabChange: (tab: MessengerFriendAddTab) => void;
  localSettings: CommunityMessengerLocalSettings;
  updateLocalSetting: (key: keyof CommunityMessengerLocalSettings, value: boolean) => void;
  searchKeyword: string;
  onSearchKeywordChange: (value: string) => void;
  friendSearchRef: RefObject<HTMLInputElement | null>;
  onSearchUsers: () => void | Promise<void>;
  friendUserSearchAttempted: boolean;
  searchResults: CommunityMessengerProfileLite[];
  busyId: string | null;
  onToggleFollow: (userId: string) => void;
  onOpenProfile: (profile: CommunityMessengerProfileLite) => void;
  onPrefetchDirectRoom: (userId: string) => void;
  onRequestFriend: (userId: string) => void;
  onToggleBlock: (userId: string) => void;
  me: CommunityMessengerProfileLite | null;
  sortedFriends: CommunityMessengerProfileLite[];
  onToggleFavoriteFriend: (userId: string) => void;
  onRemoveFriend: (userId: string) => void;
};

export function MessengerFriendAddSheet({
  onClose,
  friendAddTab,
  onFriendAddTabChange,
  localSettings,
  updateLocalSetting,
  searchKeyword,
  onSearchKeywordChange,
  friendSearchRef,
  onSearchUsers,
  friendUserSearchAttempted,
  searchResults,
  busyId,
  onToggleFollow,
  onOpenProfile,
  onPrefetchDirectRoom,
  onRequestFriend,
  onToggleBlock,
  me,
  sortedFriends,
  onToggleFavoriteFriend,
  onRemoveFriend,
}: Props) {
  return (
    <div className="fixed inset-0 z-[43] flex flex-col justify-end bg-black/30">
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onClose} />
      <div className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[14px] border border-gray-200 bg-white shadow-[0_-3px_10px_rgba(17,24,39,0.04)]">
        <div className="flex shrink-0 items-center justify-between px-4 py-3.5">
          <p className="text-[17px] font-semibold text-gray-900">친구 추가</p>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-ui-rect text-gray-500 hover:bg-gray-100"
            aria-label="닫기"
            onClick={onClose}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-px border-y border-gray-100 bg-gray-100">
          <button
            type="button"
            onClick={() => {
              if (!localSettings.phoneFriendAddEnabled) return;
              onFriendAddTabChange("contacts");
            }}
            disabled={!localSettings.phoneFriendAddEnabled}
            className={`bg-white px-4 py-3 text-left ${!localSettings.phoneFriendAddEnabled ? "opacity-50" : ""}`}
          >
            <p className="text-[12px] font-medium text-gray-500">기본 흐름</p>
            <p className="mt-1 text-[14px] font-semibold text-gray-900">연락처로 친구 추가</p>
          </button>
          <button
            type="button"
            onClick={() => {
              onFriendAddTabChange("id");
              requestAnimationFrame(() => friendSearchRef.current?.focus());
            }}
            className="bg-white px-4 py-3 text-left"
          >
            <p className="text-[12px] font-medium text-gray-500">검색 기반</p>
            <p className="mt-1 text-[14px] font-semibold text-gray-900">ID / 닉네임으로 추가</p>
          </button>
        </div>
        <div className="flex shrink-0 border-b border-gray-200 px-4">
          <button
            type="button"
            onClick={() => {
              if (!localSettings.phoneFriendAddEnabled) return;
              onFriendAddTabChange("contacts");
            }}
            disabled={!localSettings.phoneFriendAddEnabled}
            className={`relative flex-1 py-3 text-[15px] ${
              friendAddTab === "contacts" ? "font-semibold text-gray-900" : "font-medium text-gray-500"
            }`}
          >
            연락처로 추가
            {friendAddTab === "contacts" && localSettings.phoneFriendAddEnabled ? (
              <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-ui-rect bg-gray-900" />
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => onFriendAddTabChange("id")}
            className={`relative flex-1 py-3 text-[15px] ${
              friendAddTab === "id" ? "font-semibold text-gray-900" : "font-medium text-gray-500"
            }`}
          >
            ID로 추가
            {friendAddTab === "id" ? (
              <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-ui-rect bg-gray-900" />
            ) : null}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {friendAddTab === "contacts" ? (
            <div className="space-y-3">
              <div className="rounded-ui-rect border border-gray-200 bg-white px-4 py-4">
                <p className="text-[14px] font-semibold text-gray-900">연락처로 친구 추가</p>
                <p className="mt-1 text-[12px] text-gray-500">
                  {localSettings.contactAutoAddEnabled ? "자동 추가 켜짐" : "자동 추가 꺼짐"}
                </p>
              </div>
              <div className="overflow-hidden rounded-ui-rect border border-gray-200 bg-white">
                <SettingsToggleRow
                  title="전화번호로 친구 추가"
                  description="연락처 탭 사용"
                  checked={localSettings.phoneFriendAddEnabled}
                  onChange={(next) => updateLocalSetting("phoneFriendAddEnabled", next)}
                />
                <SettingsToggleRow
                  title="연락처 자동 추가"
                  description="모바일 연동 시 자동 반영"
                  checked={localSettings.contactAutoAddEnabled}
                  onChange={(next) => updateLocalSetting("contactAutoAddEnabled", next)}
                />
              </div>
              <p className="rounded-ui-rect border border-dashed border-gray-200 bg-white px-4 py-4 text-center text-[13px] text-gray-600">
                웹에서는 ID 검색으로 바로 추가할 수 있습니다.
              </p>
            </div>
          ) : (
            <>
              <div className="relative">
                <div className="flex justify-end text-[12px] tabular-nums text-gray-400">{searchKeyword.length}/20</div>
                <input
                  ref={friendSearchRef}
                  value={searchKeyword}
                  onChange={(e) => onSearchKeywordChange(e.target.value.slice(0, 20))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void onSearchUsers();
                    }
                  }}
                  maxLength={20}
                  placeholder="닉네임 또는 아이디"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full border-0 border-b border-gray-300 bg-transparent px-0 py-2 text-[16px] text-gray-900 outline-none ring-0 placeholder:text-gray-400 focus:border-gray-500"
                />
                <p className="mt-2 text-[12px] text-gray-500">검색 허용 사용자만 표시됩니다.</p>
                <button
                  type="button"
                  onClick={() => void onSearchUsers()}
                  disabled={busyId === "user-search"}
                  className="mt-4 w-full rounded-ui-rect border border-gray-200 bg-white py-3 text-[15px] font-semibold text-gray-900 disabled:opacity-50"
                >
                  {busyId === "user-search" ? "검색 중…" : "검색"}
                </button>
              </div>
              <div className="mt-4 space-y-2">
                {searchResults.length === 0 ? (
                  <p className="rounded-ui-rect border border-gray-200 bg-white px-3 py-4 text-center text-[13px] text-gray-500">
                    {!friendUserSearchAttempted
                      ? "닉네임 또는 아이디를 입력한 뒤 검색을 눌러 주세요."
                      : "검색 결과가 없습니다."}
                  </p>
                ) : (
                  searchResults.map((user) => (
                    <ProfileCard
                      key={user.id}
                      profile={user}
                      actionSlot={
                        <>
                          <button
                            type="button"
                            onClick={() => void onToggleFollow(user.id)}
                            disabled={busyId === `follow:${user.id}`}
                            className="rounded-ui-rect border border-gray-200 px-3 py-2 text-[12px] font-medium text-gray-700"
                          >
                            {user.following ? "팔로우 해제" : "팔로우"}
                          </button>
                          {user.isFriend ? (
                            <button
                              type="button"
                              onPointerEnter={() => onPrefetchDirectRoom(user.id)}
                              onClick={() => onOpenProfile(user)}
                              disabled={busyId === `room:${user.id}` || busyId === `call:voice:${user.id}` || busyId === `call:video:${user.id}`}
                              className="rounded-ui-rect border border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-gray-900"
                            >
                              프로필
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void onRequestFriend(user.id)}
                              disabled={busyId === `friend:${user.id}` || user.blocked}
                              className="rounded-ui-rect border border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-gray-900 disabled:opacity-40"
                            >
                              친구 요청
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void onToggleBlock(user.id)}
                            disabled={busyId === `block:${user.id}`}
                            className="rounded-ui-rect border border-gray-200 bg-white px-3 py-2 text-[12px] font-medium text-gray-700"
                          >
                            {user.blocked ? "차단 해제" : "차단"}
                          </button>
                        </>
                      }
                    />
                  ))
                )}
              </div>
            </>
          )}
          <div className="mt-6 space-y-4">
            <InfoSection title="내 프로필">
              <ProfileCard
                profile={
                  me ?? {
                    id: "me",
                    label: "내 프로필",
                    avatarUrl: null,
                    following: false,
                    blocked: false,
                    isFriend: false,
                    isFavoriteFriend: false,
                  }
                }
                actionSlot={<span className="text-[12px] text-gray-500">메신저 기본 프로필</span>}
              />
            </InfoSection>
            <InfoSection title={`친구 ${sortedFriends.length}`}>
              {sortedFriends.length ? (
                sortedFriends.map((friend) => (
                  <MessengerLineFriendRow
                    key={friend.id}
                    friend={friend}
                    busyFavorite={busyId === `favorite:${friend.id}`}
                    busyDelete={busyId === `remove-friend:${friend.id}`}
                    onRowPress={() => onOpenProfile(friend)}
                    onToggleFavorite={() => void onToggleFavoriteFriend(friend.id)}
                    onDelete={() => onRemoveFriend(friend.id)}
                  />
                ))
              ) : (
                <MessengerEmptyCard message="아직 친구가 없습니다. ID로 추가 탭에서 검색해 보세요." />
              )}
            </InfoSection>
          </div>
        </div>
      </div>
    </div>
  );
}
