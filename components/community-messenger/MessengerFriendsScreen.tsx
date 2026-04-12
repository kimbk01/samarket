"use client";

import { useMemo, useState, type ReactNode } from "react";
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
  /** QR · 초대 링크 시트 (같은 진입점) */
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
  const [requestsOpen, setRequestsOpen] = useState(true);
  const requestSections = useMemo(() => {
    const received = requests.filter((request) => request.direction === "incoming");
    const sent = requests.filter((request) => request.direction === "outgoing");
    return { received, sent, suggested: friendStateModel.suggested };
  }, [friendStateModel.suggested, requests]);
  const requestTotal =
    requestSections.received.length + requestSections.sent.length + requestSections.suggested.length;

  const myIdLine = me?.subtitle?.trim() || (me?.id ? `id · ${me.id.slice(0, 8)}…` : "");

  return (
    <section className="space-y-3 pt-2">
      {/* A) My profile — compact */}
      <div className="rounded-ui-rect border border-ui-border bg-ui-surface px-3 py-3">
        <div className="flex items-center gap-3">
          <AvatarCircle src={me?.avatarUrl ?? null} label={me?.label ?? "나"} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-ui-fg">{me?.label ?? "내 프로필"}</p>
            <p className="mt-0.5 truncate text-[12px] text-ui-muted">{me?.subtitle ?? "상태 메시지를 설정해 보세요."}</p>
            {myIdLine ? <p className="mt-0.5 truncate text-[11px] text-ui-muted tabular-nums">{myIdLine}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => me && onOpenProfile(me)}
            className="shrink-0 rounded-ui-rect border border-ui-border bg-ui-page px-2.5 py-1.5 text-[12px] font-medium text-ui-fg"
          >
            편집
          </button>
        </div>
        <div className="mt-3 flex border-t border-ui-border pt-3">
          <button
            type="button"
            onClick={onOpenInviteTools}
            className="flex flex-1 items-center justify-center border-r border-ui-border py-1.5 text-[12px] font-medium text-ui-fg"
          >
            QR
          </button>
          <button
            type="button"
            onClick={onOpenInviteTools}
            className="flex flex-1 items-center justify-center py-1.5 text-[12px] font-medium text-ui-fg"
          >
            초대 링크
          </button>
        </div>
      </div>

      {/* B) Favorites — horizontal */}
      <section>
        <div className="mb-1.5 flex items-center justify-between px-0.5">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ui-muted">즐겨찾기</h2>
          <span className="text-[11px] text-ui-muted tabular-nums">{friendStateModel.favorites.length}</span>
        </div>
        {favoriteFriends.length ? (
          <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:thin]">
            {favoriteFriends.map((friend) => (
              <div
                key={friend.id}
                className="flex w-[76px] shrink-0 flex-col items-center gap-1.5 rounded-ui-rect border border-ui-border bg-ui-surface px-1.5 py-2"
              >
                <button type="button" onClick={() => onOpenProfile(friend)} className="flex flex-col items-center gap-1">
                  <AvatarCircle src={friend.avatarUrl ?? null} label={friend.label} size="sm" />
                  <span className="w-full truncate text-center text-[11px] font-medium text-ui-fg">{friend.label}</span>
                </button>
                <div className="flex w-full gap-0.5">
                  <IconAction label="채팅" onClick={() => onStartChat(friend.id)} />
                  <IconAction label="음성" onClick={() => onStartCall(friend.id, "voice")} />
                  <IconAction label="영상" onClick={() => onStartCall(friend.id, "video")} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-ui-rect border border-dashed border-ui-border px-3 py-4 text-center text-[12px] text-ui-muted">즐겨찾기 친구가 없습니다.</p>
        )}
      </section>

      {/* C) Requests — collapsible */}
      <section className="rounded-ui-rect border border-ui-border bg-ui-surface">
        <button
          type="button"
          onClick={() => setRequestsOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-left"
        >
          <span className="text-[13px] font-semibold text-ui-fg">친구 요청</span>
          <span className="text-[12px] text-ui-muted">
            {requestTotal} · {requestsOpen ? "접기" : "펼치기"}
          </span>
        </button>
        {requestsOpen ? (
          <div className="border-t border-ui-border">
            <RequestBlock
              title="받은 요청"
              rows={requestSections.received.map((request) => (
                <RequestRow
                  key={request.id}
                  label={request.requesterLabel}
                  helper="받은 요청"
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
            <RequestBlock
              title="보낸 요청"
              rows={requestSections.sent.map((request) => (
                <RequestRow
                  key={request.id}
                  label={request.addresseeLabel}
                  helper="보낸 요청"
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
            <RequestBlock
              title="추천"
              rows={requestSections.suggested.map((entry) => (
                <RequestRow
                  key={entry.profile.id}
                  label={entry.profile.label}
                  helper={entry.profile.subtitle ?? "추천"}
                  actions={<ActionFilledButton label="보기" onClick={() => onOpenProfile(entry.profile)} />}
                />
              ))}
            />
          </div>
        ) : null}
      </section>

      {/* D) Friend list */}
      <section>
        <div className="mb-1.5 flex items-center justify-between px-0.5">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ui-muted">친구</h2>
          <span className="text-[11px] text-ui-muted tabular-nums">{sortedFriends.length}</span>
        </div>
        <div className="divide-y divide-ui-border overflow-hidden rounded-ui-rect border border-ui-border bg-ui-surface">
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
            <div className="px-3 py-8 text-center text-[12px] text-ui-muted">아직 친구가 없습니다.</div>
          )}
        </div>
      </section>

      {/* E) Hidden / blocked — collapsed */}
      <section>
        <button
          type="button"
          onClick={onToggleHiddenOpen}
          className="flex w-full items-center justify-between rounded-ui-rect border border-ui-border bg-ui-surface px-3 py-2.5 text-left"
        >
          <div>
            <p className="text-[13px] font-medium text-ui-fg">숨김 · 차단 · 알림 끔</p>
            <p className="mt-0.5 text-[11px] text-ui-muted">
              숨김 {friendStateModel.hidden.length} · 차단 {friendStateModel.blocked.length} · 끔 {friendStateModel.muted.length}
            </p>
          </div>
          <span className="text-[12px] text-ui-muted">{friendsHiddenOpen ? "접기" : "관리"}</span>
        </button>
        {friendsHiddenOpen ? (
          <div className="mt-2 space-y-2 rounded-ui-rect border border-ui-border bg-ui-surface p-2">
            <SubPanel title="숨김">
              {friendStateModel.hidden.length ? (
                friendStateModel.hidden.map((entry) => (
                  <BasicListRow
                    key={entry.profile.id}
                    label={entry.profile.label}
                    helper={entry.profile.subtitle ?? ""}
                    actionLabel="해제"
                    onAction={() => onToggleHidden(entry.profile.id)}
                  />
                ))
              ) : (
                <p className="px-2 py-2 text-[12px] text-ui-muted">없음</p>
              )}
            </SubPanel>
            <SubPanel title="차단">
              {friendStateModel.blocked.length ? (
                friendStateModel.blocked.map((entry) => (
                  <BasicListRow
                    key={entry.profile.id}
                    label={entry.profile.label}
                    helper=""
                    actionLabel="해제"
                    onAction={() => onToggleBlock(entry.profile.id)}
                  />
                ))
              ) : (
                <p className="px-2 py-2 text-[12px] text-ui-muted">없음</p>
              )}
            </SubPanel>
            <SubPanel title="알림 끔">
              {friendStateModel.muted.length ? (
                friendStateModel.muted.map((entry) => (
                  <BasicListRow
                    key={entry.profile.id}
                    label={entry.profile.label}
                    helper=""
                    actionLabel="대화"
                    onAction={() => onStartChat(entry.profile.id)}
                  />
                ))
              ) : (
                <p className="px-2 py-2 text-[12px] text-ui-muted">없음</p>
              )}
            </SubPanel>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function RequestBlock({ title, rows }: { title: string; rows: ReactNode[] }) {
  return (
    <div className="border-b border-ui-border last:border-b-0">
      <p className="px-3 py-1.5 text-[11px] font-medium text-ui-muted">{title}</p>
      {rows.length ? <div className="divide-y divide-ui-border">{rows}</div> : <p className="px-3 pb-2 text-[12px] text-ui-muted">없음</p>}
    </div>
  );
}

function SubPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 px-1 text-[11px] font-medium text-ui-muted">{title}</p>
      <div className="rounded-ui-rect border border-ui-border divide-y divide-ui-border">{children}</div>
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
  actions: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-ui-fg">{label}</p>
        {helper ? <p className="truncate text-[11px] text-ui-muted">{helper}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
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
    <div className="flex items-center justify-between gap-2 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-ui-fg">{label}</p>
        {helper ? <p className="truncate text-[11px] text-ui-muted">{helper}</p> : null}
      </div>
      <ActionTextButton label={actionLabel} onClick={onAction} />
    </div>
  );
}

function IconAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 flex-1 rounded-ui-rect border border-ui-border bg-ui-page py-1 text-[9px] font-medium text-ui-fg"
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
      className="rounded-ui-rect border border-ui-border bg-ui-page px-2 py-1.5 text-[11px] font-medium text-ui-fg disabled:opacity-50"
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
      className="rounded-ui-rect border border-ui-fg bg-ui-fg px-2 py-1.5 text-[11px] font-semibold text-ui-surface disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function AvatarCircle({ src, label, size }: { src: string | null; label: string; size: "sm" | "md" }) {
  const initial = label.trim().slice(0, 1) || "?";
  const box = size === "sm" ? "h-10 w-10 text-[13px]" : "h-12 w-12 text-[15px]";
  return (
    <div className={`shrink-0 overflow-hidden rounded-full bg-ui-hover ${box}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-semibold text-ui-muted">{initial}</div>
      )}
    </div>
  );
}
