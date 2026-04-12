"use client";

import { useState } from "react";
import type { MessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";

type Tab = "hidden" | "blocked" | "muted";

type Props = {
  model: MessengerFriendStateModel;
  busyId: string | null;
  onClose: () => void;
  onToggleHidden: (userId: string) => void;
  onToggleBlock: (userId: string) => void;
  onOpenChat: (userId: string) => void;
};

export function MessengerFriendsPrivacySheet({
  model,
  busyId,
  onClose,
  onToggleHidden,
  onToggleBlock,
  onOpenChat,
}: Props) {
  const [tab, setTab] = useState<Tab>("hidden");

  const list =
    tab === "hidden" ? model.hidden : tab === "blocked" ? model.blocked : model.muted;

  return (
    <div className="fixed inset-0 z-[46] flex flex-col justify-end bg-black/30" role="dialog" aria-modal="true">
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onClose} />
      <div className="flex max-h-[min(78vh,600px)] w-full flex-col overflow-hidden rounded-t-[12px] border border-ui-border bg-ui-surface shadow-[0_-4px_24px_rgba(0,0,0,0.08)]">
        <div className="flex shrink-0 items-center justify-between border-b border-ui-border px-3 py-2.5">
          <p className="text-[16px] font-semibold text-ui-fg">숨김 · 차단 · 알림</p>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-ui-rect text-ui-muted active:bg-ui-hover"
            aria-label="닫기"
            onClick={onClose}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex shrink-0 border-b border-ui-border">
          {(
            [
              { id: "hidden" as const, label: "숨김", count: model.hidden.length },
              { id: "blocked" as const, label: "차단", count: model.blocked.length },
              { id: "muted" as const, label: "알림 끔", count: model.muted.length },
            ] as const
          ).map((seg) => (
            <button
              key={seg.id}
              type="button"
              onClick={() => setTab(seg.id)}
              className={`relative min-w-0 flex-1 px-1 py-2.5 text-[13px] font-medium ${
                tab === seg.id ? "text-ui-fg" : "text-ui-muted"
              }`}
            >
              <span className="line-clamp-1">
                {seg.label} ({seg.count})
              </span>
              {tab === seg.id ? <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-ui-fg" /> : null}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-ui-muted">목록이 비어 있습니다.</p>
          ) : (
            <ul className="divide-y divide-ui-border">
              {list.map((entry) => {
                const p = entry.profile;
                const initial = p.label.trim().slice(0, 1) || "?";
                return (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-ui-hover">
                      {p.avatarUrl?.trim() ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.avatarUrl.trim()} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[13px] font-semibold text-ui-muted">
                          {initial}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-ui-fg">{p.label}</p>
                      {p.subtitle ? <p className="truncate text-[11px] text-ui-muted">{p.subtitle}</p> : null}
                    </div>
                    <div className="shrink-0">
                      {tab === "hidden" ? (
                        <button
                          type="button"
                          onClick={() => onToggleHidden(p.id)}
                          disabled={busyId === `hidden:${p.id}`}
                          className="rounded-ui-rect border border-ui-border px-2.5 py-1.5 text-[12px] font-medium text-ui-fg disabled:opacity-50"
                        >
                          {busyId === `hidden:${p.id}` ? "…" : "해제"}
                        </button>
                      ) : null}
                      {tab === "blocked" ? (
                        <button
                          type="button"
                          onClick={() => onToggleBlock(p.id)}
                          disabled={busyId === `block:${p.id}`}
                          className="rounded-ui-rect border border-ui-border px-2.5 py-1.5 text-[12px] font-medium text-ui-fg disabled:opacity-50"
                        >
                          {busyId === `block:${p.id}` ? "…" : "해제"}
                        </button>
                      ) : null}
                      {tab === "muted" ? (
                        <button
                          type="button"
                          onClick={() => onOpenChat(p.id)}
                          disabled={busyId === `room:${p.id}`}
                          className="rounded-ui-rect border border-ui-border px-2.5 py-1.5 text-[12px] font-medium text-ui-fg disabled:opacity-50"
                        >
                          대화
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
