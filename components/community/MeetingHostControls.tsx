"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { philifeMeetingApi } from "@domain/philife/api";
import {
  getCurrentUser,
  getHydrationSafeCurrentUser,
} from "@/lib/auth/get-current-user";
import type { NeighborhoodMeetingNoticeDTO } from "@/lib/neighborhood/types";

type AttendanceStatus = "unknown" | "attending" | "absent" | "excused";
type MemberRow = {
  user_id: string;
  label: string;
  role?: "host" | "co_host" | "member";
  attendance_status?: AttendanceStatus;
};
type BannedMemberRow = { user_id: string; label: string; reason?: string };
type InvitedMemberRow = { user_id: string; label: string };
type InviteCandidateRow = {
  userId: string;
  label: string;
  secondary: string;
  sameRegion?: boolean;
  neighborFollow?: boolean;
};

export function MeetingHostControls({
  meetingId,
  createdBy,
  members,
  notices = [],
  bannedMembers = [],
  invitedMembers = [],
  initialEntryPolicy = "open",
  hasPassword = false,
  canManage = false,
}: {
  meetingId: string;
  createdBy: string;
  members: MemberRow[];
  notices?: NeighborhoodMeetingNoticeDTO[];
  bannedMembers?: BannedMemberRow[];
  invitedMembers?: InvitedMemberRow[];
  initialEntryPolicy?: "open" | "approve" | "password" | "invite_only";
  hasPassword?: boolean;
  canManage?: boolean;
}) {
  const router = useRouter();
  const mApi = philifeMeetingApi(meetingId);
  const [mounted, setMounted] = useState(false);
  const me = mounted ? getCurrentUser() : getHydrationSafeCurrentUser();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeBody, setNoticeBody] = useState("");
  const [entryPolicy, setEntryPolicy] = useState<"open" | "approve" | "password" | "invite_only">(initialEntryPolicy);
  const [meetingPassword, setMeetingPassword] = useState("");
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [editingNoticeTitle, setEditingNoticeTitle] = useState("");
  const [editingNoticeBody, setEditingNoticeBody] = useState("");
  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteCandidates, setInviteCandidates] = useState<InviteCandidateRow[]>([]);
  const [inviteSearching, setInviteSearching] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isHost = me?.id && me.id === createdBy;

  useEffect(() => {
    setEntryPolicy(initialEntryPolicy);
  }, [initialEntryPolicy]);

  useEffect(() => {
    if (entryPolicy !== "invite_only") {
      setInviteCandidates([]);
      return;
    }
    const keyword = inviteUserId.trim();
    if (keyword.length < 2) {
      setInviteCandidates([]);
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        setInviteSearching(true);
        try {
          const res = await fetch(mApi.inviteCandidates(keyword), { cache: "no-store" });
          const j = (await res.json()) as {
            ok?: boolean;
            candidates?: InviteCandidateRow[];
          };
          setInviteCandidates(res.ok && j.ok && Array.isArray(j.candidates) ? j.candidates : []);
        } catch {
          setInviteCandidates([]);
        } finally {
          setInviteSearching(false);
        }
      })();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [entryPolicy, inviteUserId, meetingId]);

  const onSetAttendance = async (userId: string, status: AttendanceStatus) => {
    if (!canManage) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(mApi.attendance(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, status }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "참석 상태를 저장하지 못했습니다.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const onCloseMeeting = async () => {
    if (!isHost) return;
    if (!window.confirm("모임을 종료할까요? 이후 새 참여는 불가합니다.")) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(mApi.close(), { method: "POST" });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) router.refresh();
      else setErr(j.error ?? "종료 실패");
    } finally {
      setBusy(false);
    }
  };

  const onKick = async (userId: string) => {
    if (!isHost) return;
    if (!window.confirm("이 멤버를 내보낼까요?")) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(mApi.kick(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) router.refresh();
      else setErr(j.error ?? "처리 실패");
    } finally {
      setBusy(false);
    }
  };

  const onPromoteCoHost = async (userId: string) => {
    if (!isHost) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(mApi.cohost(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) router.refresh();
      else setErr(j.error ?? "공동 운영자 지정 실패");
    } finally {
      setBusy(false);
    }
  };

  const onDemoteCoHost = async (userId: string) => {
    if (!isHost) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(mApi.cohost(), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) router.refresh();
      else setErr(j.error ?? "공동 운영자 해제 실패");
    } finally {
      setBusy(false);
    }
  };

  const onCreateNotice = async () => {
    if (!isHost) return;
    const title = noticeTitle.trim();
    const body = noticeBody.trim();
    if (!title && !body) {
      setErr("공지 제목 또는 내용을 입력해 주세요.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(mApi.notices(), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, visibility: "members", isPinned: true }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        setNoticeTitle("");
        setNoticeBody("");
        router.refresh();
      } else setErr(j.error ?? "공지 등록 실패");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteNotice = async (noticeId: string) => {
    if (!isHost) return;
    if (!window.confirm("이 공지를 삭제할까요?")) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(mApi.notice(noticeId), {
        method: "DELETE",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) router.refresh();
      else setErr(j.error ?? "공지 삭제 실패");
    } finally {
      setBusy(false);
    }
  };

  const onStartEditNotice = (notice: NeighborhoodMeetingNoticeDTO) => {
    setEditingNoticeId(notice.id);
    setEditingNoticeTitle(notice.title ?? "");
    setEditingNoticeBody(notice.body ?? "");
    setErr("");
  };

  const onCancelEditNotice = () => {
    setEditingNoticeId(null);
    setEditingNoticeTitle("");
    setEditingNoticeBody("");
  };

  const onSaveNoticeEdit = async () => {
    if (!isHost || !editingNoticeId) return;
    if (!editingNoticeTitle.trim() && !editingNoticeBody.trim()) {
      setErr("공지 제목 또는 내용을 입력해 주세요.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(mApi.notice(editingNoticeId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editingNoticeTitle,
          body: editingNoticeBody,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        onCancelEditNotice();
        router.refresh();
      } else {
        setErr(j.error ?? "공지 수정 실패");
      }
    } finally {
      setBusy(false);
    }
  };

  const onUpdateAccessPolicy = async () => {
    if (!isHost) return;
    if (entryPolicy === "password" && !meetingPassword.trim() && !hasPassword) {
      setErr("비밀번호형 모임은 비밀번호를 먼저 설정해 주세요.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(mApi.detail, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryPolicy,
          password: meetingPassword.trim() || undefined,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        setMeetingPassword("");
        router.refresh();
      } else {
        setErr(j.error === "password_required" ? "비밀번호를 입력해 주세요." : j.error ?? "입장 설정 저장 실패");
      }
    } finally {
      setBusy(false);
    }
  };

  const onInvite = async (forcedUserId?: string) => {
    if (!isHost) return;
    const userId = String(forcedUserId ?? inviteUserId).trim();
    if (!userId) {
      setErr("초대할 사용자 ID를 입력해 주세요.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(mApi.invite(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        setInviteUserId("");
        setInviteCandidates([]);
        router.refresh();
      } else {
        setErr(j.error ?? "초대 실패");
      }
    } finally {
      setBusy(false);
    }
  };

  const onRevokeInvite = async (userId: string) => {
    if (!canManage) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(mApi.invite(), {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) router.refresh();
      else setErr(j.error ?? "초대 취소 실패");
    } finally {
      setBusy(false);
    }
  };

  const onBan = async (userId: string) => {
    if (!isHost) return;
    if (!window.confirm("이 사용자를 이 모임에서 차단할까요? 이후 다시 참여할 수 없습니다.")) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(mApi.ban(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, reason: "host_banned" }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) router.refresh();
      else setErr(j.error ?? "차단 실패");
    } finally {
      setBusy(false);
    }
  };

  const onUnban = async (userId: string) => {
    if (!isHost) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(mApi.unban(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) router.refresh();
      else setErr(j.error ?? "차단 해제 실패");
    } finally {
      setBusy(false);
    }
  };

  if (!canManage && !isHost) return null;

  return (
    <div className="space-y-3 rounded-ui-rect border border-amber-200 bg-amber-50/80 p-3">
      <p className="sam-text-body-secondary font-semibold text-amber-900">개설자 관리</p>
      {isHost ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onCloseMeeting()}
          className="w-full rounded-ui-rect border border-amber-300 bg-sam-surface py-2 sam-text-body-secondary font-medium text-amber-900"
        >
          모임 종료
        </button>
      ) : null}
      <div className="space-y-2 rounded-ui-rect border border-amber-200 bg-sam-surface/80 p-3">
        <p className="sam-text-helper font-semibold text-amber-900">입장 설정</p>
        {isHost ? (
          <>
            <select
              value={entryPolicy}
              onChange={(e) =>
                setEntryPolicy(
                  e.target.value === "approve" ||
                    e.target.value === "password" ||
                    e.target.value === "invite_only"
                    ? e.target.value
                    : "open"
                )
              }
              className="w-full rounded-ui-rect border border-amber-200 bg-sam-surface px-3 py-2 sam-text-body-secondary text-sam-fg outline-none"
            >
              <option value="open">바로 참여</option>
              <option value="approve">승인제</option>
              <option value="password">비밀번호</option>
              <option value="invite_only">초대/승인제</option>
            </select>
            {entryPolicy === "password" ? (
              <input
                type="password"
                value={meetingPassword}
                onChange={(e) => setMeetingPassword(e.target.value)}
                placeholder={hasPassword ? "새 비밀번호 입력 시 변경" : "모임 비밀번호 입력"}
                className="w-full rounded-ui-rect border border-amber-200 bg-sam-surface px-3 py-2 sam-text-body-secondary text-sam-fg outline-none"
              />
            ) : null}
            <button
              type="button"
              disabled={busy || (entryPolicy === "password" && !meetingPassword.trim() && !hasPassword)}
              onClick={() => void onUpdateAccessPolicy()}
              className="w-full rounded-ui-rect border border-amber-300 bg-sam-surface py-2 sam-text-body-secondary font-medium text-amber-900 disabled:opacity-50"
            >
              입장 설정 저장
            </button>
          </>
        ) : (
          <p className="sam-text-helper text-sam-muted">공동 운영자는 초대와 승인, 공지 관리만 할 수 있습니다.</p>
        )}
        {entryPolicy === "invite_only" && canManage ? (
          <div
            id="meeting-host-invite-section"
            className="space-y-2 scroll-mt-4 rounded-ui-rect border border-amber-100 bg-amber-50/60 p-3"
          >
            <p className="sam-text-helper font-semibold text-amber-900">초대 관리</p>
            <input
              value={inviteUserId}
              onChange={(e) => setInviteUserId(e.target.value)}
              placeholder="닉네임 또는 아이디로 검색"
              className="w-full rounded-ui-rect border border-amber-200 bg-sam-surface px-3 py-2 sam-text-body-secondary text-sam-fg outline-none"
            />
            {inviteSearching ? <p className="sam-text-helper text-sam-muted">검색 중...</p> : null}
            {inviteCandidates.length > 0 ? (
              <ul className="space-y-2 rounded-ui-rect border border-amber-100 bg-sam-surface p-2 sam-text-body-secondary">
                {inviteCandidates.map((candidate) => (
                  <li key={candidate.userId} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sam-fg">{candidate.label}</p>
                      <p className="truncate sam-text-xxs text-sam-muted">{candidate.secondary}</p>
                      {candidate.neighborFollow || candidate.sameRegion ? (
                        <p className="truncate sam-text-xxs text-amber-700">
                          {candidate.neighborFollow ? "관심이웃 우선" : ""}
                          {candidate.neighborFollow && candidate.sameRegion ? " · " : ""}
                          {candidate.sameRegion ? "같은 지역" : ""}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setInviteUserId(candidate.userId);
                        void onInvite(candidate.userId);
                      }}
                      className="shrink-0 text-amber-800 underline"
                    >
                      초대
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              disabled={busy || !inviteUserId.trim()}
              onClick={() => void onInvite()}
              className="w-full rounded-ui-rect bg-amber-500 py-2 sam-text-body-secondary font-medium text-white disabled:opacity-50"
            >
              초대 보내기
            </button>
            {invitedMembers.length > 0 ? (
              <ul className="space-y-2 sam-text-body-secondary">
                {invitedMembers.map((member) => (
                  <li key={member.user_id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-sam-fg">{member.label}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onRevokeInvite(member.user_id)}
                      className="shrink-0 text-red-700 underline"
                    >
                      초대 취소
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="space-y-2 rounded-ui-rect border border-amber-200 bg-sam-surface/80 p-3">
        <p className="sam-text-helper font-semibold text-amber-900">공지 작성</p>
        <input
          value={noticeTitle}
          onChange={(e) => setNoticeTitle(e.target.value)}
          placeholder="공지 제목"
          maxLength={120}
          className="w-full rounded-ui-rect border border-amber-200 bg-sam-surface px-3 py-2 sam-text-body-secondary text-sam-fg outline-none"
        />
        <textarea
          value={noticeBody}
          onChange={(e) => setNoticeBody(e.target.value)}
          placeholder="모임 공지 내용을 입력하세요"
          rows={3}
          maxLength={2000}
          className="w-full rounded-ui-rect border border-amber-200 bg-sam-surface px-3 py-2 sam-text-body-secondary text-sam-fg outline-none"
        />
        <button
          type="button"
          disabled={busy || (!noticeTitle.trim() && !noticeBody.trim())}
          onClick={() => void onCreateNotice()}
          className="w-full rounded-ui-rect bg-amber-500 py-2 sam-text-body-secondary font-medium text-white disabled:opacity-50"
        >
          공지 등록
        </button>
      </div>
      {notices.length > 0 ? (
        <div className="space-y-2 rounded-ui-rect border border-amber-200 bg-sam-surface/80 p-3">
          <p className="sam-text-helper font-semibold text-amber-900">등록된 공지</p>
          <ul className="space-y-2 sam-text-body-secondary">
            {notices.map((notice) => (
              <li key={notice.id} className="rounded-ui-rect border border-amber-100 bg-sam-surface px-3 py-2">
                {editingNoticeId === notice.id ? (
                  <div className="space-y-2">
                    <input
                      value={editingNoticeTitle}
                      onChange={(e) => setEditingNoticeTitle(e.target.value)}
                      placeholder="공지 제목"
                      maxLength={120}
                      className="w-full rounded-ui-rect border border-amber-200 bg-sam-surface px-3 py-2 sam-text-body-secondary text-sam-fg outline-none"
                    />
                    <textarea
                      value={editingNoticeBody}
                      onChange={(e) => setEditingNoticeBody(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      className="w-full rounded-ui-rect border border-amber-200 bg-sam-surface px-3 py-2 sam-text-body-secondary text-sam-fg outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onSaveNoticeEdit()}
                        className="flex-1 rounded-ui-rect bg-amber-500 py-2 sam-text-helper font-medium text-white disabled:opacity-50"
                      >
                        저장
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={onCancelEditNotice}
                        className="flex-1 rounded-ui-rect border border-sam-border bg-sam-surface py-2 sam-text-helper font-medium text-sam-fg"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sam-fg">{notice.title || "공지"}</p>
                      {notice.body ? <p className="mt-1 whitespace-pre-wrap sam-text-helper text-sam-fg">{notice.body}</p> : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onStartEditNotice(notice)}
                        className="text-amber-800 underline"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onDeleteNotice(notice.id)}
                        className="text-red-700 underline"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {isHost && bannedMembers.length > 0 ? (
        <div className="space-y-2 rounded-ui-rect border border-red-200 bg-sam-surface/80 p-3">
          <p className="sam-text-helper font-semibold text-red-900">차단된 사용자</p>
          <ul className="space-y-2 sam-text-body-secondary">
            {bannedMembers.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sam-fg">{m.label}</p>
                  {m.reason ? <p className="sam-text-xxs text-sam-muted">{m.reason}</p> : null}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onUnban(m.user_id)}
                  className="shrink-0 text-sky-700 underline"
                >
                  차단 해제
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {canManage && members.length > 0 ? (
        <div className="space-y-2 rounded-ui-rect border border-sky-200 bg-sky-50/50 p-3">
          <p className="sam-text-helper font-semibold text-sky-900">참석 확인</p>
          <ul className="space-y-2 sam-text-body-secondary">
            {members.map((m) => {
              const att: AttendanceStatus = m.attendance_status ?? "unknown";
              return (
                <li
                  key={m.user_id}
                  className="flex flex-col gap-2 rounded-ui-rect border border-sky-100 bg-sam-surface px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sam-fg">{m.label}</p>
                    {m.user_id === createdBy ? (
                      <p className="sam-text-xxs text-sam-muted">개설자</p>
                    ) : m.role === "co_host" ? (
                      <p className="sam-text-xxs text-amber-700">공동 운영자</p>
                    ) : null}
                  </div>
                  <label className="flex shrink-0 items-center gap-2 sam-text-helper text-sam-muted">
                    <span className="hidden sm:inline">참석</span>
                    <select
                      className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 sam-text-body-secondary text-sam-fg"
                      disabled={busy}
                      value={att}
                      onChange={(e) =>
                        void onSetAttendance(m.user_id, e.target.value as AttendanceStatus)
                      }
                    >
                      <option value="unknown">미정</option>
                      <option value="attending">참석</option>
                      <option value="absent">불참</option>
                      <option value="excused">불참(사유)</option>
                    </select>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {isHost && members.filter((m) => m.user_id !== createdBy).length > 0 ? (
        <div className="space-y-2 rounded-ui-rect border border-amber-200 bg-sam-surface/80 p-3">
          <p className="sam-text-helper font-semibold text-amber-900">멤버 관리</p>
          <ul className="space-y-1 sam-text-body-secondary">
            {members
              .filter((m) => m.user_id !== createdBy)
              .map((m) => (
                <li key={m.user_id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sam-fg">{m.label}</p>
                    {m.role === "co_host" ? <p className="sam-text-xxs text-amber-700">공동 운영자</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                  {m.role === "co_host" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onDemoteCoHost(m.user_id)}
                      className="text-amber-800 underline"
                    >
                      운영자 해제
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onPromoteCoHost(m.user_id)}
                      className="text-amber-800 underline"
                    >
                      공동 운영자
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onKick(m.user_id)}
                    className="text-red-700 underline"
                  >
                    내보내기
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onBan(m.user_id)}
                    className="text-red-900 underline"
                  >
                    차단
                  </button>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      ) : null}
      {err ? <p className="sam-text-helper text-red-600">{err}</p> : null}
    </div>
  );
}
