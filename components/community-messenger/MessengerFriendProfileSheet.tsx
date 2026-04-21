"use client";

import {
  MessengerFriendAddCtaLabels,
  type MessengerFriendAddCta,
} from "@/lib/community-messenger/messenger-friend-add-cta";
import { isMessengerFriendRequestBusy } from "@/lib/community-messenger/community-messenger-friend-request-client";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

type Props = {
  profile: CommunityMessengerProfileLite;
  busyId: string | null;
  onClose: () => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  onChat: () => void;
  onToggleFavorite: () => void;
  onToggleHidden?: () => void;
  onInviteToGroup?: () => void;
  onToggleMuteNotifications?: () => void;
  directRoomMuted?: boolean;
  notificationsBusy?: boolean;
  onRemoveFriend?: () => void;
  onBlock?: () => void;
  onReport?: () => void;
  /** 친구 추가 영역 — 검색·추천 등 비친구 프로필과 동일 규칙. 없으면 예전처럼 항상 채팅·통화 노출 */
  friendAddCta?: MessengerFriendAddCta;
  onFriendAdd?: () => void;
  onFriendCancelOutgoing?: (requestId: string) => void;
  onFriendAcceptIncoming?: (requestId: string) => void;
  onFriendRejectIncoming?: (requestId: string) => void;
};

