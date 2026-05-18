"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { philifeMeetingApi } from "@domain/philife/api";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MeetingReportModal } from "@/components/meetings/MeetingReportModal";
import { JoinRequestMessagePreview } from "@/components/meetings/JoinRequestMessagePreview";
import type { ReportTargetType } from "@/components/meetings/MeetingReportModal";
import { formatKorDate } from "@/lib/ui/format-meeting-date";
import type { MeetingMemberListItemDTO } from "@/lib/neighborhood/types";

export type MemberStatus =
  | "joined"
  | "pending"
  | "rejected"
  | "left"
  | "kicked"
  | "banned";

export interface MemberRow {
  userId: string;
  name: string;
  role?: "host" | "co_host" | "member";
  status?: MemberStatus;
  joinedAt?: string | null;
  /** 승인 대기 시 meeting_join_requests.request_message (DTO 의 null 은 undefined 로 정규화) */
  requestMessage?: string;
}

/** DTO `requestMessage?: string | null` → 탭이 기대하는 `string | undefined`로 맞춤 — `npm run build` 대입 오류 방지 */
export function mapMeetingMemberListToTabRows(list: MeetingMemberListItemDTO[]): MemberRow[] {
  return list.map((m) => ({
    userId: m.userId,
    name: m.name,
    role: m.role,
    status: m.status,
    joinedAt: m.joinedAt,
    requestMessage: m.requestMessage == null || m.requestMessage === "" ? undefined : m.requestMessage,
  }));
}

interface MeetingMembersTabProps {
  joinedMembers: MemberRow[];
  pendingMembers?: MemberRow[];
  maxMembers: number;
  currentUserId?: string;
  meetingId?: string;
  isHost?: boolean;
}

const ROLE_COLOR: Record<string, string> = {
  host: "bg-emerald-500 text-white",
  co_host: "bg-emerald-100 text-emerald-800",
  member: "bg-sam-surface-muted text-sam-muted",
};

function formatJoinedAt(iso: string | null | undefined, joinedSuffix: string): string {
  const s = formatKorDate(iso);
  return s ? `${s} ${joinedSuffix}` : "";
}

