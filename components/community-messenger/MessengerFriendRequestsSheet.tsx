"use client";

import type { ReactNode } from "react";
import type { CommunityMessengerFriendRequest, CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import type { MessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";

type Props = {
  onClose: () => void;
  busyId: string | null;
  received: CommunityMessengerFriendRequest[];
  sent: CommunityMessengerFriendRequest[];
  suggested: MessengerFriendStateModel["suggested"];
  onRequestAction: (requestId: string, action: "accept" | "reject" | "cancel") => void | Promise<void>;
  onOpenProfile: (profile: CommunityMessengerProfileLite) => void;
};

/**
 * 친구 요청 목록 — 메인 화면 대형 블록 대신 바텀 시트로만 표시.
 */
export function MessengerFriendRequestsSheet({
  onClose,
  busyId,
  received,
  sent,
  suggested,
  onRequestAction,
  onOpenProfile,
}: Props) {
  return (
    <div className="fixed inset-0 z-[44] flex flex-col justify-end bg-black/30" role="dialog" aria-modal="true" aria-label="친구 요청">
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onClose} />
      <div className="max-h-[min(78vh,560px)] w-full overflow-y-auto rounded-t-[12px] border border-ui-border bg-ui-surface pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between border-b border-ui-border px-3 py-2.5">
          <p className="text-[16px] font-semibold text-ui-fg">친구 요청</p>
          <button type="button" className="text-[14px] text-ui-muted" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="divide-y divide-ui-border">
          <RequestSection title="받은 요청">
            {received.length ? (
              received.map((request) => (
                <div key={request.id} className="flex items-center gap-2.5 px-3 py-2.5">
                  <RequestAvatar label={request.requesterLabel} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-ui-fg">{request.requesterLabel}</p>
                    <p className="truncate text-[11px] text-ui-muted">받은 요청</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => void onRequestAction(request.id, "reject")}
                      disabled={busyId === `request:${request.id}:reject`}
                      className="rounded-ui-rect border border-ui-border px-2.5 py-1 text-[12px] text-ui-fg disabled:opacity-50"
                    >
                      거절
                    </button>
                    <button
                      type="button"
                      onClick={() => void onRequestAction(request.id, "accept")}
                      disabled={busyId === `request:${request.id}:accept`}
                      className="rounded-ui-rect border border-ui-fg bg-ui-fg px-2.5 py-1 text-[12px] font-semibold text-ui-surface disabled:opacity-50"
                    >
                      수락
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="px-3 py-3 text-[12px] text-ui-muted">받은 요청이 없습니다.</p>
            )}
          </RequestSection>
          <RequestSection title="보낸 요청">
            {sent.length ? (
              sent.map((request) => (
                <div key={request.id} className="flex items-center gap-2.5 px-3 py-2.5">
                  <RequestAvatar label={request.addresseeLabel} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-ui-fg">{request.addresseeLabel}</p>
                    <p className="truncate text-[11px] text-ui-muted">보낸 요청</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onRequestAction(request.id, "cancel")}
                    disabled={busyId === `request:${request.id}:cancel`}
                    className="shrink-0 rounded-ui-rect border border-ui-border px-2.5 py-1 text-[12px] text-ui-fg disabled:opacity-50"
                  >
                    취소
                  </button>
                </div>
              ))
            ) : (
              <p className="px-3 py-3 text-[12px] text-ui-muted">보낸 요청이 없습니다.</p>
            )}
          </RequestSection>
          <RequestSection title="추천">
            {suggested.length ? (
              suggested.map((entry) => {
                const p = entry.profile;
                const initial = p.label.trim().slice(0, 1) || "?";
                const avatarSrc = p.avatarUrl?.trim();
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenProfile(p);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left active:bg-ui-hover"
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
                      <p className="truncate text-[14px] font-medium text-ui-fg">{p.label}</p>
                      <p className="truncate text-[11px] text-ui-muted">{p.subtitle ?? "추천"}</p>
                    </div>
                    <span className="shrink-0 text-[12px] text-ui-muted">보기</span>
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-3 text-[12px] text-ui-muted">추천이 없습니다.</p>
            )}
          </RequestSection>
        </div>
      </div>
    </div>
  );
}

function RequestSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="bg-ui-page px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-ui-muted">{title}</p>
      {children}
    </div>
  );
}

function RequestAvatar({ label }: { label: string }) {
  const initial = label.trim().slice(0, 1) || "?";
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ui-hover text-[13px] font-semibold text-ui-muted">
      {initial}
    </div>
  );
}