/**
 * 친구 탭 — 탭한 사용자 프로필(시트). 라우팅 없음.
 * 친구가 아니면 상단에 친구 추가 CTA(요청중·취소·수락·거절) 후 채팅·통화는 친구일 때만 활성.
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
  friendAddCta,
  onFriendAdd,
  onFriendCancelOutgoing,
  onFriendAcceptIncoming,
  onFriendRejectIncoming,
}: Props) {
  const pid = profile.id;
  const bVoice = busyId === `call:voice:${pid}`;
  const bVideo = busyId === `call:video:${pid}`;
  const bChat = busyId === `room:${pid}`;
  const bFav = busyId === `favorite:${pid}`;
  const bHidden = busyId === `hidden:${pid}`;
  const anyBusy = Boolean(busyId);
  const bFriendAdd = isMessengerFriendRequestBusy(busyId, pid);

  const avatarSrc = profile.avatarUrl ?? undefined;
  const initial = profile.label.trim().slice(0, 1) || "?";
  const statusLine = profile.subtitle?.trim() ?? "";

  const useFriendAddGate = Boolean(
    friendAddCta && onFriendAdd && onFriendCancelOutgoing && onFriendAcceptIncoming && onFriendRejectIncoming
  );
  /** 게이트 켜짐: 친구만 메시지·통화. 없으면 예전처럼 탭은 동작(후속 API에서 제한 가능). */
  const canMessageAndCall = useFriendAddGate ? profile.isFriend : true;
  const cta = friendAddCta;

  return (
    <div className="fixed inset-0 z-[45] flex flex-col justify-end bg-black/25" role="dialog" aria-modal="true" aria-labelledby="messenger-friend-sheet-title">
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onClose} />
      <div className="max-h-[82vh] w-full overflow-y-auto rounded-t-[12px] border border-ui-border bg-ui-surface px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <div className="flex flex-col items-center border-b border-ui-border pb-3 text-center">
          <div className="h-16 w-16 overflow-hidden rounded-full bg-ui-hover">
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-ui-muted">{initial}</div>
            )}
          </div>
          <h2 id="messenger-friend-sheet-title" className="mt-2 sam-text-body-lg font-semibold text-ui-fg">
            {profile.label}
          </h2>
          {statusLine ? <p className="mt-0.5 line-clamp-2 sam-text-helper text-ui-muted">{statusLine}</p> : null}
          <p className="mt-1 font-mono sam-text-xxs text-ui-muted tabular-nums">ID {pid}</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
            {profile.isFriend ? <StatusChip label={MessengerFriendAddCtaLabels.friend} /> : null}
            {profile.isFavoriteFriend ? <StatusChip label="즐겨찾기" /> : null}
            {profile.isHiddenFriend ? <StatusChip label="숨김" /> : null}
            {profile.blocked ? <StatusChip label={MessengerFriendAddCtaLabels.blockedChip} tone="danger" /> : null}
          </div>
        </div>

        {useFriendAddGate && cta ? (
          <div className="mt-3">{renderFriendAddBlock({ cta, pid, busyId, bFriendAdd, onFriendAdd, onFriendCancelOutgoing, onFriendAcceptIncoming, onFriendRejectIncoming })}</div>
        ) : null}

        <div className={`mt-3 grid grid-cols-3 gap-1.5 ${!canMessageAndCall && useFriendAddGate ? "opacity-40" : ""}`}>
          <button
            type="button"
            onClick={onChat}
            disabled={anyBusy || !canMessageAndCall}
            className="rounded-ui-rect bg-ui-page px-1 py-2.5 text-center active:bg-ui-hover disabled:opacity-50"
          >
            <p className="sam-text-body-secondary font-semibold text-ui-fg">{MessengerFriendAddCtaLabels.message}</p>
            {bChat ? <p className="mt-0.5 sam-text-xxs text-ui-muted">열기…</p> : null}
          </button>
          <button
            type="button"
            onClick={onVoiceCall}
            disabled={anyBusy || !canMessageAndCall}
            className="rounded-ui-rect bg-ui-page px-1 py-2.5 text-center active:bg-ui-hover disabled:opacity-50"
          >
            <p className="sam-text-body-secondary font-semibold text-ui-fg">음성</p>
            {bVoice ? <p className="mt-0.5 sam-text-xxs text-ui-muted">연결…</p> : null}
          </button>
          <button
            type="button"
            onClick={onVideoCall}
            disabled={anyBusy || !canMessageAndCall}
            className="rounded-ui-rect bg-ui-page px-1 py-2.5 text-center active:bg-ui-hover disabled:opacity-50"
          >
            <p className="sam-text-body-secondary font-semibold text-ui-fg">영상</p>
            {bVideo ? <p className="mt-0.5 sam-text-xxs text-ui-muted">연결…</p> : null}
          </button>
        </div>
        {!canMessageAndCall && useFriendAddGate ? (
          <p className="mt-2 text-center sam-text-xxs text-ui-muted">친구가 되면 메시지·음성·영상을 이용할 수 있습니다.</p>
        ) : null}

        <div className="mt-3 divide-y divide-ui-border border-t border-ui-border">
          {profile.isFriend ? (
            <ActionRow
              label={bFav ? "처리 중…" : profile.isFavoriteFriend ? "즐겨찾기 해제" : "즐겨찾기"}
              onClick={onToggleFavorite}
              disabled={anyBusy}
            />
          ) : null}
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
          {onInviteToGroup && profile.isFriend ? <ActionRow label="그룹에 초대" onClick={onInviteToGroup} disabled={anyBusy} /> : null}
          {profile.isFriend && onRemoveFriend ? <ActionRow label="친구 삭제" onClick={onRemoveFriend} disabled={anyBusy} danger /> : null}
          {onBlock ? <ActionRow label={profile.blocked ? "차단 해제" : "차단"} onClick={onBlock} disabled={anyBusy} danger /> : null}
          {onReport ? <ActionRow label="신고" onClick={onReport} disabled={anyBusy} danger /> : null}
        </div>

        <button type="button" onClick={onClose} className="mt-2 w-full py-2.5 sam-text-body-secondary font-medium text-ui-muted active:bg-ui-hover">
          닫기
        </button>
      </div>
    </div>
  );
}

