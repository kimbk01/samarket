"use client";

import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

type Props = {
  me: CommunityMessengerProfileLite | null;
  onEdit: () => void;
  onOpenInviteTools: () => void;
};

export function MessengerFriendsMyProfileStrip({ me, onEdit, onOpenInviteTools }: Props) {
  const myIdLine = me?.subtitle?.trim() || (me?.id ? `ID · ${me.id.slice(0, 8)}…` : "");
  const initial = (me?.label ?? "나").trim().slice(0, 1) || "?";

  return (
    <div className="border-b border-ui-border bg-ui-surface">
      <button
        type="button"
        onClick={() => me && onEdit()}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-ui-hover"
      >
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-ui-hover">
          {me?.avatarUrl?.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.avatarUrl.trim()} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[15px] font-semibold text-ui-muted">{initial}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ui-fg">{me?.label ?? "내 프로필"}</p>
          <p className="truncate text-[12px] text-ui-muted">{me?.subtitle ?? "상태 메시지"}</p>
          {myIdLine ? <p className="mt-0.5 truncate text-[11px] text-ui-muted tabular-nums">{myIdLine}</p> : null}
        </div>
        <span className="shrink-0 text-[12px] font-medium text-ui-muted">편집</span>
      </button>
      <button
        type="button"
        onClick={onOpenInviteTools}
        className="w-full border-t border-ui-border py-2.5 text-[13px] font-medium text-ui-fg active:bg-ui-hover"
      >
        친구 추가 · ID 검색 / QR · 초대
      </button>
    </div>
  );
}
