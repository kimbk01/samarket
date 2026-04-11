"use client";

import { useMemo } from "react";
import { MessengerLineFriendRow } from "@/components/community-messenger/MessengerLineFriendRow";
import type { CommunityMessengerFriendRequest, CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import type { MessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";

type Props = {
  me: CommunityMessengerProfileLite | null;
  favoriteFriends: CommunityMessengerProfileLite[];
  sortedFriends: CommunityMessengerProfileLite[];
  friendStateModel: MessengerFriendStateModel;
  requests: CommunityMessengerFriendRequest[];
  busyId: string | null;
  friendsHiddenOpen: boolean;
  onToggleHiddenOpen: () => void;
  onOpenProfile: (profile: CommunityMessengerProfileLite) => void;
  onStartChat: (userId: string) => void;
  onStartCall: (userId: string, kind: "voice" | "video") => void;
  onToggleFavorite: (userId: string) => void;
  onToggleHidden: (userId: string) => void;
  onDeleteFriend: (userId: string) => void;
  onToggleBlock: (userId: string) => void;
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
  friendsHiddenOpen,
  onToggleHiddenOpen,
  onOpenProfile,
  onStartChat,
  onStartCall,
  onToggleFavorite,
  onToggleHidden,
  onDeleteFriend,
  onToggleBlock,
  onRequestAction,
  onOpenInviteTools,
}: Props) {
  const requestSections = useMemo(() => {
    const received = requests.filter((request) => request.direction === "incoming");
    const sent = requests.filter((request) => request.direction === "outgoing");
    return { received, sent, suggested: friendStateModel.suggested };
  }, [friendStateModel.suggested, requests]);

  return (
    <section className="space-y-4 pt-3">
      {/* 1) My profile */}
      <div className="rounded-ui-rect border border-gray-200 bg-white">
        <div className="flex items-center gap-3 px-4 py-4">
          <AvatarCircle src={me?.avatarUrl ?? null} label={me?.label ?? "프로필"} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold text-gray-900">{me?.label ?? "내 프로필"}</p>
            <p className="truncate text-[13px] text-gray-500">{me?.subtitle ?? "상태 메시지를 설정해 보세요."}</p>
          </div>
          <button
            type="button"
            onClick={() => me && onOpenProfile(me)}
            className="shrink-0 rounded-ui-rect border border-gray-200 px-3 py-2 text-[12px] font-medium text-gray-700"
          >
            편집
          </button>
        </div>
        <div className="flex border-t border-gray-100">
          <button
            type="button"
            onClick={onOpenInviteTools}
            className="flex-1 border-r border-gray-100 px-3 py-3 text-[12px] font-medium text-gray-700"
          >
            QR
          </button>
          <button
            type="button"
            onClick={onOpenInviteTools}
            className="flex-1 px-3 py-3 text-[12px] font-medium text-gray-700"
          >
            초대 링크
          </button>
        </div>
      </div>

      {/* 2) Favorite friends — 빠른 채팅·통화 (`outgoing-call-surfaces`: friendsFavoriteQuickActions) */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-gray-900">즐겨찾기</h2>
          <span className="text-[12px] text-gray-400">{friendStateModel.favorites.length}</span>
        </div>
        {favoriteFriends.length ? (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {favoriteFriends.map((friend) => (
              <div key={friend.id} className="rounded-ui-rect border border-gray-200 bg-white px-2 py-3">
                <button type="button" onClick={() => onOpenProfile(friend)} className="flex w-full flex-col items-center gap-2">
                  <AvatarCircle src={friend.avatarUrl ?? null} label={friend.label} />
                  <span className="w-full truncate text-center text-[12px] font-medium text-gray-900">{friend.label}</span>
                </button>
                <div className="mt-3 grid grid-cols-3 gap-1">
                  <QuickActionButton label="채팅" onClick={() => onStartChat(friend.id)} />
                  <QuickActionButton label="음성" onClick={() => onStartCall(friend.id, "voice")} />
                  <QuickActionButton label="영상" onClick={() => onStartCall(friend.id, "video")} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyPanel message="즐겨찾기 친구가 없습니다." />
        )}
      </section>

      {/* 3) Friend requests */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-gray-900">친구 요청</h2>
          <span className="text-[12px] text-gray-400">
            {requestSections.received.length + requestSections.sent.length + requestSections.suggested.length}
          </span>
        </div>
        <div className="overflow-hidden rounded-ui-rect border border-gray-200 bg-white">
          <RequestGroup
            title="받은 요청"
            rows={requestSections.received.map((request) => (
              <RequestRow
                key={request.id}
                label={request.requesterLabel}
                helper="나에게 온 친구 요청"
                actions={
                  <>
                    <ActionTextButton
                      label="거절"
                      onClick={() => onRequestAction(request.id, "reject")}
                      disabled={busyId === `request:${request.id}:reject`}
                    />
                    <ActionFilledButton
                      label="수락"
                      onClick={() => onRequestAction(request.id, "accept")}
                      disabled={busyId === `request:${request.id}:accept`}
                    />
                  </>
                }
              />
            ))}
          />
          <RequestGroup
            title="보낸 요청"
            rows={requestSections.sent.map((request) => (
              <RequestRow
                key={request.id}
                label={request.addresseeLabel}
                helper="내가 보낸 친구 요청"
                actions={
                  <ActionTextButton
                    label="취소"
                    onClick={() => onRequestAction(request.id, "cancel")}
                    disabled={busyId === `request:${request.id}:cancel`}
                  />
                }
              />
            ))}
          />
          <RequestGroup
            title="추천"
            rows={requestSections.suggested.map((entry) => (
              <RequestRow
                key={entry.profile.id}
                label={entry.profile.label}
                helper={entry.profile.subtitle ?? "알 수도 있는 사용자"}
                actions={
                  <ActionFilledButton label="프로필" onClick={() => onOpenProfile(entry.profile)} />
                }
              />
            ))}
          />
        </div>
      </section>

      {/* 4) Friend list — 행 탭 시 프로필 시트 */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-gray-900">친구 목록</h2>
          <span className="text-[12px] text-gray-400">{sortedFriends.length}</span>
        </div>
        <div className="overflow-hidden rounded-ui-rect border border-gray-200 bg-white">
          {sortedFriends.length ? (
            sortedFriends.map((friend) => (
              <MessengerLineFriendRow
                key={friend.id}
                friend={friend}
                busyFavorite={busyId === `favorite:${friend.id}`}
                busyDelete={busyId === `remove-friend:${friend.id}`}
                onRowPress={() => onOpenProfile(friend)}
                onToggleFavorite={() => onToggleFavorite(friend.id)}
                onDelete={() => onDeleteFriend(friend.id)}
              />
            ))
          ) : (
            <EmptyPanel message="아직 친구가 없습니다." />
          )}
        </div>
      </section>

      {/* 5) Hidden / blocked (folded) */}
      <section>
        <button
          type="button"
          onClick={onToggleHiddenOpen}
          className="flex w-full items-center justify-between rounded-ui-rect border border-gray-200 bg-white px-4 py-3 text-left"
        >
          <div>
            <p className="text-[13px] font-semibold text-gray-900">숨김 / 차단</p>
            <p className="mt-0.5 text-[12px] text-gray-500">
              숨김 {friendStateModel.hidden.length} · 차단 {friendStateModel.blocked.length} · 알림 끔 {friendStateModel.muted.length}
            </p>
          </div>
          <span className="text-[12px] text-gray-400">{friendsHiddenOpen ? "접기" : "펼치기"}</span>
        </button>
        {friendsHiddenOpen ? (
          <div className="mt-2 overflow-hidden rounded-ui-rect border border-gray-200 bg-white">
            <PanelSection title="숨김">
              {friendStateModel.hidden.length ? (
                friendStateModel.hidden.map((entry) => (
                  <BasicListRow
                    key={entry.profile.id}
                    label={entry.profile.label}
                    helper={entry.profile.subtitle ?? "숨김 처리된 친구"}
                    actionLabel="해제"
                    onAction={() => onToggleHidden(entry.profile.id)}
                  />
                ))
              ) : (
                <EmptyPanel message="숨김 처리된 친구가 없습니다." compact />
              )}
            </PanelSection>
            <PanelSection title="차단">
              {friendStateModel.blocked.length ? (
                friendStateModel.blocked.map((entry) => (
                  <BasicListRow
                    key={entry.profile.id}
                    label={entry.profile.label}
                    helper={entry.profile.subtitle ?? "차단된 사용자"}
                    actionLabel="해제"
                    onAction={() => onToggleBlock(entry.profile.id)}
                  />
                ))
              ) : (
                <EmptyPanel message="차단된 사용자가 없습니다." compact />
              )}
            </PanelSection>
            <PanelSection title="알림 끔">
              {friendStateModel.muted.length ? (
                friendStateModel.muted.map((entry) => (
                  <BasicListRow
                    key={entry.profile.id}
                    label={entry.profile.label}
                    helper={entry.profile.subtitle ?? "알림이 꺼진 친구"}
                    actionLabel="대화"
                    onAction={() => onStartChat(entry.profile.id)}
                  />
                ))
              ) : (
                <EmptyPanel message="알림을 끈 친구가 없습니다." compact />
              )}
            </PanelSection>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function RequestGroup({ title, rows }: { title: string; rows: React.ReactNode[] }) {
  return (
    <PanelSection title={title}>
      {rows.length ? rows : <EmptyPanel message={`${title} 항목이 없습니다.`} compact />}
    </PanelSection>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <div className="px-4 py-2.5">
        <p className="text-[12px] font-medium text-gray-500">{title}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

function RequestRow({
  label,
  helper,
  actions,
}: {
  label: string;
  helper: string;
  actions: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium text-gray-900">{label}</p>
        <p className="truncate text-[12px] text-gray-500">{helper}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </div>
  );
}

function BasicListRow({
  label,
  helper,
  actionLabel,
  onAction,
}: {
  label: string;
  helper: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium text-gray-900">{label}</p>
        <p className="truncate text-[12px] text-gray-500">{helper}</p>
      </div>
      <ActionTextButton label={actionLabel} onClick={onAction} />
    </div>
  );
}

function QuickActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-ui-rect border border-gray-200 bg-white px-1 py-1.5 text-[10px] font-medium text-gray-700"
    >
      {label}
    </button>
  );
}

function ActionTextButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-ui-rect border border-gray-200 px-3 py-2 text-[12px] font-medium text-gray-700 disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function ActionFilledButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-ui-rect border border-gray-900 bg-gray-900 px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function EmptyPanel({ message, compact = false }: { message: string; compact?: boolean }) {
  return <div className={`px-4 text-center text-[12px] text-gray-500 ${compact ? "py-4" : "py-8"}`}>{message}</div>;
}

function AvatarCircle({ src, label }: { src: string | null; label: string }) {
  const initial = label.trim().slice(0, 1) || "?";
  return (
    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-gray-100">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[16px] font-semibold text-gray-500">{initial}</div>
      )}
    </div>
  );
}
