"use client";

import { useState } from "react";
import { MessengerFriendsMyProfileStrip } from "@/components/community-messenger/MessengerFriendsMyProfileStrip";
import { MessengerLineFriendRow } from "@/components/community-messenger/MessengerLineFriendRow";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import type { MessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";

type Props = {
  me: CommunityMessengerProfileLite | null;
  sortedFriends: CommunityMessengerProfileLite[];
  friendStateModel: MessengerFriendStateModel;
  busyId: string | null;
  onOpenPrivacySummary: () => void;
  onOpenProfile: (profile: CommunityMessengerProfileLite) => void;
  onToggleFavorite: (userId: string) => void;
  onFriendHide: (userId: string) => void;
  onFriendRemove: (userId: string) => void;
  onFriendBlock: (userId: string) => void;
  onFriendChat: (userId: string) => void;
  onFriendVoiceCall: (userId: string) => void;
  onFriendVideoCall: (userId: string) => void;
  /** 1:1 방이 있는 친구에 대해 알림 끔 상태 */
  getFriendDirectRoomMuted: (userId: string) => boolean | undefined;
  /** 방 설정(알림) 처리 중 */
  friendNotificationsBusy: (userId: string) => boolean;
  onFriendToggleRoomMute: (userId: string) => void;
  /** 친구이며 1:1 방이 있을 때만 대화 알림 행 표시 */
  friendHasDirectRoom: (userId: string) => boolean;
};

export function MessengerFriendsScreen({
  me,
  sortedFriends,
  friendStateModel,
  busyId,
  onOpenPrivacySummary,
  onOpenProfile,
  onToggleFavorite,
  onFriendHide,
  onFriendRemove,
  onFriendBlock,
  onFriendChat,
  onFriendVoiceCall,
  onFriendVideoCall,
  getFriendDirectRoomMuted,
  friendNotificationsBusy,
  onFriendToggleRoomMute,
  friendHasDirectRoom,
}: Props) {
  const [openSwipeFriendId, setOpenSwipeFriendId] = useState<string | null>(null);

  return (
    <section className="space-y-2 pt-1">
      <MessengerFriendsMyProfileStrip me={me} />

      <div className="overflow-hidden rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] shadow-[var(--messenger-shadow-soft)]">
        <h2
          className="border-b border-[color:var(--messenger-divider)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--messenger-text-secondary)" }}
        >
          친구
        </h2>
        {sortedFriends.length ? (
          sortedFriends.map((friend) => (
            <MessengerLineFriendRow
              key={friend.id}
              friend={friend}
              busyId={busyId}
              busyFavorite={busyId === `favorite:${friend.id}`}
              onRowPress={() => onOpenProfile(friend)}
              onToggleFavorite={() => onToggleFavorite(friend.id)}
              onFriendChat={() => onFriendChat(friend.id)}
              onFriendVoiceCall={() => onFriendVoiceCall(friend.id)}
              onFriendVideoCall={() => onFriendVideoCall(friend.id)}
              showMuteRow={friend.isFriend && friendHasDirectRoom(friend.id)}
              directRoomMuted={getFriendDirectRoomMuted(friend.id)}
              notificationsBusy={friendNotificationsBusy(friend.id)}
              onToggleDirectMute={() => onFriendToggleRoomMute(friend.id)}
              openSwipeFriendId={openSwipeFriendId}
              onOpenSwipeFriendId={setOpenSwipeFriendId}
              onHideFriend={() => onFriendHide(friend.id)}
              onRemoveFriend={() => onFriendRemove(friend.id)}
              onBlockFriend={() => onFriendBlock(friend.id)}
            />
          ))
        ) : (
          <div className="px-3 py-5 text-center text-[12px]" style={{ color: "var(--messenger-text-secondary)" }}>
            아직 친구가 없습니다.
          </div>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={onOpenPrivacySummary}
          className="flex w-full items-center justify-between rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-3 py-2.5 text-left shadow-[var(--messenger-shadow-soft)] active:bg-[color:var(--messenger-primary-soft)]"
          style={{ color: "var(--messenger-text)" }}
        >
          <div>
            <p className="text-[14px] font-medium">숨김 · 차단 · 알림 끔</p>
            <p className="mt-0.5 text-[11px] tabular-nums" style={{ color: "var(--messenger-text-secondary)" }}>
              숨김 {friendStateModel.hidden.length} · 차단 {friendStateModel.blocked.length} · 끔 {friendStateModel.muted.length}
            </p>
          </div>
          <span className="text-[12px]" style={{ color: "var(--messenger-text-secondary)" }} aria-hidden>
            ›
          </span>
        </button>
      </div>
    </section>
  );
}
