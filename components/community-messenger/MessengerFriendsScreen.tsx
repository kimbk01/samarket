"use client";

import { useCallback, useMemo, useState } from "react";
import { MessengerFriendRequestsSheet } from "@/components/community-messenger/MessengerFriendRequestsSheet";
import { MessengerFriendsMyProfileStrip } from "@/components/community-messenger/MessengerFriendsMyProfileStrip";
import { MessengerLineFriendRow } from "@/components/community-messenger/MessengerLineFriendRow";
import { useMessengerLongPress } from "@/lib/community-messenger/use-messenger-long-press";
import type { CommunityMessengerFriendRequest, CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import type { MessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";

type Props = {
  me: CommunityMessengerProfileLite | null;
  favoriteFriends: CommunityMessengerProfileLite[];
  sortedFriends: CommunityMessengerProfileLite[];
  friendStateModel: MessengerFriendStateModel;
  requests: CommunityMessengerFriendRequest[];
  busyId: string | null;
  onOpenPrivacySummary: () => void;
  onOpenProfile: (profile: CommunityMessengerProfileLite) => void;
  onOpenFriendRowActions: (profile: CommunityMessengerProfileLite) => void;
  onToggleFavorite: (userId: string) => void;
  onRequestAction: (requestId: string, action: "accept" | "reject" | "cancel") => void;
  onOpenInviteTools: () => void;
};

export function MessengerFriendsScreen({
  me,
  favoriteFriends,
  sortedFriends,
  friendStateModel,
  requests,
  busyId,
  onOpenPrivacySummary,
  onOpenProfile,
  onOpenFriendRowActions,
  onToggleFavorite,
  onRequestAction,
  onOpenInviteTools,
}: Props) {
  const [requestsSheetOpen, setRequestsSheetOpen] = useState(false);
  const requestSections = useMemo(() => {
    const received = requests.filter((request) => request.direction === "incoming");
    const sent = requests.filter((request) => request.direction === "outgoing");
    return { received, sent, suggested: friendStateModel.suggested };
  }, [friendStateModel.suggested, requests]);
  const requestTotal =
    requestSections.received.length + requestSections.sent.length + requestSections.suggested.length;

  return (
    <section className="pt-1">
      <MessengerFriendsMyProfileStrip me={me} onEdit={() => me && onOpenProfile(me)} onOpenInviteTools={onOpenInviteTools} />

      <div className="border-b border-ui-border bg-ui-page px-1 py-2">
        <h2 className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-ui-muted">즐겨찾기</h2>
        {favoriteFriends.length ? (
          <div className="-mx-0.5 flex gap-2 overflow-x-auto pb-0.5 pt-0.5 [scrollbar-width:thin]">
            {favoriteFriends.map((friend) => (
              <FavoriteStripCell
                key={friend.id}
                friend={friend}
                onOpenProfile={() => onOpenProfile(friend)}
                onOpenActions={() => onOpenFriendRowActions(friend)}
              />
            ))}
          </div>
        ) : (
          <p className="px-2 py-2 text-center text-[11px] text-ui-muted">즐겨찾기 친구가 없습니다.</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setRequestsSheetOpen(true)}
        className="flex w-full items-center justify-between border-b border-ui-border bg-ui-surface px-3 py-2.5 text-left active:bg-ui-hover"
      >
        <span className="text-[14px] font-medium text-ui-fg">친구 요청{requestTotal > 0 ? ` (${requestTotal})` : ""}</span>
        <span className="text-[12px] text-ui-muted" aria-hidden>
          ›
        </span>
      </button>

      <div className="mt-0 border-b border-ui-border bg-ui-surface">
        <h2 className="border-b border-ui-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ui-muted">친구</h2>
        {sortedFriends.length ? (
          sortedFriends.map((friend) => (
            <MessengerLineFriendRow
              key={friend.id}
              friend={friend}
              busyFavorite={busyId === `favorite:${friend.id}`}
              onRowPress={() => onOpenProfile(friend)}
              onOpenActions={() => onOpenFriendRowActions(friend)}
              onToggleFavorite={() => onToggleFavorite(friend.id)}
            />
          ))
        ) : (
          <div className="px-3 py-5 text-center text-[12px] text-ui-muted">아직 친구가 없습니다.</div>
        )}
      </div>

      <div className="mt-0 border-b border-ui-border">
        <button
          type="button"
          onClick={onOpenPrivacySummary}
          className="flex w-full items-center justify-between bg-ui-surface px-3 py-2.5 text-left active:bg-ui-hover"
        >
          <div>
            <p className="text-[14px] font-medium text-ui-fg">숨김 · 차단 · 알림 끔</p>
            <p className="mt-0.5 text-[11px] text-ui-muted tabular-nums">
              숨김 {friendStateModel.hidden.length} · 차단 {friendStateModel.blocked.length} · 끔 {friendStateModel.muted.length}
            </p>
          </div>
          <span className="text-[12px] text-ui-muted" aria-hidden>
            ›
          </span>
        </button>
      </div>

      {requestsSheetOpen ? (
        <MessengerFriendRequestsSheet
          onClose={() => setRequestsSheetOpen(false)}
          busyId={busyId}
          received={requestSections.received}
          sent={requestSections.sent}
          suggested={requestSections.suggested}
          onRequestAction={onRequestAction}
          onOpenProfile={onOpenProfile}
        />
      ) : null}
    </section>
  );
}

function FavoriteStripCell({
  friend,
  onOpenProfile,
  onOpenActions,
}: {
  friend: CommunityMessengerProfileLite;
  onOpenProfile: () => void;
  onOpenActions: () => void;
}) {
  const openActions = useCallback(() => onOpenActions(), [onOpenActions]);
  const { bind, consumeClickSuppression } = useMessengerLongPress(openActions);
  const initial = friend.label.trim().slice(0, 1) || "?";

  return (
    <div className="flex w-[64px] shrink-0 flex-col items-center px-0.5">
      <div
        role="button"
        tabIndex={0}
        className="flex w-full flex-col items-center gap-1 touch-manipulation"
        {...bind}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            onOpenProfile();
          }
        }}
        onClick={() => {
          if (consumeClickSuppression()) return;
          onOpenProfile();
        }}
      >
        <div className="h-11 w-11 overflow-hidden rounded-full bg-ui-hover">
          {friend.avatarUrl?.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={friend.avatarUrl.trim()} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[12px] font-semibold text-ui-muted">{initial}</div>
          )}
        </div>
        <span className="w-full truncate text-center text-[10px] font-medium leading-tight text-ui-fg">{friend.label}</span>
      </div>
    </div>
  );
}
