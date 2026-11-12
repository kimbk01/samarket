"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

type BanRow = {
  id: string;
  userId: string;
  bannedBy: string | null;
  bannedAt: string;
  reason: string | null;
  userLabel?: string | null;
  username?: string | null;
  bannedByLabel?: string | null;
};

type GroupBlockedMembersSectionProps = {
  roomId: string;
  canManage: boolean;
};

export function GroupBlockedMembersSection({ roomId, canManage }: GroupBlockedMembersSectionProps) {
  const { t, safeT } = useI18n();
  const [bans, setBans] = useState<BanRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!roomId || !canManage) return;
    const res = await fetch(`/api/community-messenger/group-rooms/${encodeURIComponent(roomId)}/bans`);
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; bans?: BanRow[] };
    if (res.ok && json.ok && Array.isArray(json.bans)) setBans(json.bans);
    setLoaded(true);
  }, [canManage, roomId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function unban(userId: string) {
    if (busyId) return;
    setBusyId(userId);
    try {
      const res = await fetch(
        `/api/community-messenger/group-rooms/${encodeURIComponent(roomId)}/bans?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" }
      );
      if (res.ok) await refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (!canManage) return null;

  return (
    <div className="mt-3 rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] p-4">
      <p className="text-[length:var(--overlay-body-2-size)] font-semibold text-[color:var(--overlay-text-primary)]">
        {safeT("cm_ui_blocked_members")}
      </p>
      {!loaded ? (
        <p className={`${OverlayUi.caption} mt-1`}>{t("chats_spinner_loading_aria")}</p>
      ) : bans.length === 0 ? (
        <p className={`${OverlayUi.caption} mt-1`}>
          {safeT("cm_ui_blocked_members_empty")}
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {bans.map((ban) => (
            <li key={ban.id} className="flex items-start gap-3 rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] px-3 py-3">
              <SamarketThumbnail
                src={null}
                size={40}
                roundedClassName="rounded-full"
                className="shrink-0 bg-sam-border-soft"
                fallbackSrc=""
                fallbackNode={
                  <span className="sam-text-helper font-semibold text-sam-muted">
                    {(ban.userLabel || ban.username || "?").slice(0, 1).toUpperCase()}
                  </span>
                }
              />
              <div className="min-w-0 flex-1">
                <p className="sam-text-body font-medium text-sam-fg">
                  {ban.userLabel || ban.username || ban.userId.slice(0, 8)}
                </p>
                {ban.username ? (
                  <p data-copyable="" className="sam-text-helper text-sam-muted">@{ban.username}</p>
                ) : null}
                <p className="mt-1 sam-text-helper text-sam-muted">
                  {ban.bannedAt
                    ? new Date(ban.bannedAt).toLocaleString()
                    : ""}
                  {ban.bannedByLabel ? ` · ${ban.bannedByLabel}` : ""}
                </p>
                <button
                  type="button"
                  disabled={busyId === ban.userId}
                  className={`${OverlayUi.btn.secondary} mt-2`}
                  onClick={() => void unban(ban.userId)}
                >
                  {safeT("cm_ui_unban_member")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