function renderFriendAddBlock(args: {
  cta: MessengerFriendAddCta;
  pid: string;
  busyId: string | null;
  bFriendAdd: boolean;
  onFriendAdd?: () => void;
  onFriendCancelOutgoing?: (requestId: string) => void;
  onFriendAcceptIncoming?: (requestId: string) => void;
  onFriendRejectIncoming?: (requestId: string) => void;
}) {
  const { cta, pid, busyId, bFriendAdd, onFriendAdd, onFriendCancelOutgoing, onFriendAcceptIncoming, onFriendRejectIncoming } = args;

  if (cta.kind === "friend") return null;

  if (cta.kind === "blocked") {
    return (
      <div className="rounded-ui-rect border border-ui-border bg-ui-page px-3 py-3 text-center">
        <p className="sam-text-body font-semibold text-ui-muted">{MessengerFriendAddCtaLabels.unavailable}</p>
        <p className="mt-1 sam-text-helper leading-snug text-ui-muted">차단 상태에서는 친구 추가·대화를 할 수 없습니다.</p>
      </div>
    );
  }

  if (cta.kind === "add") {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={onFriendAdd}
          disabled={Boolean(busyId)}
          className="w-full rounded-ui-rect bg-ui-fg py-3 sam-text-body font-semibold text-ui-surface disabled:opacity-50"
        >
          {bFriendAdd ? "처리 중…" : MessengerFriendAddCtaLabels.add}
        </button>
      </div>
    );
  }

  if (cta.kind === "pending_outgoing") {
    const rid = cta.requestId;
    const bCancel = busyId === `request:${rid}:cancel`;
    return (
      <div className="flex gap-2">
        <div
          className="flex min-h-[var(--ui-tap-min,44px)] flex-1 items-center justify-center rounded-ui-rect border border-ui-border bg-ui-page sam-text-body font-medium text-ui-muted"
          aria-live="polite"
        >
          {MessengerFriendAddCtaLabels.pending}
        </div>
        <button
          type="button"
          onClick={() => onFriendCancelOutgoing?.(rid)}
          disabled={Boolean(busyId)}
          className="min-h-[var(--ui-tap-min,44px)] shrink-0 rounded-ui-rect border border-ui-border px-4 sam-text-body font-medium text-ui-fg disabled:opacity-50"
        >
          {bCancel ? "처리 중…" : MessengerFriendAddCtaLabels.cancel}
        </button>
      </div>
    );
  }

  if (cta.kind === "pending_incoming") {
    const rid = cta.requestId;
    return (
      <div className="space-y-2">
        <p className="text-center sam-text-body-secondary text-ui-fg">이 사용자가 친구 요청을 보냈습니다.</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onFriendRejectIncoming?.(rid)}
            disabled={Boolean(busyId)}
            className="min-h-[var(--ui-tap-min,44px)] flex-1 rounded-ui-rect border border-ui-border py-2.5 sam-text-body font-medium text-ui-fg disabled:opacity-50"
          >
            {busyId === `request:${rid}:reject` ? "처리 중…" : MessengerFriendAddCtaLabels.reject}
          </button>
          <button
            type="button"
            onClick={() => onFriendAcceptIncoming?.(rid)}
            disabled={Boolean(busyId)}
            className="min-h-[var(--ui-tap-min,44px)] flex-1 rounded-ui-rect bg-ui-fg py-2.5 sam-text-body font-semibold text-ui-surface disabled:opacity-50"
          >
            {busyId === `request:${rid}:accept` ? "처리 중…" : MessengerFriendAddCtaLabels.accept}
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function StatusChip({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "danger" }) {
  return (
    <span
      className={`rounded-ui-rect border px-1.5 py-0.5 sam-text-xxs font-semibold ${
        tone === "danger" ? "border-ui-border bg-ui-page text-[var(--ui-danger)]" : "border-ui-border bg-ui-page text-ui-muted"
      }`}
    >
      {label}
    </span>
  );
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
      className={`flex min-h-[var(--ui-tap-min,44px)] w-full items-center justify-between px-0.5 text-left sam-text-body font-medium active:bg-ui-hover disabled:opacity-50 ${
        danger ? "text-[var(--ui-danger)]" : "text-ui-fg"
      }`}
    >
      <span>{label}</span>
      {!onClick ? <span className="sam-text-xxs text-ui-muted">준비 중</span> : null}
    </button>
  );
}