function AvatarBubble({
  name,
  role,
  isMe,
}: {
  name: string;
  role?: string;
  isMe?: boolean;
}) {
  const { t } = useI18n();
  const isHost = role === "host";
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full sam-text-body font-bold ring-2 ring-sam-surface ${
          isHost ? "bg-emerald-500 text-white" : "bg-sam-surface-muted text-sam-muted"
        }`}
      >
        {(name || "?").charAt(0)}
        {isMe && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-sky-500 sam-text-xxs font-bold text-white ring-1 ring-sam-surface">
            {t("community_me")}
          </span>
        )}
      </div>
    </div>
  );
}

function MemberItem({
  member,
  isMe,
  isHost,
  meetingId,
  onKicked,
  onReport,
  joinedSuffix,
}: {
  member: MemberRow;
  isMe: boolean;
  isHost?: boolean;
  meetingId?: string;
  onKicked?: (userId: string) => void;
  onReport?: (userId: string) => void;
  joinedSuffix: string;
}) {
  const { t } = useI18n();
  const roleLabels: Record<string, string> = {
    host: t("community_role_owner"),
    co_host: t("community_role_cohost"),
    member: "",
  };
  const roleLabel = member.role ? (roleLabels[member.role] ?? "") : "";
  const roleColor = member.role ? (ROLE_COLOR[member.role] ?? ROLE_COLOR.member) : ROLE_COLOR.member;
  const [showActions, setShowActions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const canHostAct =
    isHost && !isMe && member.role !== "host" && meetingId && (member.status ?? "joined") === "joined";

  const doKick = async () => {
    if (!meetingId) return;
    setBusy(true);
    setErrMsg("");
    try {
      const mApi = philifeMeetingApi(meetingId);
      const res = await fetch(mApi.kick(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.userId }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) { setErrMsg(j.error ?? t("meeting_members_kick_failed")); return; }
      setShowActions(false);
      onKicked?.(member.userId);
    } catch { setErrMsg(t("common_network_error")); }
    finally { setBusy(false); }
  };

  const doBan = async () => {
    if (!meetingId) return;
    setBusy(true);
    setErrMsg("");
    try {
      const mApi = philifeMeetingApi(meetingId);
      const res = await fetch(mApi.ban(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.userId }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) { setErrMsg(j.error ?? t("community_meeting_ban_failed")); return; }
      setShowActions(false);
      onKicked?.(member.userId);
    } catch { setErrMsg(t("common_network_error")); }
    finally { setBusy(false); }
  };

  return (
    <li>
      <div className="flex items-center gap-3 py-3">
        {/* 아바타 */}
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full sam-text-body-secondary font-bold ${
            member.role === "host" ? "bg-emerald-500 text-white" : "bg-sam-surface-muted text-sam-muted"
          }`}
        >
          {(member.name || "?").charAt(0)}
        </div>

        {/* 이름 + 날짜 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate sam-text-body font-medium text-sam-fg">
              {member.name || t("meeting_unknown_member")}
            </span>
            {isMe && (
              <span className="rounded-full bg-sky-50 px-1.5 py-0 sam-text-xxs text-sky-600">{t("community_me")}</span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            {roleLabel ? (
              <span className={`rounded-full px-1.5 py-0 sam-text-xxs font-semibold ${roleColor}`}>
                {roleLabel}
              </span>
            ) : null}
            {member.joinedAt ? (
              <span className="sam-text-xxs text-sam-meta">{formatJoinedAt(member.joinedAt, joinedSuffix)}</span>
            ) : null}
          </div>
        </div>

        {/* 더보기 */}
        {!isMe && (
          <button
            type="button"
            onClick={() => setShowActions((v) => !v)}
            className="shrink-0 rounded-full p-1.5 text-sam-meta hover:bg-sam-surface-muted"
          >
            <svg width="16" height="4" viewBox="0 0 16 4" fill="currentColor">
              <circle cx="2" cy="2" r="1.5" />
              <circle cx="8" cy="2" r="1.5" />
              <circle cx="14" cy="2" r="1.5" />
            </svg>
          </button>
        )}
      </div>

      {/* 액션 패널 */}
      {showActions && (
        <div className="mb-2 ml-[52px] flex flex-wrap gap-2">
          {!isHost && (
            <button
              type="button"
              onClick={() => { setShowActions(false); onReport?.(member.userId); }}
              className="rounded-ui-rect bg-sam-surface-muted px-3 py-1.5 sam-text-helper font-medium text-sam-fg"
            >
              {t("meeting_members_report")}
            </button>
          )}
          {canHostAct && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void doKick()}
                className="rounded-ui-rect bg-orange-50 px-3 py-1.5 sam-text-helper font-medium text-orange-700 disabled:opacity-50"
              >
                {t("meeting_members_kick")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void doBan()}
                className="rounded-ui-rect bg-red-50 px-3 py-1.5 sam-text-helper font-medium text-red-700 disabled:opacity-50"
              >
                {t("community_meeting_ban_rejoin")}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowActions(false)}
            className="rounded-ui-rect border border-sam-border px-3 py-1.5 sam-text-helper text-sam-meta"
          >
            {t("common_close")}
          </button>
          {errMsg && <p className="w-full sam-text-xxs text-red-500">{errMsg}</p>}
        </div>
      )}
    </li>
  );
}

