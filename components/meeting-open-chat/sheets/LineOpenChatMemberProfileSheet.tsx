"use client";

import { useCallback, useEffect, useState } from "react";
import {
  meetingOpenChatRoleCanAssignSubAdmin,
  meetingOpenChatRoleCanManage,
} from "@/lib/meeting-open-chat/permissions";
import type {
  MeetingOpenChatMemberRole,
  MeetingOpenChatParticipantPublic,
  MeetingOpenChatReportReason,
} from "@/lib/meeting-open-chat/types";

function roleLabel(role: MeetingOpenChatMemberRole): string {
  if (role === "owner") return "방장";
  if (role === "sub_admin") return "부방장";
  return "일반";
}

function formatLastSeenKo(iso: string | null): string {
  if (!iso) return "최근 활동 없음";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "최근 활동 없음";
  const diff = Date.now() - t;
  if (diff < 60_000) return "방금 활동";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}시간 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

const REPORT_OPTIONS: { value: MeetingOpenChatReportReason; label: string }[] = [
  { value: "spam", label: "스팸/도배" },
  { value: "abuse", label: "욕설/혐오" },
  { value: "sexual", label: "선정성" },
  { value: "illegal", label: "불법" },
  { value: "harassment", label: "괴롭힘" },
  { value: "impersonation", label: "사칭" },
  { value: "advertisement", label: "무단 광고" },
  { value: "other", label: "기타" },
];

