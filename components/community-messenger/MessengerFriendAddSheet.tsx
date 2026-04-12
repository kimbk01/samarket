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
      <div
        data-messenger-shell
        className="flex max-h-[78vh] w-full flex-col overflow-hidden rounded-t-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] shadow-[var(--messenger-shadow-soft)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--messenger-divider)] px-3 py-2.5">
          <p className="text-[16px] font-semibold" style={{ color: "var(--messenger-text)" }}>
            친구 추가
          </p>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--messenger-text-secondary)] active:bg-[color:var(--messenger-primary-soft)]"
            aria-label="닫기"
            onClick={onClose}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex shrink-0 border-b border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)]">
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
                  disabled ? "opacity-40" : ""
                } ${active ? "font-semibold" : ""}`}
                style={{ color: active ? "var(--messenger-text)" : "var(--messenger-text-secondary)" }}
              >
                <span className="line-clamp-2">{tabLabel(tab)}</span>
                {active ? (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                    style={{ backgroundColor: "var(--messenger-primary)" }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[color:var(--messenger-bg)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          {friendAddTab === "contacts" ? (
            <div className="space-y-2">
              <p className="text-[12px]" style={{ color: "var(--messenger-text-secondary)" }}>
                연락처 동기화는 모바일 앱·지원 브라우저에서 사용할 수 있습니다.
              </p>
              <div className="overflow-hidden rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] shadow-[var(--messenger-shadow-soft)]">
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
              <p
                className="rounded-[var(--messenger-radius-md)] border border-dashed border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] px-3 py-3 text-center text-[12px]"
                style={{ color: "var(--messenger-text-secondary)" }}
              >
                웹에서는 ID 검색 탭으로 바로 추가할 수 있습니다.
              </p>
            </div>
          ) : null}

          {friendAddTab === "id" ? (
            <div className="space-y-3">
              <div>
                <div className="flex justify-end text-[11px] tabular-nums" style={{ color: "var(--messenger-text-secondary)" }}>
                  {searchKeyword.length}/20
                </div>
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
                  className="w-full rounded-[var(--messenger-radius-sm)] border border-transparent bg-[color:var(--messenger-primary-soft)] px-2 py-2 text-[15px] outline-none transition-[border,box-shadow] placeholder:text-[color:var(--messenger-text-secondary)] focus:border-[color:var(--messenger-primary)] focus:bg-[color:var(--messenger-surface)] focus:ring-1 focus:ring-[color:var(--messenger-primary)]"
                  style={{ color: "var(--messenger-text)" }}
                />
                <p className="mt-1.5 text-[11px]" style={{ color: "var(--messenger-text-secondary)" }}>
                  검색 허용 사용자만 표시됩니다.
                </p>
                <button
                  type="button"
                  onClick={() => void onSearchUsers()}
                  disabled={busyId === "user-search"}
                  className="mt-3 w-full rounded-[var(--messenger-radius-md)] bg-[color:var(--messenger-primary)] py-2.5 text-[14px] font-semibold text-white disabled:opacity-50 active:opacity-90"
                >
                  {busyId === "user-search" ? "검색 중…" : "검색"}
                </button>
              </div>
              <div className="divide-y divide-[color:var(--messenger-divider)] overflow-hidden rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] shadow-[var(--messenger-shadow-soft)]">
                {searchResults.length === 0 ? (
                  <p className="px-3 py-4 text-center text-[12px]" style={{ color: "var(--messenger-text-secondary)" }}>
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
              <p className="text-[12px]" style={{ color: "var(--messenger-text-secondary)" }}>
                이 링크를 공유하면 상대가 메신저에서 나를 찾을 수 있습니다. QR 스캔은 동일 링크를 사용합니다.
              </p>
              <div className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-primary-soft)] px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--messenger-text-secondary)" }}>
                  초대 URL
                </p>
                <p className="mt-1 break-all text-[12px] leading-snug" style={{ color: "var(--messenger-text)" }}>
                  {inviteUrl}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyInvite()}
                className="w-full rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-primary-soft)] py-2.5 text-[14px] font-semibold active:opacity-90"
                style={{ color: "var(--messenger-primary)" }}
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
    <div className="flex items-center gap-2 px-3 py-2 active:bg-[color:var(--messenger-primary-soft)]">
      <button
        type="button"
        onPointerDown={() => {
          if (prefetchOnceRef.current) return;
          prefetchOnceRef.current = true;
          onPrefetchDirectRoom(user.id);
        }}
        onClick={() => onOpenProfile(user)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <div
          className="h-10 w-10 shrink-0 overflow-hidden rounded-full ring-1 ring-[color:var(--messenger-primary-soft-2)]"
          style={{ backgroundColor: "var(--messenger-surface-muted)" }}
        >
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-[13px] font-semibold"
              style={{ color: "var(--messenger-text-secondary)" }}
            >
              {initial}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium" style={{ color: "var(--messenger-text)" }}>
            {user.label}
          </p>
          <p className="truncate text-[11px]" style={{ color: "var(--messenger-text-secondary)" }}>
            {user.subtitle ?? "SAMarket"}
          </p>
        </div>
      </button>
      {user.isFriend ? (
        <span className="shrink-0 text-[12px]" style={{ color: "var(--messenger-text-secondary)" }}>
          친구
        </span>
      ) : user.blocked ? (
        <span className="shrink-0 text-[12px]" style={{ color: "var(--messenger-text-secondary)" }}>
          차단됨
        </span>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void onRequestFriend(user.id);
          }}
          disabled={busyId === `friend:${user.id}`}
          className="shrink-0 rounded-full bg-[color:var(--messenger-primary)] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40 active:opacity-90"
        >
          요청
        </button>
      )}
    </div>
  );
}