function PendingMemberRow({
  member,
  meetingId,
  onDone,
  joinedSuffix,
  requestedSuffix,
}: {
  member: MemberRow;
  meetingId: string;
  onDone: (userId: string, action: "approved" | "rejected") => void;
  joinedSuffix: string;
  requestedSuffix: string;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const mApi = philifeMeetingApi(meetingId);

  const handle = async (action: "approve" | "reject") => {
    setBusy(true);
    setErrMsg("");
    try {
      const url = action === "approve" ? mApi.approve() : mApi.reject();
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.userId }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) { setErrMsg(j.error ?? t("community_meeting_action_failed")); return; }
      onDone(member.userId, action === "approve" ? "approved" : "rejected");
    } catch { setErrMsg(t("common_network_error")); }
    finally { setBusy(false); }
  };

  return (
    <li className="rounded-ui-rect border border-amber-100 bg-sam-surface px-3 py-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 sam-text-body-secondary font-bold text-amber-900">
          {(member.name || "?").charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate sam-text-body font-medium text-sam-fg">
            {member.name || t("meeting_unknown_member")}
          </p>
          {member.joinedAt && (
            <p className="sam-text-xxs text-sam-muted">{formatJoinedAt(member.joinedAt, requestedSuffix)}</p>
          )}
          {member.requestMessage ? (
            <div className="mt-2">
              <JoinRequestMessagePreview text={member.requestMessage} />
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handle("approve")}
          className="flex-1 rounded-ui-rect bg-emerald-600 py-2.5 sam-text-body-secondary font-semibold text-white shadow-sm active:bg-emerald-700 disabled:opacity-50"
        >
          {t("meeting_members_approve")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handle("reject")}
          className="flex-1 rounded-ui-rect border border-amber-200 bg-amber-50/80 py-2.5 sam-text-body-secondary font-semibold text-amber-900 disabled:opacity-50"
        >
          {t("common_reject")}
        </button>
      </div>
      {errMsg && <p className="mt-2 sam-text-xxs text-red-600">{errMsg}</p>}
    </li>
  );
}

export function MeetingMembersTab({
  joinedMembers,
  pendingMembers = [],
  maxMembers,
  currentUserId,
  meetingId,
  isHost,
}: MeetingMembersTabProps) {
  const { t } = useI18n();
  const router = useRouter();
  const joinedSuffix = t("meeting_members_joined_suffix");
  const requestedSuffix = t("meeting_members_requested_suffix");
  const searchParams = useSearchParams();
  const memberSection = searchParams.get("memberSection");
  const [, startTransition] = useTransition();
  const [localPending, setLocalPending] = useState<MemberRow[]>(pendingMembers);
  useEffect(() => {
    setLocalPending(pendingMembers);
  }, [pendingMembers]);
  const [approvedCount, setApprovedCount] = useState(0);
  const [kickedIds, setKickedIds] = useState<Set<string>>(new Set());
  const [reportUserId, setReportUserId] = useState<string | null>(null);

  const sorted = [...joinedMembers]
    .filter((m) => !kickedIds.has(m.userId))
    .sort((a, b) => {
      const order: Record<string, number> = { host: 0, co_host: 1, member: 2 };
      return (order[a.role ?? "member"] ?? 2) - (order[b.role ?? "member"] ?? 2);
    });

  const totalJoined = sorted.length + approvedCount;
  const capacityPct = maxMembers > 0 ? Math.min(100, (totalJoined / maxMembers) * 100) : 0;

  const handleDone = (userId: string, action: "approved" | "rejected") => {
    setLocalPending((prev) => prev.filter((m) => m.userId !== userId));
    if (action === "approved") setApprovedCount((n) => n + 1);
    startTransition(() => router.refresh());
  };

  const handleKicked = (userId: string) => {
    setKickedIds((prev) => new Set(prev).add(userId));
    startTransition(() => router.refresh());
  };

  useEffect(() => {
    if (!memberSection) return;
    const id =
      memberSection === "pending"
        ? "meeting-members-pending"
        : memberSection === "joined"
          ? "meeting-members-joined"
          : null;
    if (!id) return;
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(t);
  }, [memberSection]);

  const showPendingEmpty = isHost && localPending.length === 0 && memberSection === "pending";

  return (
    <div className="space-y-3 pb-6">
      {/* 신고 모달 */}
      {reportUserId && meetingId && (
        <MeetingReportModal
          meetingId={meetingId}
          targetType={"member" as ReportTargetType}
          targetId={reportUserId}
          onClose={() => setReportUserId(null)}
        />
      )}

      {/* ── 정원 현황 + 아바타 미리보기 ────────────────── */}
      <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="sam-text-body font-semibold text-sam-fg">{t("meeting_members_title")}</span>
          <span className="sam-text-body-secondary text-sam-muted">
            {t("meeting_members_count", { joined: totalJoined, max: maxMembers })}
          </span>
        </div>

        {/* 정원 게이지 */}
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-sam-surface-muted">
          <div
            className={`h-full rounded-full transition-all ${
              capacityPct >= 90 ? "bg-red-400" : "bg-emerald-400"
            }`}
            style={{ width: `${capacityPct}%` }}
          />
        </div>

        {/* 아바타 행 */}
        {sorted.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-4">
            {sorted.slice(0, 12).map((m) => (
              <AvatarBubble
                key={m.userId}
                name={m.name}
                role={m.role}
                isMe={!!currentUserId && m.userId === currentUserId}
              />
            ))}
            {sorted.length > 12 && (
              <div className="flex flex-col items-center gap-1">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sam-surface-muted sam-text-xxs font-semibold text-sam-muted">
                  +{sorted.length - 12}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 가입 승인 (멤버 탭 전용 — 개설자 관리 패널과 UI 중복 없음) ── */}
      {showPendingEmpty ? (
        <div
          id="meeting-members-pending"
          className="scroll-mt-4 rounded-ui-rect border border-dashed border-amber-200 bg-amber-50/40 px-4 py-6 text-center shadow-sm"
        >
          <p className="sam-text-body-secondary font-medium text-amber-950">{t("meeting_members_pending_manage")}</p>
          <p className="mt-1 sam-text-helper text-amber-800/80">{t("meeting_members_pending_empty")}</p>
        </div>
      ) : null}

      {isHost && localPending.length > 0 && meetingId && (
        <div
          id="meeting-members-pending"
          className="scroll-mt-4 rounded-ui-rect border border-amber-200 bg-amber-50/70 p-3 shadow-sm"
        >
          <div className="mb-2.5 flex items-center justify-between gap-2 px-0.5">
            <h2 className="sam-text-body-secondary font-semibold text-amber-950">{t("meeting_members_pending_title")}</h2>
            <span className="rounded-full bg-amber-200/90 px-2.5 py-0.5 sam-text-xxs font-bold text-amber-950 tabular-nums">
              {localPending.length}
            </span>
          </div>
          <ul className="space-y-2.5">
            {localPending.map((m) => (
              <PendingMemberRow
                key={m.userId}
                member={m}
                meetingId={meetingId}
                onDone={handleDone}
                joinedSuffix={joinedSuffix}
                requestedSuffix={requestedSuffix}
              />
            ))}
          </ul>
        </div>
      )}

      {/* ── 멤버 목록 (⋮「참여자 관리」앵커) ───────────────── */}
      <div
        id="meeting-members-joined"
        className="scroll-mt-4 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 shadow-sm"
      >
        {sorted.length === 0 ? (
          <p className="py-8 text-center sam-text-body-secondary text-sam-meta">{t("meeting_members_empty")}</p>
        ) : (
          <ul className="divide-y divide-sam-border-soft">
            {sorted.map((m) => (
              <MemberItem
                key={m.userId}
                member={{ ...m, status: m.status ?? "joined" }}
                isMe={!!currentUserId && m.userId === currentUserId}
                isHost={isHost}
                meetingId={meetingId}
                onKicked={handleKicked}
                onReport={(uid) => setReportUserId(uid)}
                joinedSuffix={joinedSuffix}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
