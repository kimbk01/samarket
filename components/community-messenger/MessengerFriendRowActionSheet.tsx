"use client";

import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

type Props = {
  profile: CommunityMessengerProfileLite;
  busyId: string | null;
  onClose: () => void;
  onChat: () => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  onToggleFavorite: () => void;
  onToggleMute?: () => void;
  directRoomMuted?: boolean;
  notificationsBusy?: boolean;
  onToggleHidden?: () => void;
  onBlock?: () => void;
  onRemoveFriend?: () => void;
  onReport?: () => void;
};

/**
 * 친구 목록 롱프레스 — 1차: 채팅·음성·영상, 2차: 관계·계정.
 */
export function MessengerFriendRowActionSheet({
  profile,
  busyId,
  onClose,
  onChat,
  onVoiceCall,
  onVideoCall,
  onToggleFavorite,
  onToggleMute,
  directRoomMuted,
  notificationsBusy = false,
  onToggleHidden,
  onBlock,
  onRemoveFriend,
  onReport,
}: Props) {
  const pid = profile.id;
  const bChat = busyId === `room:${pid}`;
  const bVoice = busyId === `call:voice:${pid}`;
  const bVideo = busyId === `call:video:${pid}`;
  const bFav = busyId === `favorite:${pid}`;
  const bHidden = busyId === `hidden:${pid}`;
  const anyBusy = Boolean(busyId);

  return (
    <div className="fixed inset-0 z-[46] flex flex-col justify-end bg-black/30" role="dialog" aria-modal="true">
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onClose} />
      <div className="w-full max-h-[min(72vh,560px)] overflow-y-auto rounded-t-[12px] border border-ui-border bg-ui-surface pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="border-b border-ui-border px-3 py-2">
          <p className="truncate text-[15px] font-semibold text-ui-fg">{profile.label}</p>
          <p className="mt-0.5 truncate text-[12px] text-ui-muted">{profile.subtitle?.trim() || `ID · ${pid.slice(0, 8)}…`}</p>
        </div>
        <nav className="flex flex-col" aria-label="친구 작업">
          <SheetAction label="채팅" sub={bChat ? "열기…" : undefined} onClick={onChat} disabled={anyBusy} />
          <SheetAction label="음성 통화" sub={bVoice ? "연결…" : undefined} onClick={onVoiceCall} disabled={anyBusy} />
          <SheetAction label="영상 통화" sub={bVideo ? "연결…" : undefined} onClick={onVideoCall} disabled={anyBusy} />
          <SheetAction
            label={bFav ? "처리 중…" : profile.isFavoriteFriend ? "즐겨찾기 해제" : "즐겨찾기"}
            onClick={onToggleFavorite}
            disabled={anyBusy}
            withTopRule
          />
          {onToggleMute && profile.isFriend ? (
            <SheetAction
              label={
                notificationsBusy
                  ? "처리 중…"
                  : typeof directRoomMuted === "boolean"
                    ? directRoomMuted
                      ? "대화 알림 켜기"
                      : "대화 알림 끄기"
                    : "대화 알림 (채팅 시작 후)"
              }
              onClick={onToggleMute}
              disabled={anyBusy || typeof directRoomMuted !== "boolean"}
            />
          ) : null}
          {onToggleHidden ? (
            <SheetAction
              label={bHidden ? "처리 중…" : profile.isHiddenFriend ? "숨김 해제" : "숨김"}
              onClick={onToggleHidden}
              disabled={anyBusy}
            />
          ) : null}
          {onBlock ? (
            <SheetAction label={profile.blocked ? "차단 해제" : "차단"} onClick={onBlock} disabled={anyBusy} danger />
          ) : null}
          {onRemoveFriend ? <SheetAction label="친구 삭제" onClick={onRemoveFriend} disabled={anyBusy} danger /> : null}
          {onReport ? <SheetAction label="신고" onClick={onReport} disabled={anyBusy} danger /> : null}
        </nav>
        <button
          type="button"
          onClick={onClose}
          className="mt-0 w-full border-t border-ui-border py-2.5 text-[14px] font-medium text-ui-muted active:bg-ui-hover"
        >
          취소
        </button>
      </div>
    </div>
  );
}

function SheetAction({
  label,
  sub,
  onClick,
  disabled,
  danger = false,
  withTopRule = false,
}: {
  label: string;
  sub?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  withTopRule?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[var(--ui-tap-min,44px)] w-full flex-col items-start justify-center border-b border-ui-border px-4 py-2 text-left disabled:opacity-50 ${
        withTopRule ? "border-t border-ui-border" : ""
      } ${danger ? "text-[var(--ui-danger)]" : "text-ui-fg"} active:bg-ui-hover`}
    >
      <span className="text-[15px] font-medium">{label}</span>
      {sub ? <span className="text-[11px] text-ui-muted">{sub}</span> : null}
    </button>
  );
}
