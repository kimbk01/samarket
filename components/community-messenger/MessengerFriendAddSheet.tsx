"use client";

import { useCallback, useRef, useState, type RefObject } from "react";
import { SettingsToggleRow } from "@/components/community-messenger/MessengerSheetUi";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import type { CommunityMessengerLocalSettings } from "@/lib/community-messenger/preferences";
import {
  formatFriendRejectCooldownShort,
  isMessengerFriendRequestBusy,
  shouldDisableMessengerIncomingFriendActionButtons,
  shouldDisableMessengerOutgoingFriendCancelButton,
} from "@/lib/community-messenger/community-messenger-friend-request-client";
import { MessengerFriendAddCtaLabels, resolveMessengerFriendAddCta } from "@/lib/community-messenger/messenger-friend-add-cta";
import type { CommunityMessengerFriendRequest, CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

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
  viewerUserId: string | null;
  friendRequests: CommunityMessengerFriendRequest[];
  busyId: string | null;
  onOpenProfile: (profile: CommunityMessengerProfileLite) => void;
  onPrefetchDirectRoom: (userId: string) => void;
  onRequestFriend: (userId: string) => void;
  onCancelOutgoingFriendRequest: (requestId: string) => void;
  onRespondIncomingFriendRequest: (requestId: string, action: "accept" | "reject") => void;
  /** 초대 링크·QR 탭에 표시할 공개 URL */
  inviteUrl: string;
  /** 거절 후 재요청 불가(unix ms) — peer id 키 */
  cooldownUntilByPeerId: Record<string, number>;
  /** 쿨다운 남은 시간 표시용 현재 시각(부모에서 1초 간격 갱신) */
  cooldownNowMs: number;
};

const TAB_ORDER: MessengerFriendAddTab[] = ["id", "contacts", "invite"];

