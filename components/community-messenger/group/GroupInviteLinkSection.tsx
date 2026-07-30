"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { GroupInviteLinkState } from "@/lib/community-messenger/group/use-group-room-invite-link";

type LinkRow = {
  id: string;
  name: string | null;
  inviteUrl: string;
  inviteToken: string;
  requiresApproval: boolean;
  usageCount: number;
  usageLimit: number | null;
  expiresAt: string | null;
  isDefault: boolean;
};

type JoinRequestRow = {
  id: string;
  userId: string;
  userLabel?: string | null;
  username?: string | null;
  linkName?: string | null;
  requestedAt: string;
};

type GroupInviteLinkSectionProps = {
  roomId: string;
  state: GroupInviteLinkState;
  loading: boolean;
  canManage: boolean;
  busy: string | null;
  onCopy: () => void;
  onRegenerate: () => void;
  onDisable: () => void;
};

export function GroupInviteLinkSection({
  roomId,
  state,
  loading,
  canManage,
  busy,
  onCopy,
  onRegenerate,
  onDisable,
}: GroupInviteLinkSectionProps) {
  const { t, safeT } = useI18n();
  const inviteBusy = busy === "group-invite";
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [requests, setRequests] = useState<JoinRequestRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [decideBusy, setDecideBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!roomId || !canManage) return;
    const [linksRes, reqRes] = await Promise.all([
      fetch(`/api/community-messenger/group-rooms/${encodeURIComponent(roomId)}/invite-links`),
      fetch(`/api/community-messenger/group-rooms/${encodeURIComponent(roomId)}/join-requests`),
    ]);
    const linksJson = (await linksRes.json().catch(() => ({}))) as { ok?: boolean; links?: LinkRow[] };
    const reqJson = (await reqRes.json().catch(() => ({}))) as {
      ok?: boolean;
      requests?: JoinRequestRow[];
      pendingCount?: number;
    };
    if (linksRes.ok && linksJson.ok && Array.isArray(linksJson.links)) setLinks(linksJson.links);
    if (reqRes.ok && reqJson.ok) {
      setRequests(reqJson.requests ?? []);
      setPendingCount(reqJson.pendingCount ?? 0);
    }
  }, [canManage, roomId]);

  useEffect(() => {
    void refresh();
  }, [refresh, state.inviteUrl]);

  async function createLink() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/community-messenger/group-rooms/${encodeURIComponent(roomId)}/invite-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: linkName.trim() || null,
          requiresApproval,
          isDefault: links.length === 0,
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        setLinkName("");
        setRequiresApproval(false);
        await refresh();
      }
    } finally {
      setCreating(false);
    }
  }

  async function revokeLink(linkId: string) {
    const res = await fetch(
      `/api/community-messenger/group-rooms/${encodeURIComponent(roomId)}/invite-links/${encodeURIComponent(linkId)}`,
      { method: "DELETE" }
    );
    if (res.ok) await refresh();
  }

  async function decide(requestId: string, decision: "approved" | "rejected") {
    if (decideBusy) return;
    setDecideBusy(requestId);
    try {
      const res = await fetch(`/api/community-messenger/group-rooms/${encodeURIComponent(roomId)}/join-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, decision }),
      });
      if (res.ok) await refresh();
      else await refresh();
    } finally {
      setDecideBusy(null);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-ui-rect border border-[#006241]/25 bg-[#EAF4EF] p-4">
        <div className="flex items-start gap-2">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-[#006241]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="sam-text-body font-semibold text-[#006241]">{t("cm_ui_group_invite_link")}</p>
            <p className="mt-1 break-all sam-text-helper text-[#004C3F]">
              {loading
                ? t("chats_spinner_loading_aria")
                : state.enabled && state.inviteUrl
                  ? state.inviteUrl
                  : safeT("cm_ui_group_invite_link_disabled", {
                      fallbackKo: "초대 링크가 비활성화되어 있습니다.",
                      fallbackEn: "Invite link is disabled.",
                    })}
            </p>
          </div>
        </div>
        {canManage ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCopy}
              disabled={!state.enabled || !state.inviteUrl || inviteBusy}
              className="min-h-[44px] rounded-ui-rect border border-[#006241]/30 bg-white px-3 py-2 sam-text-helper font-semibold text-[#006241] disabled:opacity-40"
            >
              {t("common_copy")}
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={inviteBusy}
              className="min-h-[44px] rounded-ui-rect bg-[#006241] px-3 py-2 sam-text-helper font-semibold text-white disabled:opacity-40"
            >
              {t("cm_ui_group_invite_regenerate")}
            </button>
            <button
              type="button"
              onClick={onDisable}
              disabled={!state.enabled || inviteBusy}
              className="min-h-[44px] rounded-ui-rect border border-red-200 bg-white px-3 py-2 sam-text-helper font-semibold text-red-600 disabled:opacity-40"
            >
              {t("cm_ui_group_invite_disable")}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="min-h-[44px] rounded-ui-rect border border-[#006241]/30 bg-white px-3 py-2 sam-text-helper font-semibold text-[#006241]"
            >
              {safeT("cm_ui_group_invite_create_link", {
                fallbackKo: "새 링크 만들기",
                fallbackEn: "Create new link",
              })}
            </button>
          </div>
        ) : null}
      </div>

      {canManage && showCreate ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-body font-semibold text-sam-fg">
            {safeT("cm_ui_group_invite_create_link", {
              fallbackKo: "새 링크 만들기",
              fallbackEn: "Create new link",
            })}
          </p>
          <input
            value={linkName}
            onChange={(e) => setLinkName(e.target.value)}
            placeholder={safeT("cm_ui_group_invite_link_name_ph", {
              fallbackKo: "링크 이름 (선택)",
              fallbackEn: "Link name (optional)",
            })}
            className="mt-3 h-10 w-full rounded-ui-rect border border-sam-border px-3 sam-text-body"
          />
          <label className="mt-3 flex items-center gap-2 sam-text-helper text-sam-fg">
            <input
              type="checkbox"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
            />
            {safeT("cm_ui_group_invite_requires_approval", {
              fallbackKo: "관리자 승인 필요",
              fallbackEn: "Require admin approval",
            })}
          </label>
          <button
            type="button"
            disabled={creating}
            onClick={() => void createLink()}
            className="mt-3 min-h-[44px] w-full rounded-ui-rect bg-[#006241] px-3 py-2 sam-text-helper font-semibold text-white disabled:opacity-40"
          >
            {creating
              ? t("cm_ui_creating")
              : safeT("cm_ui_group_invite_create_link", {
                  fallbackKo: "링크 만들기",
                  fallbackEn: "Create link",
                })}
          </button>
        </div>
      ) : null}

      {canManage && links.length > 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-body font-semibold text-sam-fg">
            {safeT("cm_ui_group_invite_links_list", {
              fallbackKo: "초대 링크",
              fallbackEn: "Invite links",
            })}
          </p>
          <ul className="mt-3 space-y-3">
            {links.map((link) => (
              <li key={link.id} className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
                <p className="sam-text-body font-medium text-sam-fg">
                  {link.name ||
                    (link.isDefault
                      ? safeT("cm_ui_group_invite_default_link", {
                          fallbackKo: "기본 링크",
                          fallbackEn: "Default link",
                        })
                      : safeT("cm_ui_group_invite_link", {
                          fallbackKo: "초대 링크",
                          fallbackEn: "Invite link",
                        }))}
                </p>
                <p className="mt-1 break-all sam-text-helper text-sam-muted">{link.inviteUrl}</p>
                <p className="mt-1 sam-text-helper text-sam-muted">
                  {link.requiresApproval
                    ? safeT("cm_ui_group_invite_requires_approval", {
                        fallbackKo: "관리자 승인 필요",
                        fallbackEn: "Require admin approval",
                      })
                    : safeT("cm_ui_group_invite_instant_join", {
                        fallbackKo: "즉시 참여",
                        fallbackEn: "Instant join",
                      })}
                  {" · "}
                  {link.usageCount}
                  {link.usageLimit != null ? `/${link.usageLimit}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-ui-rect border border-sam-border px-3 py-1.5 sam-text-helper"
                    onClick={() => void navigator.clipboard.writeText(link.inviteUrl)}
                  >
                    {t("common_copy")}
                  </button>
                  <button
                    type="button"
                    className="rounded-ui-rect border border-red-200 px-3 py-1.5 sam-text-helper text-red-600"
                    onClick={() => void revokeLink(link.id)}
                  >
                    {safeT("cm_ui_group_invite_revoke", {
                      fallbackKo: "링크 폐기",
                      fallbackEn: "Revoke link",
                    })}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canManage ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-body font-semibold text-sam-fg">
            {safeT("cm_ui_group_join_requests_title", {
              fallbackKo: `가입 요청${pendingCount ? ` ${pendingCount}` : ""}`,
              fallbackEn: `Join requests${pendingCount ? ` ${pendingCount}` : ""}`,
            })}
          </p>
          {requests.length === 0 ? (
            <p className="mt-2 sam-text-helper text-sam-muted">
              {safeT("cm_ui_group_join_requests_empty", {
                fallbackKo: "대기 중인 가입 요청이 없습니다.",
                fallbackEn: "No pending join requests.",
              })}
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {requests.map((req) => (
                <li key={req.id} className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
                  <p className="sam-text-body font-medium text-sam-fg">{req.userLabel || req.username || req.userId.slice(0, 8)}</p>
                  {req.linkName ? (
                    <p className="sam-text-helper text-sam-muted">{req.linkName}</p>
                  ) : null}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={decideBusy === req.id}
                      className="min-h-[40px] flex-1 rounded-ui-rect bg-[#006241] px-3 py-2 sam-text-helper font-semibold text-white disabled:opacity-40"
                      onClick={() => void decide(req.id, "approved")}
                    >
                      {safeT("cm_ui_group_join_approve", { fallbackKo: "승인", fallbackEn: "Approve" })}
                    </button>
                    <button
                      type="button"
                      disabled={decideBusy === req.id}
                      className="min-h-[40px] flex-1 rounded-ui-rect border border-red-200 px-3 py-2 sam-text-helper font-semibold text-red-600 disabled:opacity-40"
                      onClick={() => void decide(req.id, "rejected")}
                    >
                      {safeT("cm_ui_group_join_reject", { fallbackKo: "거절", fallbackEn: "Reject" })}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
