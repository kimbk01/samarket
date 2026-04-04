"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  meetingOpenChatRoleCanEditRoomSettings,
  meetingOpenChatRoleCanManage,
} from "@/lib/meeting-open-chat/permissions";
import type {
  MeetingOpenChatBanListItem,
  MeetingOpenChatIdentityMode,
  MeetingOpenChatJoinRequestListItem,
  MeetingOpenChatJoinType,
  MeetingOpenChatMemberRole,
  MeetingOpenChatNoticePublic,
  MeetingOpenChatReportListItem,
  MeetingOpenChatRoomPublic,
} from "@/lib/meeting-open-chat/types";

type View = "main" | "join" | "reports" | "bans" | "notices" | "settings";
type FlashMessage = { tone: "success" | "error"; text: string } | null;

export function LineOpenChatPinnedNotices({ notices }: { notices: MeetingOpenChatNoticePublic[] }) {
  const pinned = notices.filter((n) => n.isPinned);
  if (pinned.length === 0) return null;
  return (
    <div className="border-b border-amber-100 bg-amber-50/95 px-3 py-2">
      {pinned.map((n) => (
        <div key={n.id} className="mb-2 last:mb-0">
          <div className="text-[12px] font-bold text-amber-900">📌 {n.title.trim() || "공지"}</div>
          <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-snug text-gray-800 line-clamp-3">
            {n.content}
          </p>
        </div>
      ))}
    </div>
  );
}