export function LineOpenChatMemberProfileSheet({
  meetingId,
  roomId,
  memberId,
  initial,
  viewerMemberId,
  viewerRole,
  open,
  onClose,
  onUpdated,
}: {
  meetingId: string;
  roomId: string;
  memberId: string | null;
  initial: MeetingOpenChatParticipantPublic | null;
  viewerMemberId: string | null;
  viewerRole: MeetingOpenChatMemberRole;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [profile, setProfile] = useState<MeetingOpenChatParticipantPublic | null>(initial);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState<MeetingOpenChatReportReason>("spam");
  const [reportDetail, setReportDetail] = useState("");

  const base = `/api/community/meetings/${encodeURIComponent(meetingId)}/meeting-open-chat/rooms/${encodeURIComponent(roomId)}`;

  const loadProfile = useCallback(async () => {
    if (!memberId) return;
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await fetch(`${base}/members/${encodeURIComponent(memberId)}`, { credentials: "include" });
      const json = (await res.json()) as {
        ok?: boolean;
        member?: MeetingOpenChatParticipantPublic;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.member) {
        setLoadErr(json.error ?? "프로필을 불러오지 못했습니다.");
        return;
      }
      setProfile(json.member);
    } catch {
      setLoadErr("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [base, memberId]);

  useEffect(() => {
    if (!open || !memberId) return;
    setProfile(initial);
    setShowReport(false);
    setReportDetail("");
    void loadProfile();
  }, [open, memberId, initial, loadProfile]);

  if (!open || !memberId) return null;

  const member = profile;
  if (!member && loading) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-modal="true">
        <button type="button" className="absolute inset-0 bg-black/45" aria-label="닫기" onClick={onClose} />
        <div className="relative rounded-t-2xl bg-white px-5 py-10 text-center text-sm text-gray-500 shadow-2xl">
          불러오는 중…
        </div>
      </div>
    );
  }
  if (!member) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-modal="true">
        <button type="button" className="absolute inset-0 bg-black/45" aria-label="닫기" onClick={onClose} />
        <div className="relative rounded-t-2xl bg-white px-5 py-8 text-center shadow-2xl">
          <p className="text-sm text-red-600">{loadErr ?? "참여자를 찾을 수 없습니다."}</p>
          <button
            type="button"
            className="mt-4 w-full rounded-full bg-gray-100 py-2.5 text-sm font-semibold"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    );
  }

  const isSelf = viewerMemberId !== null && member.memberId === viewerMemberId;
  const canManage = meetingOpenChatRoleCanManage(viewerRole) && !isSelf;
  /** 방장은 부방장·일반만 강퇴/차단. 부방장은 일반만. */
  const canKickBan =
    canManage && (viewerRole === "owner" || member.role === "member");
  const canAssignSubAdmin = meetingOpenChatRoleCanAssignSubAdmin(viewerRole) && !isSelf && member.role !== "owner";

  const finishModeration = () => {
    onUpdated();
    onClose();
  };

  const onKick = async () => {
    if (!window.confirm(`${member.openNickname}님을 강퇴할까요?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/members/${encodeURIComponent(member.memberId)}/kick`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        alert(json.error ?? "강퇴에 실패했습니다.");
        return;
      }
      finishModeration();
    } finally {
      setBusy(false);
    }
  };

  const onBan = async () => {
    const reason = window.prompt("차단 사유 (선택)", "") ?? "";
    if (!window.confirm(`${member.openNickname}님을 이 방에서 차단할까요? 재입장이 막힙니다.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/members/${encodeURIComponent(member.memberId)}/ban`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        alert(json.error ?? "차단에 실패했습니다.");
        return;
      }
      finishModeration();
    } finally {
      setBusy(false);
    }
  };

  const onSetRole = async (newRole: "sub_admin" | "member") => {
    const msg =
      newRole === "sub_admin"
        ? `${member.openNickname}님을 부방장으로 지정할까요?`
        : `${member.openNickname}님의 부방장을 해제할까요?`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/members/${encodeURIComponent(member.memberId)}/role`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        alert(json.error ?? "역할 변경에 실패했습니다.");
        return;
      }
      await loadProfile();
      onUpdated();
    } finally {
      setBusy(false);
    }
  };

  const onSubmitReport = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${base}/reports`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetMemberId: member.memberId,
          reportReason,
          reportDetail,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        alert(json.error ?? "신고 접수에 실패했습니다.");
        return;
      }
      alert("신고가 접수되었습니다.");
      setShowReport(false);
      setReportDetail("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="프로필">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="닫기" onClick={onClose} />
      <div className="relative max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white px-5 pb-8 pt-6 shadow-2xl">
        <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-2xl font-bold text-gray-500">
          {member.openProfileImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.openProfileImageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            member.openNickname.slice(0, 1).toUpperCase()
          )}
        </div>
        <h3 className="mt-3 text-center text-lg font-bold text-gray-900">{member.openNickname}</h3>
        <p className="mt-1 text-center text-xs text-gray-500">
          {roleLabel(member.role)} · 참여일 {new Date(member.joinedAt).toLocaleDateString("ko-KR")} ·{" "}
          {formatLastSeenKo(member.lastSeenAt)}
        </p>
        {member.introMessage ? (
          <p className="mt-4 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-800">{member.introMessage}</p>
        ) : (
          <p className="mt-4 text-center text-sm text-gray-400">소개 문구가 없습니다.</p>
        )}

        {loadErr && <p className="mt-2 text-center text-xs text-amber-700">{loadErr}</p>}

        <div className="mt-6 space-y-2">
          {!isSelf && (
            <>
              {!showReport ? (
                <button
                  type="button"
                  className="w-full rounded-full border border-gray-200 py-2.5 text-sm font-semibold text-gray-800"
                  onClick={() => setShowReport(true)}
                >
                  신고하기
                </button>
              ) : (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                  <p className="mb-2 text-xs font-semibold text-gray-700">신고 사유</p>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value as MeetingOpenChatReportReason)}
                    className="mb-2 w-full rounded-xl border border-gray-200 bg-white px-2 py-2 text-sm"
                  >
                    {REPORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={reportDetail}
                    onChange={(e) => setReportDetail(e.target.value)}
                    placeholder="상세 내용 (선택)"
                    className="mb-2 min-h-[72px] w-full rounded-xl border border-gray-200 bg-white px-2 py-2 text-sm"
                    maxLength={2000}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      className="flex-1 rounded-full bg-emerald-600 py-2 text-sm font-bold text-white disabled:opacity-50"
                      onClick={() => void onSubmitReport()}
                    >
                      제출
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded-full bg-white py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200"
                      onClick={() => setShowReport(false)}
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {canKickBan && (
            <>
              <button
                type="button"
                disabled={busy}
                className="w-full rounded-full border border-rose-200 bg-rose-50 py-2.5 text-sm font-semibold text-rose-900 disabled:opacity-50"
                onClick={() => void onKick()}
              >
                강퇴
              </button>
              <button
                type="button"
                disabled={busy}
                className="w-full rounded-full border border-gray-800 bg-gray-900 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => void onBan()}
              >
                차단
              </button>
            </>
          )}

          {canAssignSubAdmin && member.role === "member" && (
            <button
              type="button"
              disabled={busy}
              className="w-full rounded-full border border-violet-200 bg-violet-50 py-2.5 text-sm font-semibold text-violet-900 disabled:opacity-50"
              onClick={() => void onSetRole("sub_admin")}
            >
              부방장 지정
            </button>
          )}
          {canAssignSubAdmin && member.role === "sub_admin" && (
            <button
              type="button"
              disabled={busy}
              className="w-full rounded-full border border-gray-200 py-2.5 text-sm font-semibold text-gray-800 disabled:opacity-50"
              onClick={() => void onSetRole("member")}
            >
              부방장 해제
            </button>
          )}

          <button
            type="button"
            className="w-full rounded-full bg-gray-100 py-2.5 text-sm font-semibold text-gray-800"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
