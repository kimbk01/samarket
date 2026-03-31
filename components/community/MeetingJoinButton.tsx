"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { philifeMeetingApi } from "@domain/philife/api";
import { philifeAppPaths } from "@domain/philife/paths";
import {
  getCurrentUser,
  getHydrationSafeCurrentUser,
} from "@/lib/auth/get-current-user";
import { formatMeetingJoinRequestMessage } from "@/lib/neighborhood/meeting-join-request-message";
import { MeetingJoinRequestModal } from "./MeetingJoinRequestModal";
import { MeetingOpenChatRoomCredentialsModal } from "./MeetingOpenChatRoomCredentialsModal";
import { MeetingPasswordOnlyModal } from "./MeetingPasswordOnlyModal";

type ViewerMeetingStatus = "joined" | "pending" | "left" | "kicked" | "banned" | "rejected" | null;

export function MeetingJoinButton({
  meetingId,
  chatRoomId = null,
  successSurface = "meeting",
  entryPolicy = "open",
  isClosed = false,
  memberCount,
  maxMembers,
  pendingCount = 0,
  viewerStatus = null,
  requiresApproval = false,
  embedChrome = false,
  /** 서버가 보장한 기본 오픈채팅 방 — 비번·승인 방이면 팝업으로 모임 가입+방 입장 */
  defaultOpenChatRoomId = null,
  openChatRoomHasPassword = false,
  openChatRoomNeedsApprovalIntro = false,
  /** `meetings.password_hash` 등 DTO와 가입 API가 어긋날 때 대비 */
  hasMeetingPassword = false,
}: {
  meetingId: string;
  chatRoomId?: string | null;
  successSurface?: "meeting" | "chat";
  entryPolicy?: "open" | "approve" | "password" | "invite_only";
  isClosed?: boolean;
  memberCount?: number;
  maxMembers?: number;
  pendingCount?: number;
  viewerStatus?: ViewerMeetingStatus;
  requiresApproval?: boolean;
  embedChrome?: boolean;
  defaultOpenChatRoomId?: string | null;
  openChatRoomHasPassword?: boolean;
  openChatRoomNeedsApprovalIntro?: boolean;
  hasMeetingPassword?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const mApi = philifeMeetingApi(meetingId);
  const [mounted, setMounted] = useState(false);
  const me = mounted ? getCurrentUser() : getHydrationSafeCurrentUser();
  const [busyMode, setBusyMode] = useState<"join" | "enter" | "leave" | null>(null);
  const [err, setErr] = useState("");
  const [localStatus, setLocalStatus] = useState<ViewerMeetingStatus>(viewerStatus);
  const [passwordOnlyModalOpen, setPasswordOnlyModalOpen] = useState(false);
  const passwordModalAutoOpenedRef = useRef(false);
  const [unifiedCredOpen, setUnifiedCredOpen] = useState(false);
  const unifiedCredAutoOpenedRef = useRef(false);
  const [roomPwdOnlyModalOpen, setRoomPwdOnlyModalOpen] = useState(false);
  const roomPwdOnlyAutoOpenedRef = useRef(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalSubmitErr, setModalSubmitErr] = useState("");
  const [okMsg, setOkMsg] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setLocalStatus(viewerStatus);
  }, [viewerStatus]);

  useEffect(() => {
    passwordModalAutoOpenedRef.current = false;
    unifiedCredAutoOpenedRef.current = false;
    roomPwdOnlyAutoOpenedRef.current = false;
    setPasswordOnlyModalOpen(false);
    setUnifiedCredOpen(false);
    setRoomPwdOnlyModalOpen(false);
    setErr("");
  }, [meetingId]);

  useEffect(() => {
    if (joinModalOpen) setModalSubmitErr("");
  }, [joinModalOpen]);

  const meetingOpenChatHubPath = philifeAppPaths.meetingOpenChat(meetingId);

  useEffect(() => {
    if (!meetingId || isClosed) return;
    if (localStatus === "joined" || localStatus === "pending") return;
    router.prefetch(meetingOpenChatHubPath);
  }, [meetingId, isClosed, localStatus, meetingOpenChatHubPath, router]);

  const isFull = typeof memberCount === "number" && typeof maxMembers === "number" && memberCount >= maxMembers;
  const effectiveStatus = localStatus;
  const isJoined = effectiveStatus === "joined";
  const canJoin = !isClosed && !isFull && !isJoined && effectiveStatus !== "pending";

  /** 서버/프롭 누락 시 open 으로 취급 — 오픈채팅 비번 팝업 분기가 꺼지지 않게 */
  const entryNorm: "open" | "approve" | "password" | "invite_only" =
    entryPolicy === "approve" || entryPolicy === "invite_only" || entryPolicy === "password"
      ? entryPolicy
      : "open";

  const meetingPasswordRequired =
    entryNorm === "password" || Boolean(hasMeetingPassword);

  /** 승인·초대/승인제(invite 포함): 신청 모달 — 모임 비번 전용·바로 참여만 제외 */
  const useModalForJoinRequest =
    !isJoined &&
    effectiveStatus !== "pending" &&
    !(meetingPasswordRequired && !requiresApproval) &&
    (entryNorm === "approve" ||
      entryNorm === "invite_only" ||
      requiresApproval === true);

  /** 모임 비밀번호만 (또는 해시만 있고 정책이 open 으로 조회되는 경우) — 승인·초대 전용은 제외 */
  const passwordOnlyOpenJoin =
    !isJoined &&
    effectiveStatus !== "pending" &&
    !requiresApproval &&
    entryNorm !== "approve" &&
    entryNorm !== "invite_only" &&
    meetingPasswordRequired;

  const defaultRoomId = String(defaultOpenChatRoomId ?? "").trim();
  const needsOpenChatCredentialsFirst =
    Boolean(defaultRoomId) &&
    (openChatRoomHasPassword || openChatRoomNeedsApprovalIntro) &&
    entryNorm === "open" &&
    !requiresApproval &&
    !passwordOnlyOpenJoin &&
    !useModalForJoinRequest &&
    !isJoined &&
    effectiveStatus !== "pending";

  /** 방이 비밀번호만 있고 승인 메시지 없음 → 비번 팝업만 */
  const needsRoomPasswordOnlyModal =
    needsOpenChatCredentialsFirst &&
    openChatRoomHasPassword &&
    !openChatRoomNeedsApprovalIntro;

  const needsUnifiedCredModal = needsOpenChatCredentialsFirst && !needsRoomPasswordOnlyModal;

  const joinLabel = isJoined
    ? successSurface === "chat"
      ? "채팅방 들어가기"
      : "오픈채팅 입장"
    : entryNorm === "approve" || entryNorm === "invite_only"
      ? effectiveStatus === "pending"
        ? "가입 승인 대기 중"
        : "참여 요청"
      : meetingPasswordRequired
        ? "비밀번호로 참여"
        : requiresApproval === true
          ? "참여 요청"
          : "오픈채팅 참여";

  const helperText =
    isClosed
      ? "마감되었거나 종료된 오픈채팅입니다."
      : effectiveStatus === "pending"
        ? `운영자 승인 후 참여할 수 있어요${pendingCount > 0 ? ` · 현재 대기 ${pendingCount}명` : ""}.`
        : entryNorm === "approve" ||
            entryNorm === "invite_only" ||
            requiresApproval === true
          ? "작성하신 내용은 방장(운영자)에게 전달됩니다. 승인 후 채팅을 이용할 수 있어요."
          : meetingPasswordRequired
            ? "비밀번호를 입력하면 바로 참여할 수 있어요."
            : "";

  useEffect(() => {
    if (!mounted || !passwordOnlyOpenJoin || !canJoin || isJoined || passwordModalAutoOpenedRef.current) return;
    passwordModalAutoOpenedRef.current = true;
    setPasswordOnlyModalOpen(true);
  }, [mounted, passwordOnlyOpenJoin, canJoin, isJoined]);

  useEffect(() => {
    if (!mounted || !needsRoomPasswordOnlyModal || !canJoin || roomPwdOnlyAutoOpenedRef.current) return;
    roomPwdOnlyAutoOpenedRef.current = true;
    setErr("");
    setRoomPwdOnlyModalOpen(true);
  }, [mounted, needsRoomPasswordOnlyModal, canJoin]);

  useEffect(() => {
    if (!mounted || !needsUnifiedCredModal || !canJoin || unifiedCredAutoOpenedRef.current) return;
    unifiedCredAutoOpenedRef.current = true;
    setErr("");
    setUnifiedCredOpen(true);
  }, [mounted, needsUnifiedCredModal, canJoin]);

  const goToMeetingChat = (meetingOpenChatRoomId?: string | null): boolean => {
    const openRid = String(meetingOpenChatRoomId ?? "").trim();
    const target = openRid
      ? `/philife/meetings/${encodeURIComponent(meetingId)}/meeting-open-chat/${encodeURIComponent(openRid)}`
      : meetingOpenChatHubPath;
    if (pathname === target) {
      router.refresh();
      return false;
    }
    startTransition(() => {
      router.prefetch(target);
      router.push(target);
    });
    return true;
  };

  const parseJoinJson = (raw: string, res: Response): { ok: false; msg: string } | { ok: true; j: Record<string, unknown> } => {
    if (!raw.trim()) {
      if (res.status === 401) {
        router.push("/login");
        return { ok: false, msg: "로그인이 필요합니다." };
      }
      return { ok: false, msg: "서버 응답이 비어 있습니다." };
    }
    try {
      return { ok: true, j: JSON.parse(raw) as Record<string, unknown> };
    } catch {
      return {
        ok: false,
        msg:
          res.status === 401
            ? "로그인이 필요합니다."
            : "서버 응답을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      };
    }
  };

  const runOpenChatUnifiedEnter = async (p: {
    openNickname: string;
    roomPassword: string;
    introMessage: string;
  }) => {
    const rid = defaultRoomId;
    if (!rid) return;
    const nick = String(p.openNickname ?? "").trim();
    if (!nick) {
      setErr("닉네임을 확인할 수 없습니다. 프로필 닉네임을 설정한 뒤 다시 시도해 주세요.");
      return;
    }
    setBusyMode("join");
    setErr("");
    try {
      let res: Response;
      try {
        res = await fetch(mApi.join(), { method: "POST", credentials: "include" });
      } catch {
        setErr("네트워크 오류로 요청하지 못했습니다.");
        return;
      }
      const raw = await res.text();
      const parsed = parseJoinJson(raw, res);
      if (!parsed.ok) {
        setErr(parsed.msg);
        if (parsed.msg.includes("로그인")) router.push("/login");
        return;
      }
      const j = parsed.j as {
        ok?: boolean;
        error?: string;
        pending?: boolean;
        alreadyPending?: boolean;
        already?: boolean;
      };
      if (res.status === 401) {
        setErr("로그인이 필요합니다.");
        router.push("/login");
        return;
      }
      if (j.error === "already_pending") {
        setLocalStatus("pending");
        setUnifiedCredOpen(false);
        setRoomPwdOnlyModalOpen(false);
        setOkMsg("이미 신청이 접수된 상태입니다. 운영자 승인을 기다려 주세요.");
        window.setTimeout(() => setOkMsg(""), 8000);
        router.refresh();
        return;
      }
      if (!res.ok || !j.ok) {
        const msg =
          j.error === "full"
            ? "인원이 가득 찼습니다."
            : j.error === "closed"
              ? "모집이 마감되었어요."
              : j.error === "meeting_banned"
                ? "이 오픈채팅에는 다시 참여할 수 없습니다."
                : j.error === "invalid_password"
                  ? "비밀번호가 올바르지 않습니다."
                  : j.error ?? "참여할 수 없습니다.";
        setErr(msg);
        return;
      }
      if (j.pending || j.alreadyPending) {
        setLocalStatus("pending");
        setUnifiedCredOpen(false);
        setRoomPwdOnlyModalOpen(false);
        setOkMsg("신청이 접수되어 운영자에게 전달되었습니다. 승인되면 오픈채팅방에 입장할 수 있어요.");
        window.setTimeout(() => setOkMsg(""), 12000);
        router.refresh();
        return;
      }

      let ocRes: Response;
      try {
        ocRes = await fetch(
          `/api/community/meetings/${encodeURIComponent(meetingId)}/meeting-open-chat/rooms/${encodeURIComponent(rid)}/join`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              openNickname: nick,
              joinPassword: openChatRoomHasPassword ? p.roomPassword : undefined,
              introMessage: openChatRoomNeedsApprovalIntro ? p.introMessage || null : null,
            }),
          }
        );
      } catch {
        setErr("채팅방 입장 요청에 실패했습니다.");
        return;
      }
      const ocRaw = await ocRes.text();
      let ocj: {
        ok?: boolean;
        error?: string;
        joined?: boolean;
        pendingApproval?: boolean;
      } = {};
      if (ocRaw.trim()) {
        try {
          ocj = JSON.parse(ocRaw) as typeof ocj;
        } catch {
          setErr("채팅방 응답을 처리하지 못했습니다.");
          return;
        }
      }
      if (!ocRes.ok || !ocj.ok) {
        setErr(
          ocj.error === "invalid_password" || ocj.error === "open_nickname_required"
            ? ocj.error === "invalid_password"
              ? "방 비밀번호가 올바르지 않습니다."
              : "닉네임을 입력해 주세요."
            : ocj.error ?? "채팅방 입장에 실패했습니다."
        );
        return;
      }
      if (ocj.pendingApproval) {
        setUnifiedCredOpen(false);
        setRoomPwdOnlyModalOpen(false);
        alert("입장 신청이 접수되었습니다. 운영자 승인을 기다려 주세요.");
        router.refresh();
        return;
      }
      setUnifiedCredOpen(false);
      setRoomPwdOnlyModalOpen(false);
      setPasswordOnlyModalOpen(false);
      setLocalStatus("joined");
      goToMeetingChat(rid);
      router.refresh();
    } finally {
      setBusyMode(null);
    }
  };

  const runJoin = async (
    opts?: { message?: string; password?: string },
    source: "modal" | "inline" = "inline"
  ) => {
    if (!me?.id) {
      router.push("/login");
      return;
    }
    if (isJoined) {
      setBusyMode("enter");
      setErr("");
      let holdBusy = false;
      try {
        const res = await fetch(
          `/api/community/meetings/${encodeURIComponent(meetingId)}/meeting-open-chat/rooms`,
          { credentials: "include", cache: "no-store" }
        );
        const jList = (await res.json()) as {
          ok?: boolean;
          rooms?: { id: string; created_at?: string }[];
        };
        let primaryOpenId: string | null = null;
        if (res.ok && jList.ok && Array.isArray(jList.rooms) && jList.rooms.length > 0) {
          const sorted = [...jList.rooms].sort(
            (a, b) =>
              new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
          );
          primaryOpenId = sorted[0]?.id ?? null;
        }
        holdBusy = goToMeetingChat(primaryOpenId);
      } catch {
        holdBusy = goToMeetingChat(null);
      } finally {
        if (!holdBusy) setBusyMode(null);
      }
      return;
    }

    if (source === "inline") setBusyMode("join");
    if (source === "modal") setModalBusy(true);
    setErr("");
    setModalSubmitErr("");
    let holdBusy = false;
    try {
      const payload: Record<string, string> = {};
      const pwd = opts?.password ?? "";
      if (meetingPasswordRequired) payload.password = pwd;
      if (typeof opts?.message === "string") payload.message = opts.message;
      const hasBody = Object.keys(payload).length > 0;

      const setBothErr = (msg: string) => {
        setErr(msg);
        if (source === "modal") setModalSubmitErr(msg);
      };

      let res: Response;
      try {
        res = await fetch(mApi.join(), {
          method: "POST",
          credentials: "include",
          headers: hasBody ? { "Content-Type": "application/json" } : undefined,
          body: hasBody ? JSON.stringify(payload) : undefined,
        });
      } catch {
        setBothErr("네트워크 오류로 요청하지 못했습니다.");
        return;
      }

      const raw = await res.text();
      let j: {
        ok?: boolean;
        error?: string;
        chatRoomId?: string | null;
        meetingOpenChatRoomId?: string | null;
        pending?: boolean;
        already?: boolean;
        alreadyPending?: boolean;
      } = {};
      if (raw.trim()) {
        try {
          j = JSON.parse(raw) as typeof j;
        } catch {
          setBothErr(
            res.status === 401
              ? "로그인이 필요합니다."
              : "서버 응답을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
          );
          if (res.status === 401) router.push("/login");
          return;
        }
      }

      if (res.status === 401) {
        setBothErr("로그인이 필요합니다.");
        router.push("/login");
        return;
      }

      if (j.error === "already_joined") {
        setJoinModalOpen(false);
        setPasswordOnlyModalOpen(false);
        holdBusy = goToMeetingChat(j.meetingOpenChatRoomId);
        return;
      }
      if (j.error === "already_pending") {
        setLocalStatus("pending");
        setJoinModalOpen(false);
        setOkMsg("이미 신청이 접수된 상태입니다. 운영자 승인을 기다려 주세요.");
        window.setTimeout(() => setOkMsg(""), 8000);
        router.refresh();
        return;
      }
      if (!res.ok || !j.ok) {
        const msg =
          j.error === "full"
            ? "인원이 가득 찼습니다."
            : j.error === "closed"
              ? "모집이 마감되었어요."
              : j.error === "meeting_banned"
                ? "이 오픈채팅에는 다시 참여할 수 없습니다."
                : j.error === "invalid_password"
                  ? "비밀번호가 올바르지 않습니다."
                  : j.error ?? "참여할 수 없습니다.";
        setBothErr(msg);
        if (j.error === "invalid_password" && source === "inline" && meetingPasswordRequired) {
          setPasswordOnlyModalOpen(true);
        }
        return;
      }
      if (j.pending || j.alreadyPending) {
        setLocalStatus("pending");
        setJoinModalOpen(false);
        setModalSubmitErr("");
        setOkMsg("신청이 접수되어 운영자에게 전달되었습니다. 승인되면 오픈채팅방에 입장할 수 있어요.");
        window.setTimeout(() => setOkMsg(""), 12000);
        router.refresh();
        return;
      }
      setJoinModalOpen(false);
      setPasswordOnlyModalOpen(false);
      holdBusy = goToMeetingChat(j.meetingOpenChatRoomId);
    } finally {
      setModalBusy(false);
      if (!holdBusy && source === "inline") setBusyMode(null);
    }
  };

  const onLeave = async () => {
    if (!me?.id) return;
    setBusyMode("leave");
    setErr("");
    try {
      const res = await fetch(mApi.leave(), { method: "POST" });
      const j = (await res.json()) as { ok?: boolean };
      if (res.ok && j.ok) {
        setLocalStatus("left");
        router.refresh();
      }
    } finally {
      setBusyMode(null);
    }
  };

  if (!me?.id) {
    return (
      <p className="text-[12px] text-gray-600">
        <button type="button" className="font-medium text-sky-700 underline" onClick={() => router.push("/login")}>
          로그인
        </button>
        후 오픈채팅에 참여할 수 있어요.
      </p>
    );
  }

  const busy = busyMode !== null;
  const waitLabel =
    busyMode === "leave"
      ? "처리 중…"
      : busyMode === "enter"
        ? "오픈채팅으로 이동 중…"
        : "오픈채팅에 연결하는 중…";

  const round = embedChrome ? "rounded-[4px]" : "rounded-xl";
  const ctaJoin = embedChrome
    ? `${round} min-h-[48px] w-full px-4 py-3 text-[15px] font-semibold shadow-sm bg-[#10a37f] text-white disabled:opacity-50 active:opacity-90`
    : "min-h-[52px] w-full rounded-xl px-4 py-3.5 text-[16px] font-semibold shadow-md bg-emerald-600 text-white disabled:opacity-50 active:opacity-90";
  const ctaJoined = embedChrome
    ? `${round} min-h-[48px] w-full px-4 py-3 text-[15px] font-semibold shadow-sm bg-sky-600 text-white disabled:opacity-50 active:opacity-90`
    : "min-h-[52px] w-full rounded-xl px-4 py-3.5 text-[16px] font-semibold shadow-md bg-sky-600 text-white disabled:opacity-50 active:opacity-90";

  if (busy) {
    return (
      <div
        className={`flex min-h-[104px] w-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-emerald-50/90 to-white py-6 ${embedChrome ? round : "rounded-xl"}`}
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div
          className="h-9 w-9 animate-spin rounded-full border-[3px] border-emerald-100 border-t-emerald-600"
          aria-hidden
        />
        <p className="text-[14px] font-semibold tracking-tight text-emerald-950/85">{waitLabel}</p>
      </div>
    );
  }

  const defaultNickname = me?.nickname?.trim() || "";
  const openChatDisplayNickname = (): string => {
    const n = defaultNickname.trim();
    if (n) return n;
    const id = me?.id?.trim();
    if (id) return `u${id.replace(/-/g, "").slice(0, 12)}`;
    return "";
  };

  return (
    <div className="flex w-full flex-col gap-2.5">
      {okMsg ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] leading-relaxed text-emerald-900">
          {okMsg}
        </p>
      ) : null}
      {!embedChrome && helperText ? <p className="text-[12px] text-gray-600">{helperText}</p> : null}

      <MeetingJoinRequestModal
        open={joinModalOpen}
        onClose={() => !modalBusy && setJoinModalOpen(false)}
        defaultNickname={defaultNickname}
        requirePassword={meetingPasswordRequired}
        busy={modalBusy}
        submitError={modalSubmitErr}
        onSubmit={(p) => {
          const message = formatMeetingJoinRequestMessage({
            nickname: p.nickname,
            intro: p.intro,
            reason: p.reason,
            note: p.note,
          });
          void runJoin(
            {
              message,
              ...(p.password ? { password: p.password } : {}),
            },
            "modal"
          );
        }}
      />

      <MeetingOpenChatRoomCredentialsModal
        open={unifiedCredOpen}
        onClose={() => {
          if (busyMode !== "join") {
            setErr("");
            setUnifiedCredOpen(false);
          }
        }}
        busy={busyMode === "join"}
        error={unifiedCredOpen ? err : ""}
        defaultNickname={defaultNickname}
        showRoomPassword={openChatRoomHasPassword}
        showApprovalIntro={openChatRoomNeedsApprovalIntro}
        onSubmit={(p) => void runOpenChatUnifiedEnter(p)}
      />

      <MeetingPasswordOnlyModal
        open={passwordOnlyModalOpen}
        onClose={() => busyMode !== "join" && setPasswordOnlyModalOpen(false)}
        busy={busyMode === "join"}
        error={passwordOnlyModalOpen ? err : ""}
        onSubmit={(pwd) => void runJoin({ password: pwd }, "inline")}
      />

      <MeetingPasswordOnlyModal
        open={roomPwdOnlyModalOpen}
        onClose={() => {
          if (busyMode !== "join") {
            setRoomPwdOnlyModalOpen(false);
            setErr("");
          }
        }}
        busy={busyMode === "join"}
        error={roomPwdOnlyModalOpen ? err : ""}
        title="채팅방 비밀번호"
        hint="방장이 설정한 비밀번호를 입력하면 모임에 참여한 뒤 채팅방으로 이동합니다."
        submitLabel="입장하기"
        onSubmit={(pwd) =>
          void runOpenChatUnifiedEnter({
            openNickname: openChatDisplayNickname(),
            roomPassword: pwd,
            introMessage: "",
          })
        }
      />

      {useModalForJoinRequest ? (
        <button
          type="button"
          disabled={!canJoin}
          onClick={() => {
            setModalSubmitErr("");
            setJoinModalOpen(true);
          }}
          className={ctaJoin}
        >
          참여 요청
        </button>
      ) : (
        <button
          type="button"
          disabled={!isJoined && !canJoin}
          onClick={() => {
            if (passwordOnlyOpenJoin) {
              setPasswordOnlyModalOpen(true);
              return;
            }
            if (needsRoomPasswordOnlyModal) {
              setErr("");
              setRoomPwdOnlyModalOpen(true);
              return;
            }
            if (needsUnifiedCredModal) {
              setErr("");
              setUnifiedCredOpen(true);
              return;
            }
            void runJoin(undefined, "inline");
          }}
          className={isJoined ? ctaJoined : ctaJoin}
        >
          {joinLabel}
        </button>
      )}

      {isJoined ? (
        <button
          type="button"
          onClick={() => void onLeave()}
          className={`min-h-12 w-full border-2 border-gray-200 bg-white px-4 py-3 text-[14px] font-medium text-gray-700 ${embedChrome ? round : "rounded-xl"}`}
        >
          오픈채팅 나가기
        </button>
      ) : null}
      {err &&
      !passwordOnlyModalOpen &&
      !roomPwdOnlyModalOpen &&
      !unifiedCredOpen &&
      !joinModalOpen ? (
        <p className="w-full text-[12px] text-red-600">{err}</p>
      ) : null}
    </div>
  );
}
