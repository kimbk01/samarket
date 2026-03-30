"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { philifeMeetingApi } from "@domain/philife/api";
import { MeetingReportModal } from "@/components/meetings/MeetingReportModal";
import { JoinRequestMessagePreview } from "@/components/meetings/JoinRequestMessagePreview";
import type { ReportTargetType } from "@/components/meetings/MeetingReportModal";
import { formatKorDate } from "@/lib/ui/format-meeting-date";

export type MemberStatus =
  | "joined"
  | "pending"
  | "rejected"
  | "left"
  | "kicked"
  | "banned";

interface MemberRow {
  userId: string;
  name: string;
  role?: "host" | "co_host" | "member";
  status?: MemberStatus;
  joinedAt?: string | null;
  /** 승인 대기 시 meeting_join_requests.request_message */
  requestMessage?: string;
}

interface MeetingMembersTabProps {
  joinedMembers: MemberRow[];
  pendingMembers?: MemberRow[];
  maxMembers: number;
  currentUserId?: string;
  meetingId?: string;
  isHost?: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  host: "운영자",
  co_host: "공동 운영자",
  member: "",
};

const ROLE_COLOR: Record<string, string> = {
  host: "bg-emerald-500 text-white",
  co_host: "bg-emerald-100 text-emerald-800",
  member: "bg-gray-100 text-gray-600",
};

function formatJoinedAt(iso: string | null | undefined): string {
  const s = formatKorDate(iso);
  return s ? `${s} 참여` : "";
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
  const isHost = role === "host";
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[14px] font-bold ring-2 ring-white ${
          isHost ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-600"
        }`}
      >
        {(name || "?").charAt(0)}
        {isMe && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-sky-500 text-[8px] font-bold text-white ring-1 ring-white">
            나
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
}: {
  member: MemberRow;
  isMe: boolean;
  isHost?: boolean;
  meetingId?: string;
  onKicked?: (userId: string) => void;
  onReport?: (userId: string) => void;
}) {
  const roleLabel = member.role ? (ROLE_LABEL[member.role] ?? "") : "";
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
      if (!res.ok || !j.ok) { setErrMsg(j.error ?? "강퇴 실패"); return; }
      setShowActions(false);
      onKicked?.(member.userId);
    } catch { setErrMsg("네트워크 오류"); }
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
      if (!res.ok || !j.ok) { setErrMsg(j.error ?? "차단 실패"); return; }
      setShowActions(false);
      onKicked?.(member.userId);
    } catch { setErrMsg("네트워크 오류"); }
    finally { setBusy(false); }
  };

  return (
    <li>
      <div className="flex items-center gap-3 py-3">
        {/* 아바타 */}
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
            member.role === "host" ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-600"
          }`}
        >
          {(member.name || "?").charAt(0)}
        </div>

        {/* 이름 + 날짜 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-medium text-gray-900">
              {member.name || "알 수 없음"}
            </span>
            {isMe && (
              <span className="rounded-full bg-sky-50 px-1.5 py-0 text-[10px] text-sky-600">나</span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            {roleLabel ? (
              <span className={`rounded-full px-1.5 py-0 text-[10px] font-semibold ${roleColor}`}>
                {roleLabel}
              </span>
            ) : null}
            {member.joinedAt ? (
              <span className="text-[11px] text-gray-400">{formatJoinedAt(member.joinedAt)}</span>
            ) : null}
          </div>
        </div>

        {/* 더보기 */}
        {!isMe && (
          <button
            type="button"
            onClick={() => setShowActions((v) => !v)}
            className="shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-gray-100"
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
              className="rounded-xl bg-gray-100 px-3 py-1.5 text-[12px] font-medium text-gray-700"
            >
              🚨 신고
            </button>
          )}
          {canHostAct && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void doKick()}
                className="rounded-xl bg-orange-50 px-3 py-1.5 text-[12px] font-medium text-orange-700 disabled:opacity-50"
              >
                강퇴
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void doBan()}
                className="rounded-xl bg-red-50 px-3 py-1.5 text-[12px] font-medium text-red-700 disabled:opacity-50"
              >
                차단
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowActions(false)}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-[12px] text-gray-400"
          >
            닫기
          </button>
          {errMsg && <p className="w-full text-[11px] text-red-500">{errMsg}</p>}
        </div>
      )}
    </li>
  );
}

function PendingMemberRow({
  member,
  meetingId,
  onDone,
}: {
  member: MemberRow;
  meetingId: string;
  onDone: (userId: string, action: "approved" | "rejected") => void;
}) {
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
      if (!res.ok || !j.ok) { setErrMsg(j.error ?? "처리 실패"); return; }
      onDone(member.userId, action === "approve" ? "approved" : "rejected");
    } catch { setErrMsg("네트워크 오류"); }
    finally { setBusy(false); }
  };

  return (
    <li className="rounded-xl border border-amber-100 bg-white px-3 py-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[13px] font-bold text-amber-900">
          {(member.name || "?").charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-gray-900">
            {member.name || "알 수 없음"}
          </p>
          {member.joinedAt && (
            <p className="text-[11px] text-gray-500">{formatJoinedAt(member.joinedAt)?.replace("참여", "신청")}</p>
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
          className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-[13px] font-semibold text-white shadow-sm active:bg-emerald-700 disabled:opacity-50"
        >
          승인
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handle("reject")}
          className="flex-1 rounded-xl border border-amber-200 bg-amber-50/80 py-2.5 text-[13px] font-semibold text-amber-900 disabled:opacity-50"
        >
          거절
        </button>
      </div>
      {errMsg && <p className="mt-2 text-[11px] text-red-600">{errMsg}</p>}
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
  const router = useRouter();
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
      <div className="rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-semibold text-gray-900">참여 멤버</span>
          <span className="text-[13px] text-gray-500">
            {totalJoined}<span className="text-gray-300">/{maxMembers}</span>명
          </span>
        </div>

        {/* 정원 게이지 */}
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
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
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500">
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
          className="scroll-mt-4 rounded-2xl border border-dashed border-amber-200 bg-amber-50/40 px-4 py-6 text-center shadow-sm"
        >
          <p className="text-[13px] font-medium text-amber-950">가입 요청 관리</p>
          <p className="mt-1 text-[12px] text-amber-800/80">대기 중인 가입 요청이 없습니다.</p>
        </div>
      ) : null}

      {isHost && localPending.length > 0 && meetingId && (
        <div
          id="meeting-members-pending"
          className="scroll-mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 shadow-sm"
        >
          <div className="mb-2.5 flex items-center justify-between gap-2 px-0.5">
            <h2 className="text-[13px] font-semibold text-amber-950">가입 승인</h2>
            <span className="rounded-full bg-amber-200/90 px-2.5 py-0.5 text-[11px] font-bold text-amber-950 tabular-nums">
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
              />
            ))}
          </ul>
        </div>
      )}

      {/* ── 멤버 목록 (⋮「참여자 관리」앵커) ───────────────── */}
      <div
        id="meeting-members-joined"
        className="scroll-mt-4 rounded-2xl border border-gray-100 bg-white px-4 shadow-sm"
      >
        {sorted.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-gray-400">아직 참여자가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {sorted.map((m) => (
              <MemberItem
                key={m.userId}
                member={{ ...m, status: m.status ?? "joined" }}
                isMe={!!currentUserId && m.userId === currentUserId}
                isHost={isHost}
                meetingId={meetingId}
                onKicked={handleKicked}
                onReport={(uid) => setReportUserId(uid)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