export function LineOpenChatOperatorMenuSheet({
  open,
  onClose,
  meetingId,
  roomId,
  apiRoomBase,
  room,
  viewerRole,
  onRefreshAll,
}: {
  open: boolean;
  onClose: () => void;
  meetingId: string;
  roomId: string;
  /** 예: `/api/.../rooms/{roomId}` — 생략 시 meeting-open-chat API */
  apiRoomBase?: string;
  room: MeetingOpenChatRoomPublic;
  viewerRole: MeetingOpenChatMemberRole;
  onRefreshAll: () => void;
}) {
  const [view, setView] = useState<View>("main");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<FlashMessage>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);

  const [joinReqs, setJoinReqs] = useState<MeetingOpenChatJoinRequestListItem[]>([]);
  const [reports, setReports] = useState<MeetingOpenChatReportListItem[]>([]);
  const [bans, setBans] = useState<MeetingOpenChatBanListItem[]>([]);
  const [notices, setNotices] = useState<MeetingOpenChatNoticePublic[]>([]);

  const [editTitle, setEditTitle] = useState(room.title);
  const [editDesc, setEditDesc] = useState(room.description);
  const [editJoinType, setEditJoinType] = useState<MeetingOpenChatJoinType>(room.join_type);
  const [editIdentityMode, setEditIdentityMode] = useState<MeetingOpenChatIdentityMode>(room.identity_mode);
  const [editPassword, setEditPassword] = useState("");
  const [editMax, setEditMax] = useState(String(room.max_members));
  const [editSearchable, setEditSearchable] = useState(room.is_searchable);
  const [editRejoin, setEditRejoin] = useState(room.allow_rejoin_after_kick);
  const [editActive, setEditActive] = useState(room.is_active);

  const [newNoticeTitle, setNewNoticeTitle] = useState("");
  const [newNoticeBody, setNewNoticeBody] = useState("");
  const [newNoticePin, setNewNoticePin] = useState(true);

  const [noticeEditingId, setNoticeEditingId] = useState<string | null>(null);
  const [noticeEditTitle, setNoticeEditTitle] = useState("");
  const [noticeEditContent, setNoticeEditContent] = useState("");
  const [noticeEditPin, setNoticeEditPin] = useState(false);

  const base =
    (apiRoomBase?.replace(/\/$/, "") ??
      `/api/community/meetings/${encodeURIComponent(meetingId)}/meeting-open-chat/rooms/${encodeURIComponent(roomId)}`) as string;

  useEffect(() => {
    if (!open) return;
    setView("main");
    setFlash(null);
    setEditTitle(room.title);
    setEditDesc(room.description);
    setEditJoinType(room.join_type);
    setEditIdentityMode(room.identity_mode);
    setEditPassword("");
    setEditMax(String(room.max_members));
    setEditSearchable(room.is_searchable);
    setEditRejoin(room.allow_rejoin_after_kick);
    setEditActive(room.is_active);
  }, [open, room]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const applyViewportInset = () => {
      if (typeof window === "undefined") return;
      const vv = window.visualViewport;
      if (!vv) {
        setKeyboardInset(0);
        return;
      }
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardInset(inset > 80 ? Math.round(inset) : 0);
    };
    applyViewportInset();
    window.addEventListener("resize", applyViewportInset);
    window.visualViewport?.addEventListener("resize", applyViewportInset);
    window.visualViewport?.addEventListener("scroll", applyViewportInset);
    return () => {
      window.removeEventListener("resize", applyViewportInset);
      window.visualViewport?.removeEventListener("resize", applyViewportInset);
      window.visualViewport?.removeEventListener("scroll", applyViewportInset);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const root = contentRef.current;
    if (!root) return;
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !root.contains(target)) return;
      window.setTimeout(() => {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 120);
    };
    root.addEventListener("focusin", onFocusIn);
    return () => root.removeEventListener("focusin", onFocusIn);
  }, [open]);

  const settingsPreviewJoin =
    editJoinType === "password" ? "목록에서 방을 누르면 비밀번호 팝업이 먼저 열립니다." : "목록에서 방을 누르면 바로 입장 흐름이 시작됩니다.";
  const settingsPreviewIdentity =
    editIdentityMode === "realname"
      ? "참여자는 모두 프로필 실명으로 표시됩니다."
      : "참여자는 입장 팝업에서 실명 또는 닉네임을 고를 수 있습니다.";

  const loadJoin = useCallback(async () => {
    const res = await fetch(`${base}/join-requests`, { credentials: "include" });
    const json = (await res.json()) as { ok?: boolean; requests?: MeetingOpenChatJoinRequestListItem[] };
    if (res.ok && json.ok && json.requests) setJoinReqs(json.requests);
    else setJoinReqs([]);
  }, [base]);

  const loadReports = useCallback(async () => {
    const res = await fetch(`${base}/reports`, { credentials: "include" });
    const json = (await res.json()) as { ok?: boolean; reports?: MeetingOpenChatReportListItem[] };
    if (res.ok && json.ok && json.reports) setReports(json.reports);
    else setReports([]);
  }, [base]);

  const loadBans = useCallback(async () => {
    const res = await fetch(`${base}/bans`, { credentials: "include" });
    const json = (await res.json()) as { ok?: boolean; bans?: MeetingOpenChatBanListItem[] };
    if (res.ok && json.ok && json.bans) setBans(json.bans);
    else setBans([]);
  }, [base]);

  const loadNotices = useCallback(async () => {
    const res = await fetch(`${base}/notices`, { credentials: "include" });
    const json = (await res.json()) as { ok?: boolean; notices?: MeetingOpenChatNoticePublic[] };
    if (res.ok && json.ok && json.notices) setNotices(json.notices);
    else setNotices([]);
  }, [base]);

  useEffect(() => {
    if (!open) return;
    if (view === "join") void loadJoin();
    if (view === "reports") void loadReports();
    if (view === "bans") void loadBans();
    if (view === "notices") void loadNotices();
  }, [open, view, loadJoin, loadReports, loadBans, loadNotices]);

  const resolveJoin = async (requestId: string, decision: "approve" | "reject") => {
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(`${base}/join-requests/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        alert(json.error ?? "처리 실패");
        return;
      }
      await loadJoin();
      onRefreshAll();
      setFlash({ tone: "success", text: decision === "approve" ? "입장 요청을 승인했습니다." : "입장 요청을 거절했습니다." });
    } finally {
      setBusy(false);
    }
  };

  const resolveReport = async (
    reportId: string,
    status: "reviewed" | "rejected",
    blindAssociatedMessage = false
  ) => {
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(`${base}/reports/${encodeURIComponent(reportId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, blindAssociatedMessage }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        alert(json.error ?? "처리 실패");
        return;
      }
      await loadReports();
      onRefreshAll();
      setFlash({ tone: "success", text: "신고를 처리했습니다." });
    } finally {
      setBusy(false);
    }
  };

  const releaseBan = async (banId: string) => {
    if (!window.confirm("차단을 해제할까요? 해당 회원은 다시 입장 신청이 가능합니다.")) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(`${base}/bans/${encodeURIComponent(banId)}/release`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        alert(json.error ?? "해제 실패");
        return;
      }
      await loadBans();
      onRefreshAll();
      setFlash({ tone: "success", text: "차단을 해제했습니다." });
    } finally {
      setBusy(false);
    }
  };

  const saveNoticeEdit = async () => {
    if (!noticeEditingId) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(`${base}/notices/${encodeURIComponent(noticeEditingId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: noticeEditTitle,
          content: noticeEditContent,
          isPinned: noticeEditPin,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        alert(json.error ?? "저장 실패");
        return;
      }
      setNoticeEditingId(null);
      await loadNotices();
      onRefreshAll();
      setFlash({ tone: "success", text: "공지 수정이 저장되었습니다." });
    } finally {
      setBusy(false);
    }
  };

  const deleteNotice = async (noticeId: string) => {
    if (!window.confirm("이 공지를 삭제할까요?")) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(`${base}/notices/${encodeURIComponent(noticeId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        alert(json.error ?? "삭제 실패");
        return;
      }
      if (noticeEditingId === noticeId) setNoticeEditingId(null);
      await loadNotices();
      onRefreshAll();
      setFlash({ tone: "success", text: "공지를 삭제했습니다." });
    } finally {
      setBusy(false);
    }
  };

  const submitNotice = async () => {
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(`${base}/notices`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newNoticeTitle,
          content: newNoticeBody,
          isPinned: newNoticePin,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        alert(json.error ?? "등록 실패");
        return;
      }
      setNewNoticeTitle("");
      setNewNoticeBody("");
      await loadNotices();
      onRefreshAll();
      setFlash({ tone: "success", text: "공지를 등록했습니다." });
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async () => {
    setBusy(true);
    setFlash(null);
    try {
      const max = Number(editMax);
      const res = await fetch(base, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          description: editDesc,
          joinType: editJoinType,
          joinPassword: editJoinType === "password" ? (editPassword.trim() ? editPassword : undefined) : null,
          identityMode: editIdentityMode,
          maxMembers: Number.isFinite(max) ? max : room.max_members,
          isSearchable: editSearchable,
          allowRejoinAfterKick: editRejoin,
          isActive: editActive,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        alert(json.error ?? "저장 실패");
        return;
      }
      onRefreshAll();
      setFlash({ tone: "success", text: "방 설정이 저장되었습니다." });
      if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        onClose();
      }, 850);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const canManage = meetingOpenChatRoleCanManage(viewerRole);
  const canEdit = meetingOpenChatRoleCanEditRoomSettings(viewerRole);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="운영 메뉴">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="닫기" onClick={onClose} />
      <div
        className="relative overflow-hidden rounded-t-2xl bg-white shadow-2xl"
        style={{
          maxHeight: `min(85vh, calc(100dvh - ${Math.max(16, keyboardInset + 8)}px))`,
          marginBottom: `max(${keyboardInset}px, env(safe-area-inset-bottom, 0px))`,
        }}
      >
        <div className="flex items-center border-b border-gray-100 px-3 py-2">
          {view !== "main" && (
            <button
              type="button"
              className="mr-2 rounded-full px-2 py-1 text-sm text-emerald-700"
              onClick={() => setView("main")}
            >
              ←
            </button>
          )}
          <h2 className="flex-1 text-center text-[15px] font-bold text-gray-900">
            {view === "main" && "운영 메뉴"}
            {view === "join" && "입장 승인"}
            {view === "reports" && "신고 목록"}
            {view === "bans" && "차단 목록"}
            {view === "notices" && "공지 관리"}
            {view === "settings" && "방 설정"}
          </h2>
          <button type="button" className="rounded-full px-3 py-1 text-sm font-semibold text-emerald-700" onClick={onClose}>
            닫기
          </button>
        </div>

        <div
          ref={contentRef}
          className="max-h-[calc(85vh-48px)] overflow-y-auto px-3 pt-2"
          style={{ paddingBottom: "max(1.5rem, calc(1rem + env(safe-area-inset-bottom, 0px)))" }}
        >
          {flash ? (
            <div
              className={`mb-3 rounded-xl px-3 py-2 text-[12px] font-semibold ${
                flash.tone === "success"
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border border-rose-200 bg-rose-50 text-rose-800"
              }`}
            >
              {flash.text}
            </div>
          ) : null}
          {view === "main" && (
            <ul className="space-y-1">
              {canManage && (
                <li>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-left text-sm font-semibold"
                    onClick={() => setView("join")}
                  >
                    입장 승인 대기
                    {room.pending_join_count > 0 && (
                      <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs text-white">
                        {room.pending_join_count}
                      </span>
                    )}
                  </button>
                </li>
              )}
              {canManage && (
                <li>
                  <button
                    type="button"
                    className="mt-1 w-full rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-left text-sm font-semibold"
                    onClick={() => setView("reports")}
                  >
                    신고 목록
                  </button>
                </li>
              )}
              {canManage && (
                <li>
                  <button
                    type="button"
                    className="mt-1 w-full rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-left text-sm font-semibold"
                    onClick={() => setView("bans")}
                  >
                    차단 목록
                  </button>
                </li>
              )}
              {canManage && (
                <li>
                  <button
                    type="button"
                    className="mt-1 w-full rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-left text-sm font-semibold"
                    onClick={() => setView("notices")}
                  >
                    공지 관리
                  </button>
                </li>
              )}
              {canEdit && (
                <li>
                  <button
                    type="button"
                    className="mt-1 w-full rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-left text-sm font-semibold text-amber-950"
                    onClick={() => setView("settings")}
                  >
                    방 설정 (방장)
                  </button>
                </li>
              )}
            </ul>
          )}

          {view === "join" && (
            <div className="space-y-3">
              {joinReqs.length === 0 && <p className="py-6 text-center text-sm text-gray-500">대기 중인 신청이 없습니다.</p>}
              {joinReqs.map((r) => (
                <div key={r.id} className="rounded-xl border border-gray-100 p-3">
                  <div className="font-semibold text-gray-900">{r.openNickname}</div>
                  <div className="mt-1 text-xs text-gray-500">{new Date(r.createdAt).toLocaleString("ko-KR")}</div>
                  {r.introMessage && <p className="mt-2 text-sm text-gray-700">{r.introMessage}</p>}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      className="flex-1 rounded-full bg-emerald-600 py-2 text-xs font-bold text-white disabled:opacity-50"
                      onClick={() => void resolveJoin(r.id, "approve")}
                    >
                      승인
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="flex-1 rounded-full bg-gray-200 py-2 text-xs font-bold text-gray-800 disabled:opacity-50"
                      onClick={() => void resolveJoin(r.id, "reject")}
                    >
                      거절
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {view === "reports" && (
            <div className="space-y-3">
              {reports.length === 0 && <p className="py-6 text-center text-sm text-gray-500">처리 대기 신고가 없습니다.</p>}
              {reports.map((r: MeetingOpenChatReportListItem) => (
                <div key={r.id} className="rounded-xl border border-gray-100 p-3">
                  <div className="text-xs text-gray-500">
                    대상: {r.targetOpenNickname ?? "(알 수 없음)"} · {r.reportReason}
                    {r.messageId ? " · 메시지 연동" : ""}
                  </div>
                  {r.reportDetail && <p className="mt-2 text-sm text-gray-800">{r.reportDetail}</p>}
                  <div className="mt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      className="w-full rounded-full bg-gray-800 py-2 text-xs font-bold text-white disabled:opacity-50"
                      onClick={() => void resolveReport(r.id, "reviewed", false)}
                    >
                      검토완료
                    </button>
                    {r.messageId && (
                      <button
                        type="button"
                        disabled={busy}
                        className="w-full rounded-full bg-rose-700 py-2 text-xs font-bold text-white disabled:opacity-50"
                        onClick={() => void resolveReport(r.id, "reviewed", true)}
                      >
                        메시지 블라인드 후 검토완료
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      className="w-full rounded-full bg-gray-100 py-2 text-xs font-bold text-gray-700 disabled:opacity-50"
                      onClick={() => void resolveReport(r.id, "rejected")}
                    >
                      반려
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {view === "bans" && (
            <div className="space-y-3">
              {bans.length === 0 && <p className="py-6 text-center text-sm text-gray-500">활성 차단이 없습니다.</p>}
              {bans.map((b) => (
                <div key={b.id} className="flex items-start justify-between gap-2 rounded-xl border border-gray-100 p-3">
                  <div>
                    <div className="font-semibold text-gray-900">{b.targetOpenNickname ?? "알 수 없음"}</div>
                    <div className="mt-1 text-xs text-gray-500">{new Date(b.bannedAt).toLocaleString("ko-KR")}</div>
                    {b.reason && <p className="mt-1 text-sm text-gray-600">{b.reason}</p>}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    className="shrink-0 rounded-full border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-800 disabled:opacity-50"
                    onClick={() => void releaseBan(b.id)}
                  >
                    해제
                  </button>
                </div>
              ))}
            </div>
          )}

          {view === "notices" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                <p className="mb-2 text-xs font-bold text-emerald-900">새 공지</p>
                <input
                  value={newNoticeTitle}
                  onChange={(e) => setNewNoticeTitle(e.target.value)}
                  placeholder="제목 (선택)"
                  className="mb-2 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                />
                <textarea
                  value={newNoticeBody}
                  onChange={(e) => setNewNoticeBody(e.target.value)}
                  placeholder="내용"
                  className="mb-2 min-h-[72px] w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                />
                <label className="mb-2 flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={newNoticePin} onChange={(e) => setNewNoticePin(e.target.checked)} />
                  상단 고정
                </label>
                <button
                  type="button"
                  disabled={busy}
                  className="w-full rounded-full bg-emerald-600 py-2 text-sm font-bold text-white disabled:opacity-50"
                  onClick={() => void submitNotice()}
                >
                  등록
                </button>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold text-gray-700">등록된 공지</p>
                {notices.length === 0 && <p className="text-sm text-gray-500">없음</p>}
                <ul className="space-y-2">
                  {notices.map((n) => (
                    <li key={n.id} className="rounded-lg border border-gray-100 p-2 text-sm">
                      {noticeEditingId === n.id ? (
                        <div className="space-y-2">
                          <input
                            value={noticeEditTitle}
                            onChange={(e) => setNoticeEditTitle(e.target.value)}
                            className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
                            placeholder="제목"
                          />
                          <textarea
                            value={noticeEditContent}
                            onChange={(e) => setNoticeEditContent(e.target.value)}
                            className="min-h-[64px] w-full rounded border border-gray-200 px-2 py-1 text-xs"
                          />
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={noticeEditPin}
                              onChange={(e) => setNoticeEditPin(e.target.checked)}
                            />
                            고정
                          </label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              className="flex-1 rounded-full bg-emerald-600 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                              onClick={() => void saveNoticeEdit()}
                            >
                              저장
                            </button>
                            <button
                              type="button"
                              className="flex-1 rounded-full bg-gray-100 py-1.5 text-xs font-bold text-gray-700"
                              onClick={() => setNoticeEditingId(null)}
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span className="font-semibold">
                            {n.isPinned ? "📌 " : ""}
                            {n.title || "공지"}
                          </span>
                          <p className="mt-1 whitespace-pre-wrap text-xs text-gray-700">{n.content}</p>
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold"
                              onClick={() => {
                                setNoticeEditingId(n.id);
                                setNoticeEditTitle(n.title);
                                setNoticeEditContent(n.content);
                                setNoticeEditPin(n.isPinned);
                              }}
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-800"
                              onClick={() => void deleteNotice(n.id)}
                            >
                              삭제
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {view === "settings" && canEdit && (
            <div className="space-y-3">
              <label className="block text-xs font-bold text-gray-700">방 제목</label>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
              <label className="block text-xs font-bold text-gray-700">설명</label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="min-h-[64px] w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-900">
                <p className="font-bold">현재 방 정책</p>
                <p className="mt-1">
                  입장 방식:
                  {" "}
                  {editJoinType === "password" ? "비밀번호 참여" : editJoinType === "approval" ? "승인 참여" : "즉시 참여"}
                </p>
                <p className="mt-1">
                  표시 이름:
                  {" "}
                  {editIdentityMode === "realname" ? "실명 고정" : "실명 또는 닉네임 선택"}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-[12px] leading-relaxed text-emerald-900">
                <p className="font-bold">적용 결과 미리보기</p>
                <p className="mt-1">{settingsPreviewJoin}</p>
                <p className="mt-1">{settingsPreviewIdentity}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <label className="block text-xs font-bold text-gray-700">입장 방식</label>
                <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                  비밀번호 방으로 바꾸면 목록에서 방을 누를 때 같은 페이지 팝업으로 비밀번호를 받습니다.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                      editJoinType === "free"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 bg-white text-gray-700"
                    }`}
                    onClick={() => setEditJoinType("free")}
                  >
                    즉시 참여
                  </button>
                  <button
                    type="button"
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                      editJoinType === "password"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 bg-white text-gray-700"
                    }`}
                    onClick={() => setEditJoinType("password")}
                  >
                    비밀번호 참여
                  </button>
                </div>
                {editJoinType === "password" && (
                  <div className="mt-3">
                    <label className="block text-xs font-bold text-gray-700">비밀번호</label>
                    <input
                      type="password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder={room.has_password ? "새 비밀번호 입력 시 변경" : "4자 이상"}
                      className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    />
                    <p className="mt-1 text-[11px] text-gray-500">
                      비워 두면 현재 비밀번호를 유지합니다.
                    </p>
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <label className="block text-xs font-bold text-gray-700">표시 이름 정책</label>
                <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                  실명 참여는 모두 프로필 실명으로 입장하고, 닉네임/실명 선택은 참가자가 입장 팝업에서 직접 고릅니다.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                      editIdentityMode === "realname"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 bg-white text-gray-700"
                    }`}
                    onClick={() => setEditIdentityMode("realname")}
                  >
                    실명 참여
                  </button>
                  <button
                    type="button"
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                      editIdentityMode === "nickname_optional"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 bg-white text-gray-700"
                    }`}
                    onClick={() => setEditIdentityMode("nickname_optional")}
                  >
                    닉네임/실명 선택
                  </button>
                </div>
              </div>
              <label className="block text-xs font-bold text-gray-700">최대 인원</label>
              <input
                value={editMax}
                onChange={(e) => setEditMax(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editSearchable} onChange={(e) => setEditSearchable(e.target.checked)} />
                검색 허용
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editRejoin} onChange={(e) => setEditRejoin(e.target.checked)} />
                강퇴 후 재입장 허용
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
                방 운영 중
              </label>
              <button
                type="button"
                disabled={busy}
                className="w-full rounded-full bg-amber-600 py-3 text-sm font-bold text-white disabled:opacity-50"
                onClick={() => void saveSettings()}
              >
                저장
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
