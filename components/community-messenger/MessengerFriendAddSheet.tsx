"use client";

import { useCallback, useRef, useState, type RefObject } from "react";
import { SettingsToggleRow } from "@/components/community-messenger/MessengerSheetUi";
import type { CommunityMessengerLocalSettings } from "@/lib/community-messenger/preferences";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

export type MessengerFriendAddTab = "id" | "contacts" | "invite";

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
  onOpenProfile: (profile: CommunityMessengerProfileLite) => void;
  onPrefetchDirectRoom: (userId: string) => void;
  onRequestFriend: (userId: string) => void;
  /** 초대 링크·QR 탭에 표시할 공개 URL */
  inviteUrl: string;
};

const TAB_ORDER: MessengerFriendAddTab[] = ["id", "contacts", "invite"];

function tabLabel(t: MessengerFriendAddTab): string {
  switch (t) {
    case "id":
      return "ID · 닉네임";
    case "contacts":
      return "연락처";
    case "invite":
      return "QR · 초대";
    default:
      return "";
  }
}

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
  onOpenProfile,
  onPrefetchDirectRoom,
  onRequestFriend,
  inviteUrl,
}: Props) {
  const [copied, setCopied] = useState(false);

  const copyInvite = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [inviteUrl]);

  return (
    <div className="fixed inset-0 z-[43] flex flex-col justify-end bg-black/30">
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onClose} />
      <div className="flex max-h-[78vh] w-full flex-col overflow-hidden rounded-t-[12px] border border-ui-border bg-ui-surface shadow-[var(--ui-shadow-card)]">
        <div className="flex shrink-0 items-center justify-between border-b border-ui-border px-3 py-2.5">
          <p className="text-[16px] font-semibold text-ui-fg">친구 추가</p>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-ui-rect text-ui-muted active:bg-ui-hover"
            aria-label="닫기"
            onClick={onClose}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex shrink-0 border-b border-ui-border">
          {TAB_ORDER.map((tab) => {
            const disabled = tab === "contacts" && !localSettings.phoneFriendAddEnabled;
            const active = friendAddTab === tab;
            return (
              <button
                key={tab}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  onFriendAddTabChange(tab);
                  if (tab === "id") {
                    requestAnimationFrame(() => friendSearchRef.current?.focus());
                  }
                }}
                className={`relative min-w-0 flex-1 px-1 py-2.5 text-[12px] font-medium ${
                  active ? "text-ui-fg" : "text-ui-muted"
                } ${disabled ? "opacity-40" : ""}`}
              >
                <span className="line-clamp-2">{tabLabel(tab)}</span>
                {active ? <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-ui-fg" /> : null}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          {friendAddTab === "contacts" ? (
            <div className="space-y-2">
              <p className="text-[12px] text-ui-muted">연락처 동기화는 모바일 앱·지원 브라우저에서 사용할 수 있습니다.</p>
              <div className="overflow-hidden rounded-ui-rect border border-ui-border">
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
              <p className="rounded-ui-rect border border-dashed border-ui-border px-3 py-3 text-center text-[12px] text-ui-muted">
                웹에서는 ID 검색 탭으로 바로 추가할 수 있습니다.
              </p>
            </div>
          ) : null}

          {friendAddTab === "id" ? (
            <div className="space-y-3">
              <div>
                <div className="flex justify-end text-[11px] tabular-nums text-ui-muted">{searchKeyword.length}/20</div>
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
                  className="w-full border-0 border-b border-ui-border bg-transparent px-0 py-2 text-[15px] text-ui-fg outline-none placeholder:text-ui-muted focus:border-ui-fg"
                />
                <p className="mt-1.5 text-[11px] text-ui-muted">검색 허용 사용자만 표시됩니다.</p>
                <button
                  type="button"
                  onClick={() => void onSearchUsers()}
                  disabled={busyId === "user-search"}
                  className="mt-3 w-full rounded-ui-rect border border-ui-fg bg-ui-fg py-2.5 text-[14px] font-semibold text-ui-surface disabled:opacity-50"
                >
                  {busyId === "user-search" ? "검색 중…" : "검색"}
                </button>
              </div>
              <div className="divide-y divide-ui-border overflow-hidden rounded-ui-rect border border-ui-border bg-ui-surface">
                {searchResults.length === 0 ? (
                  <p className="px-3 py-4 text-center text-[12px] text-ui-muted">
                    {!friendUserSearchAttempted ? "검색어를 입력한 뒤 검색을 눌러 주세요." : "검색 결과가 없습니다."}
                  </p>
                ) : (
                  searchResults.map((user) => (
                    <SearchResultRow
                      key={user.id}
                      user={user}
                      busyId={busyId}
                      onOpenProfile={onOpenProfile}
                      onPrefetchDirectRoom={onPrefetchDirectRoom}
                      onRequestFriend={onRequestFriend}
                    />
                  ))
                )}
              </div>
            </div>
          ) : null}

          {friendAddTab === "invite" ? (
            <div className="space-y-3">
              <p className="text-[12px] text-ui-muted">이 링크를 공유하면 상대가 메신저에서 나를 찾을 수 있습니다. QR 스캔은 동일 링크를 사용합니다.</p>
              <div className="rounded-ui-rect border border-ui-border bg-ui-page px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-ui-muted">초대 URL</p>
                <p className="mt-1 break-all text-[12px] leading-snug text-ui-fg">{inviteUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => void copyInvite()}
                className="w-full rounded-ui-rect border border-ui-border bg-ui-surface py-2.5 text-[14px] font-semibold text-ui-fg"
              >
                {copied ? "복사됨" : "링크 복사"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SearchResultRow({
  user,
  busyId,
  onOpenProfile,
  onPrefetchDirectRoom,
  onRequestFriend,
}: {
  user: CommunityMessengerProfileLite;
  busyId: string | null;
  onOpenProfile: (profile: CommunityMessengerProfileLite) => void;
  onPrefetchDirectRoom: (userId: string) => void;
  onRequestFriend: (userId: string) => void;
}) {
  const prefetchOnceRef = useRef(false);
  const avatarSrc = user.avatarUrl?.trim() ? user.avatarUrl.trim() : null;
  const initial = user.label.trim().slice(0, 1) || "?";

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <button
        type="button"
        onPointerDown={() => {
          if (prefetchOnceRef.current) return;
          prefetchOnceRef.current = true;
          onPrefetchDirectRoom(user.id);
        }}
        onClick={() => onOpenProfile(user)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left active:bg-ui-hover"
      >
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-ui-hover">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[13px] font-semibold text-ui-muted">{initial}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-ui-fg">{user.label}</p>
          <p className="truncate text-[11px] text-ui-muted">{user.subtitle ?? "SAMarket"}</p>
        </div>
      </button>
      {user.isFriend ? (
        <span className="shrink-0 text-[12px] text-ui-muted">친구</span>
      ) : user.blocked ? (
        <span className="shrink-0 text-[12px] text-ui-muted">차단됨</span>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void onRequestFriend(user.id);
          }}
          disabled={busyId === `friend:${user.id}`}
          className="shrink-0 rounded-ui-rect border border-ui-fg bg-ui-fg px-3 py-1.5 text-[12px] font-semibold text-ui-surface disabled:opacity-40"
        >
          요청
        </button>
      )}
    </div>
  );
}
