"use client";

/**
 * 친구 프로필 시트 — 음성/영상 발신은 `outgoing-call-surfaces` 의 friendProfileSheet.
 */

import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

type Props = {
  profile: CommunityMessengerProfileLite;
  /** `CommunityMessengerHome` 의 `busyId` — `call:voice:${id}` 등과 매칭 */
  busyId: string | null;
  onClose: () => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  onChat: () => void;
  onToggleFavorite: () => void;
  onToggleHidden?: () => void;
  onInviteToGroup?: () => void;
  /** 1:1 대화방이 있을 때만 — 방 알림 음소거 */
  onToggleMuteNotifications?: () => void;
  /** 직접 대화방의 음소거 여부 (방 없으면 undefined) */
  directRoomMuted?: boolean;
  /** 방 설정 API 처리 중 (음소거 토글) */
  notificationsBusy?: boolean;
  onRemoveFriend?: () => void;
  onBlock?: () => void;
  onReport?: () => void;
};

/**
 * 친구를 눌렀을 때 바로 채팅으로 보내지 않고, 먼저 행동을 고르게 하는 하단 시트.
 */
export function MessengerFriendProfileSheet({
  profile,
  busyId,
  onClose,
  onVoiceCall,
  onVideoCall,
  onChat,
  onToggleFavorite,
  onToggleHidden,
  onInviteToGroup,
  onToggleMuteNotifications,
  directRoomMuted,
  notificationsBusy = false,
  onRemoveFriend,
  onBlock,
  onReport,
}: Props) {
  const pid = profile.id;
  const bVoice = busyId === `call:voice:${pid}`;
  const bVideo = busyId === `call:video:${pid}`;
  const bChat = busyId === `room:${pid}`;
  const bFav = busyId === `favorite:${pid}`;
  const bHidden = busyId === `hidden:${pid}`;
  const anyBusy = Boolean(busyId);

  const avatarSrc = profile.avatarUrl ?? undefined;
  const initial = profile.label.trim().slice(0, 1) || "?";
  const secondaryLine = profile.subtitle?.trim() || `ID · ${pid.slice(0, 8)}…`;

  return (
    <div className="fixed inset-0 z-[45] flex flex-col justify-end bg-black/25" role="dialog" aria-modal="true" aria-labelledby="messenger-friend-sheet-title">
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onClose} />
      <div className="max-h-[82vh] w-full overflow-y-auto rounded-t-[12px] border border-ui-border bg-ui-surface px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex flex-col items-center border-b border-ui-border pb-3 text-center">
          <div className="h-[72px] w-[72px] overflow-hidden rounded-full bg-ui-hover">
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-ui-muted">{initial}</div>
            )}
          </div>
          <h2 id="messenger-friend-sheet-title" className="mt-2 text-[16px] font-semibold text-ui-fg">
            {profile.label}
          </h2>
          <p className="mt-1 line-clamp-2 text-[12px] text-ui-muted">{secondaryLine}</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            {profile.isFavoriteFriend ? <StatusChip label="즐겨찾기" /> : null}
            {profile.isHiddenFriend ? <StatusChip label="숨김" /> : null}
            {profile.blocked ? <StatusChip label="차단" tone="danger" /> : null}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={onChat}
            disabled={anyBusy}
            className="rounded-ui-rect border border-ui-border bg-ui-page px-2 py-2.5 text-center disabled:opacity-50"
          >
            <p className="text-[13px] font-semibold text-ui-fg">채팅</p>
            <p className="mt-0.5 text-[10px] text-ui-muted">{bChat ? "열기…" : ""}</p>
          </button>
          <button
            type="button"
            onClick={onVoiceCall}
            disabled={anyBusy}
            className="rounded-ui-rect border border-ui-border bg-ui-page px-2 py-2.5 text-center disabled:opacity-50"
          >
            <p className="text-[13px] font-semibold text-ui-fg">음성</p>
            <p className="mt-0.5 text-[10px] text-ui-muted">{bVoice ? "연결…" : ""}</p>
          </button>
          <button
            type="button"
            onClick={onVideoCall}
            disabled={anyBusy}
            className="rounded-ui-rect border border-ui-border bg-ui-page px-2 py-2.5 text-center disabled:opacity-50"
          >
            <p className="text-[13px] font-semibold text-ui-fg">영상</p>
            <p className="mt-0.5 text-[10px] text-ui-muted">{bVideo ? "연결…" : ""}</p>
          </button>
        </div>

        <div className="mt-3 overflow-hidden rounded-ui-rect border border-ui-border">
          <SectionLabel label="관계" />
          <ActionRow
            label={bFav ? "처리 중…" : profile.isFavoriteFriend ? "즐겨찾기 해제" : "즐겨찾기"}
            onClick={onToggleFavorite}
            disabled={anyBusy}
          />
          {profile.isFriend ? (
            <ActionRow
              label={bHidden ? "처리 중…" : profile.isHiddenFriend ? "숨김 해제" : "숨김"}
              onClick={onToggleHidden}
              disabled={anyBusy}
            />
          ) : null}
          {onToggleMuteNotifications && profile.isFriend ? (
            <ActionRow
              label={
                notificationsBusy
                  ? "처리 중…"
                  : typeof directRoomMuted === "boolean"
                    ? directRoomMuted
                      ? "대화 알림 켜기"
                      : "대화 알림 끄기"
                    : "대화 알림 (채팅 시작 후)"
              }
              onClick={onToggleMuteNotifications}
              disabled={anyBusy || typeof directRoomMuted !== "boolean"}
            />
          ) : null}
          <ActionRow label="그룹에 초대" onClick={onInviteToGroup} disabled={anyBusy} />
        </div>

        <div className="mt-2 overflow-hidden rounded-ui-rect border border-ui-border">
          <SectionLabel label="계정" />
          {profile.isFriend && onRemoveFriend ? <ActionRow label="친구 삭제" onClick={onRemoveFriend} disabled={anyBusy} /> : null}
          {onBlock ? <ActionRow label={profile.blocked ? "차단 해제" : "차단"} onClick={onBlock} disabled={anyBusy} danger /> : null}
          {onReport ? <ActionRow label="신고" onClick={onReport} disabled={anyBusy} danger /> : null}
        </div>

        <button type="button" onClick={onClose} className="mt-2 w-full py-2.5 text-[13px] font-medium text-ui-muted">
          닫기
        </button>
      </div>
    </div>
  );
}

function StatusChip({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "danger" }) {
  return (
    <span
      className={`rounded-ui-rect border px-1.5 py-0.5 text-[10px] font-semibold ${
        tone === "danger" ? "border-ui-border bg-ui-page text-[var(--ui-danger)]" : "border-ui-border bg-ui-page text-ui-muted"
      }`}
    >
      {label}
    </span>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <div className="border-b border-ui-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-ui-muted">{label}</div>;
}

function ActionRow({
  label,
  onClick,
  disabled,
  danger = false,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={`flex min-h-[48px] w-full items-center justify-between border-b border-ui-border px-3 text-left text-[13px] font-medium last:border-b-0 disabled:opacity-50 ${
        danger ? "text-[var(--ui-danger)]" : "text-ui-fg"
      }`}
    >
      <span>{label}</span>
      {!onClick ? <span className="text-[11px] text-ui-muted">준비 중</span> : null}
    </button>
  );
}