function tabLabel(t: MessengerFriendAddTab): string {
  switch (t) {
    case "id":
      return "@아이디";
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
  viewerUserId,
  friendRequests,
  busyId,
  onOpenProfile,
  onPrefetchDirectRoom,
  onRequestFriend,
  onCancelOutgoingFriendRequest,
  onRespondIncomingFriendRequest,
  inviteUrl,
  cooldownUntilByPeerId,
  cooldownNowMs,
}: Props) {
  const [copied, setCopied] = useState(false);

  const copyInvite = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied((prev) => (prev ? prev : true));
      window.setTimeout(() => setCopied((prev) => (prev ? false : prev)), 2000);
    } catch {
      /* ignore */
    }
  }, [inviteUrl]);

  return (
    <div className="fixed inset-0 z-[43] flex flex-col justify-end bg-black/30">
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onClose} />
      <div
        data-messenger-shell
        className="flex max-h-[78vh] w-full flex-col overflow-hidden rounded-t-ui-rect border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] shadow-[var(--messenger-shadow-soft)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--messenger-divider)] px-3 py-2.5">
          <p className="sam-text-body-lg font-semibold" style={{ color: "var(--messenger-text)" }}>
            친구 추가
          </p>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-ui-rect text-[color:var(--messenger-text-secondary)] active:bg-[color:var(--messenger-primary-soft)]"
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
                className={`relative min-w-0 flex-1 px-1 py-2.5 sam-text-helper font-medium ${
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

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto bg-[color:var(--messenger-bg)] px-3 pb-3 pt-3">
          {friendAddTab === "contacts" ? (
            <div className="space-y-2">
              <p className="sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
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
                className="rounded-[var(--messenger-radius-md)] border border-dashed border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] px-3 py-3 text-center sam-text-helper"
                style={{ color: "var(--messenger-text-secondary)" }}
              >
                웹에서는 ID 검색 탭으로 바로 추가할 수 있습니다.
              </p>
            </div>
          ) : null}

          {friendAddTab === "id" ? (
            <div className="space-y-3">
              {(() => {
                const outgoingPending = friendRequests.filter(
                  (r) => r.direction === "outgoing" && r.status === "pending"
                );
                if (!outgoingPending.length) return null;
                return (
                  <div className="space-y-2">
                    <div>
                      <p className="sam-text-body-secondary font-semibold" style={{ color: "var(--messenger-text)" }}>
                        보낸 요청
                      </p>
                      <p className="mt-0.5 sam-text-xxs leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
                        상대가 수락하면 목록에서 사라집니다. 여러 명에게 보낸 경우 모두 여기서 확인할 수 있습니다.
                      </p>
                    </div>
                    <div className="divide-y divide-[color:var(--messenger-divider)] overflow-hidden rounded-ui-rect border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] shadow-[var(--messenger-shadow-soft)]">
                      {outgoingPending.map((r) => {
                        const initial = r.addresseeLabel.trim().slice(0, 1) || "?";
                        return (
                          <div key={r.id} className="flex items-center gap-2 px-3 py-2.5">
                            <div
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--messenger-primary-soft)] sam-text-body-secondary font-semibold"
                              style={{ color: "var(--messenger-text-secondary)" }}
                              aria-hidden
                            >
                              {initial}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate sam-text-body font-medium" style={{ color: "var(--messenger-text)" }}>
                                {r.addresseeLabel || "상대"}
                              </p>
                              <p className="truncate sam-text-xxs" style={{ color: "var(--messenger-text-secondary)" }}>
                                수락 대기 중
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => onCancelOutgoingFriendRequest(r.id)}
                              disabled={shouldDisableMessengerOutgoingFriendCancelButton(busyId, {
                                requestId: r.id,
                                addresseeUserId: r.addresseeId,
                              })}
                              className="shrink-0 rounded-full border border-[color:var(--messenger-divider)] px-2.5 py-1 sam-text-xxs font-medium disabled:opacity-40"
                              style={{ color: "var(--messenger-text)" }}
                            >
                              {busyId === `request:${r.id}:cancel` ? "…" : MessengerFriendAddCtaLabels.cancel}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              <div>
                <div className="flex justify-end sam-text-xxs tabular-nums" style={{ color: "var(--messenger-text-secondary)" }}>
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
                  placeholder="@아이디 (예: @samarket)"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full rounded-ui-rect border border-transparent bg-[color:var(--messenger-primary-soft)] px-2 py-2 text-[14px] font-normal leading-[1.5] outline-none transition-[border,box-shadow] placeholder:text-[13px] placeholder:font-normal placeholder:leading-[1.45] placeholder:text-[color:var(--messenger-text-secondary)] focus:border-[color:var(--messenger-primary)] focus:bg-[color:var(--messenger-surface)] focus:ring-1 focus:ring-[color:var(--messenger-primary)]"
                  style={{ color: "var(--messenger-text)" }}
                />
                <p className="mt-1.5 sam-text-xxs" style={{ color: "var(--messenger-text-secondary)" }}>
                  @아이디로만 검색됩니다. (닉네임 검색 불가)
                </p>
                <button
                  type="button"
                  onClick={() => void onSearchUsers()}
                  disabled={busyId === "user-search"}
                  className="mt-3 w-full rounded-ui-rect bg-[color:var(--messenger-primary)] py-2.5 text-[14px] font-semibold text-white disabled:opacity-50 active:opacity-90"
                >
                  {busyId === "user-search" ? "검색 중…" : "검색"}
                </button>
              </div>
              <div className="divide-y divide-[color:var(--messenger-divider)] overflow-hidden rounded-ui-rect border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] shadow-[var(--messenger-shadow-soft)]">
                {searchResults.length === 0 ? (
                  <p className="px-3 py-4 text-center sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
                    {!friendUserSearchAttempted ? "검색어를 입력한 뒤 검색을 눌러 주세요." : "검색 결과가 없습니다."}
                  </p>
                ) : (
                  searchResults.map((user) => (
                    <SearchResultRow
                      key={user.id}
                      user={user}
                      viewerUserId={viewerUserId}
                      friendRequests={friendRequests}
                      busyId={busyId}
                      onOpenProfile={onOpenProfile}
                      onPrefetchDirectRoom={onPrefetchDirectRoom}
                      onRequestFriend={onRequestFriend}
                      onCancelOutgoingFriendRequest={onCancelOutgoingFriendRequest}
                      onRespondIncomingFriendRequest={onRespondIncomingFriendRequest}
                      cooldownUntilByPeerId={cooldownUntilByPeerId}
                      cooldownNowMs={cooldownNowMs}
                    />
                  ))
                )}
              </div>
            </div>
          ) : null}

          {friendAddTab === "invite" ? (
            <div className="space-y-3">
              <p className="sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
                이 링크를 공유하면 상대가 메신저에서 나를 찾을 수 있습니다. QR 스캔은 동일 링크를 사용합니다.
              </p>
              <div className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-primary-soft)] px-3 py-2.5">
                <p className="sam-text-xxs font-medium uppercase tracking-wide" style={{ color: "var(--messenger-text-secondary)" }}>
                  초대 URL
                </p>
                <p className="mt-1 break-all sam-text-helper leading-snug" style={{ color: "var(--messenger-text)" }}>
                  {inviteUrl}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyInvite()}
                className="w-full rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-primary-soft)] py-2.5 sam-text-body font-semibold active:opacity-90"
                style={{ color: "var(--messenger-primary)" }}
              >
                {copied ? "복사됨" : "링크 복사"}
              </button>
            </div>
          ) : null}
        </div>

        </div>
      </div>
    </div>
  );
}

function SearchResultRow({
  user,
  viewerUserId,
  friendRequests,
  busyId,
  onOpenProfile,
  onPrefetchDirectRoom,
  onRequestFriend,
  onCancelOutgoingFriendRequest,
  onRespondIncomingFriendRequest,
  cooldownUntilByPeerId,
  cooldownNowMs,
}: {
  user: CommunityMessengerProfileLite;
  viewerUserId: string | null;
  friendRequests: CommunityMessengerFriendRequest[];
  busyId: string | null;
  onOpenProfile: (profile: CommunityMessengerProfileLite) => void;
  onPrefetchDirectRoom: (userId: string) => void;
  onRequestFriend: (userId: string) => void;
  onCancelOutgoingFriendRequest: (requestId: string) => void;
  onRespondIncomingFriendRequest: (requestId: string, action: "accept" | "reject") => void;
  cooldownUntilByPeerId: Record<string, number>;
  cooldownNowMs: number;
}) {
  const prefetchOnceRef = useRef(false);
  const avatarSrc = user.avatarUrl?.trim() ? user.avatarUrl.trim() : null;
  const initial = user.label.trim().slice(0, 1) || "?";
  const cta = viewerUserId
    ? resolveMessengerFriendAddCta(user, viewerUserId, friendRequests, {
        cooldownUntilByPeerId,
        nowMs: cooldownNowMs,
      })
    : { kind: "add" as const };
  const bAdd = isMessengerFriendRequestBusy(busyId, user.id);

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
        <SamarketThumbnail
          src={avatarSrc}
          size={40}
          roundedClassName="rounded-full"
          className="bg-[color:var(--messenger-surface-muted)] ring-1 ring-[color:var(--messenger-primary-soft-2)]"
          fallbackSrc=""
          fallbackNode={<span className="sam-text-body-secondary font-semibold" style={{ color: "var(--messenger-text-secondary)" }}>{initial}</span>}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate sam-text-body font-medium" style={{ color: "var(--messenger-text)" }}>
            {user.label}
          </p>
          <p className="truncate sam-text-xxs" style={{ color: "var(--messenger-text-secondary)" }}>
            {user.subtitle ?? "dibaY"}
          </p>
        </div>
      </button>
      <div className="flex shrink-0 items-center justify-end gap-1">
        {cta.kind === "friend" || user.isFriend ? (
          <span className="sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
            {MessengerFriendAddCtaLabels.friend}
          </span>
        ) : cta.kind === "blocked" ? (
          <span className="max-w-[5.5rem] text-right sam-text-xxs leading-tight" style={{ color: "var(--messenger-text-secondary)" }}>
            {MessengerFriendAddCtaLabels.unavailable}
          </span>
        ) : cta.kind === "pending_outgoing" ? (
          <>
            <span
              className="rounded-full border border-[color:var(--messenger-divider)] px-2 py-1 sam-text-xxs font-medium"
              style={{ color: "var(--messenger-text-secondary)" }}
            >
              {MessengerFriendAddCtaLabels.pending}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCancelOutgoingFriendRequest(cta.requestId);
              }}
              disabled={shouldDisableMessengerOutgoingFriendCancelButton(busyId, {
                requestId: cta.requestId,
                addresseeUserId: user.id,
              })}
              className="rounded-full border border-[color:var(--messenger-divider)] px-2 py-1 sam-text-xxs font-medium disabled:opacity-40"
              style={{ color: "var(--messenger-text)" }}
            >
              {busyId === `request:${cta.requestId}:cancel` ? "…" : MessengerFriendAddCtaLabels.cancel}
            </button>
          </>
        ) : cta.kind === "pending_incoming" ? (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRespondIncomingFriendRequest(cta.requestId, "reject");
              }}
              disabled={shouldDisableMessengerIncomingFriendActionButtons(busyId, cta.requestId)}
              className="rounded-full border border-[color:var(--messenger-divider)] px-2 py-1 sam-text-xxs font-medium disabled:opacity-40"
              style={{ color: "var(--messenger-text)" }}
            >
              {MessengerFriendAddCtaLabels.reject}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRespondIncomingFriendRequest(cta.requestId, "accept");
              }}
              disabled={shouldDisableMessengerIncomingFriendActionButtons(busyId, cta.requestId)}
              className="rounded-full bg-[color:var(--messenger-primary)] px-2.5 py-1 sam-text-xxs font-semibold text-white disabled:opacity-40"
            >
              {MessengerFriendAddCtaLabels.accept}
            </button>
          </>
        ) : cta.kind === "cooldown" ? (
          <div className="flex max-w-[11rem] flex-col items-end gap-0.5 text-right">
            <span
              className="rounded-full border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] px-2 py-1 sam-text-xxs font-medium"
              style={{ color: "var(--messenger-text-secondary)" }}
            >
              {MessengerFriendAddCtaLabels.cooldown}
            </span>
            <span className="sam-text-xxs tabular-nums leading-tight" style={{ color: "var(--messenger-text-secondary)" }}>
              {formatFriendRejectCooldownShort(cta.remainingMs)} 재요청
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void onRequestFriend(user.id);
            }}
            disabled={bAdd}
            className="rounded-full bg-[color:var(--messenger-primary)] px-3 py-1.5 sam-text-helper font-semibold text-white disabled:opacity-40 active:opacity-90"
          >
            {bAdd ? "…" : MessengerFriendAddCtaLabels.add}
          </button>
        )}
      </div>
    </div>
  );
}
