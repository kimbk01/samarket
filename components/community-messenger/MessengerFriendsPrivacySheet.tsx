"use client";

import { useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerHomeBottomSheetShell } from "@/components/community-messenger/MessengerSheetUi";
import type { MessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";

type Tab = "hidden" | "blocked" | "muted";

type Props = {
  model: MessengerFriendStateModel;
  busyId: string | null;
  onClose: () => void;
  onToggleHidden: (userId: string) => void;
  onToggleBlock: (userId: string) => void;
  onToggleMute: (userId: string) => void;
  friendNotificationsBusy: (userId: string) => boolean;
  onOpenChat: (userId: string) => void;
};

export function MessengerFriendsPrivacySheet({
  model,
  busyId,
  onClose,
  onToggleHidden,
  onToggleBlock,
  onToggleMute,
  friendNotificationsBusy,
  onOpenChat,
}: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("hidden");

  const list =
    tab === "hidden" ? model.hidden : tab === "blocked" ? model.blocked : model.muted;

  return (
    <MessengerHomeBottomSheetShell
      onClose={onClose}
      closeAriaLabel={t("nav_close")}
      dialogAriaLabel={t("cm_ui_hidden_blocked_notifications")}
      anchor="above-bottom-nav"
      panelClassName="flex max-h-[min(78dvh,600px)] flex-col overflow-hidden rounded-t-[12px]"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--messenger-divider)] px-3 py-2.5">
        <p className="sam-text-body-lg font-semibold" style={{ color: "var(--messenger-text)" }}>
          {t("cm_ui_hidden_blocked_notifications")}
        </p>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-ui-rect active:bg-[color:var(--messenger-primary-soft)]"
          style={{ color: "var(--messenger-text-secondary)" }}
          aria-label={t("nav_close")}
          onClick={onClose}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex shrink-0 border-b border-[color:var(--messenger-divider)]">
        {(
          [
            { id: "hidden" as const, label: t("common_hide"), count: model.hidden.length },
            { id: "blocked" as const, label: t("common_block"), count: model.blocked.length },
            { id: "muted" as const, label: t("cm_ui_notifications_off"), count: model.muted.length },
          ] as const
        ).map((seg) => (
          <button
            key={seg.id}
            type="button"
            onClick={() => setTab((prev) => (prev === seg.id ? prev : seg.id))}
            className={`relative min-w-0 flex-1 px-1 py-2.5 sam-text-body-secondary font-medium ${
              tab === seg.id ? "text-[color:var(--messenger-text)]" : "text-[color:var(--messenger-text-secondary)]"
            }`}
          >
            <span className="line-clamp-1">
              {seg.label} ({seg.count})
            </span>
            {tab === seg.id ? (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-[color:var(--messenger-text)]" />
            ) : null}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.length === 0 ? (
          <p className="px-4 py-8 text-center sam-text-body-secondary" style={{ color: "var(--messenger-text-secondary)" }}>
            {t("cm_ui_list_is_empty")}
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--messenger-divider)]">
            {list.map((entry) => {
              const p = entry.profile;
              const initial = p.label.trim().slice(0, 1) || "?";
              const muteBusy = friendNotificationsBusy(p.id);
              return (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                  <SamarketThumbnail
                    src={p.avatarUrl}
                    size={40}
                    roundedClassName="rounded-full"
                    className="bg-[color:var(--messenger-surface-muted)]"
                    fallbackSrc=""
                    fallbackNode={
                      <div
                        className="flex h-full w-full items-center justify-center sam-text-body-secondary font-semibold"
                        style={{ color: "var(--messenger-text-secondary)" }}
                      >
                        {initial}
                      </div>
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate sam-text-body font-medium" style={{ color: "var(--messenger-text)" }}>
                      {p.label}
                    </p>
                    {p.subtitle ? (
                      <p className="truncate sam-text-xxs" style={{ color: "var(--messenger-text-secondary)" }}>
                        {p.subtitle}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {tab === "hidden" ? (
                      <button
                        type="button"
                        onClick={() => onToggleHidden(p.id)}
                        disabled={busyId === `hidden:${p.id}`}
                        className="rounded-ui-rect border border-[color:var(--messenger-divider)] px-2.5 py-1.5 sam-text-helper font-medium disabled:opacity-50"
                        style={{ color: "var(--messenger-text)" }}
                      >
                        {busyId === `hidden:${p.id}` ? "…" : t("cm_ui_release")}
                      </button>
                    ) : null}
                    {tab === "blocked" ? (
                      <button
                        type="button"
                        onClick={() => onToggleBlock(p.id)}
                        disabled={busyId === `block:${p.id}`}
                        className="rounded-ui-rect border border-[color:var(--messenger-divider)] px-2.5 py-1.5 sam-text-helper font-medium disabled:opacity-50"
                        style={{ color: "var(--messenger-text)" }}
                      >
                        {busyId === `block:${p.id}` ? "…" : t("cm_ui_release")}
                      </button>
                    ) : null}
                    {tab === "muted" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onOpenChat(p.id)}
                          disabled={busyId === `room:${p.id}`}
                          className="rounded-ui-rect border border-[color:var(--messenger-divider)] px-2.5 py-1.5 sam-text-helper font-medium disabled:opacity-50"
                          style={{ color: "var(--messenger-text)" }}
                        >
                          {t("nav_conversation")}
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleMute(p.id)}
                          disabled={muteBusy}
                          className="flex h-9 w-9 items-center justify-center rounded-ui-rect border border-[color:var(--messenger-divider)] disabled:opacity-50 active:bg-[color:var(--messenger-primary-soft)]"
                          style={{ color: "var(--messenger-primary)" }}
                          aria-label={t("cm_ui_turn_on_conversation_notifications")}
                          title={t("cm_ui_turn_on_conversation_notifications")}
                        >
                          {muteBusy ? (
                            <span className="sam-text-xxs">…</span>
                          ) : (
                            <Bell className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                          )}
                        </button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </MessengerHomeBottomSheetShell>
  );
}

/** 친구 목록 요약 행 — 숨김·차단·알림 끔 카운트 옆 아이콘 */
export function MessengerFriendsPrivacySummaryIcons({
  hiddenCount,
  blockedCount,
  mutedCount,
}: {
  hiddenCount: number;
  blockedCount: number;
  mutedCount: number;
}) {
  const { t } = useI18n();
  const itemClass = "inline-flex items-center gap-0.5 tabular-nums";
  const iconClass = "h-3.5 w-3.5 shrink-0 opacity-80";

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 sam-text-xxs" style={{ color: "var(--messenger-text-secondary)" }}>
      <span className={itemClass} title={t("common_hide")}>
        <EyeOffIcon className={iconClass} />
        {hiddenCount}
      </span>
      <span aria-hidden>·</span>
      <span className={itemClass} title={t("common_block")}>
        <BanIcon className={iconClass} />
        {blockedCount}
      </span>
      <span aria-hidden>·</span>
      <span className={itemClass} title={t("cm_ui_notifications_off")}>
        <BellOff className={iconClass} strokeWidth={2} aria-hidden />
        {mutedCount}
      </span>
    </span>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.58 10.58a2 2 0 002.84 2.84M9.88 5.09A10.94 10.94 0 0112 5c5.52 0 10 4.48 10 10a10.94 10.94 0 01-1.41 5.12M6.1 6.1A10.94 10.94 0 003 15c0 5.52 4.48 10 10 10 2.05 0 3.95-.62 5.53-1.68" />
    </svg>
  );
}

function BanIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M5.5 5.5l13 13" />
    </svg>
  );
}
