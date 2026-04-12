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
    <div className="overflow-hidden rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] shadow-[var(--messenger-shadow-soft)]">
      <button
        type="button"
        onClick={() => me && onEdit()}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-[color:var(--messenger-primary-soft)]"
        style={{ color: "var(--messenger-text)" }}
      >
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-[color:var(--messenger-primary-soft)] ring-2 ring-[color:var(--messenger-primary-soft-2)]">
          {me?.avatarUrl?.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.avatarUrl.trim()} alt="" className="h-full w-full object-cover" />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-[15px] font-semibold"
              style={{ color: "var(--messenger-text-secondary)" }}
            >
              {initial}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{me?.label ?? "내 프로필"}</p>
          <p className="truncate text-[12px]" style={{ color: "var(--messenger-text-secondary)" }}>
            {me?.subtitle ?? "상태 메시지"}
          </p>
          {myIdLine ? (
            <p className="mt-0.5 truncate text-[11px] tabular-nums" style={{ color: "var(--messenger-text-secondary)" }}>
              {myIdLine}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 text-[12px] font-medium" style={{ color: "var(--messenger-primary)" }}>
          편집
        </span>
      </button>
      <button
        type="button"
        onClick={onOpenInviteTools}
        className="w-full border-t border-[color:var(--messenger-divider)] bg-[color:var(--messenger-primary-soft)] py-2.5 text-[13px] font-semibold text-[color:var(--messenger-primary)] active:opacity-90"
      >
        친구 추가 · ID 검색 / QR · 초대
      </button>
    </div>
  );
}
