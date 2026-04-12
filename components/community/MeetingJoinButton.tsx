"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { philifeMeetingApi } from "@domain/philife/api";
import { philifeAppPaths } from "@domain/philife/paths";
import { getCurrentUser, getHydrationSafeCurrentUser } from "@/lib/auth/get-current-user";
import { formatMeetingJoinRequestMessage } from "@/lib/neighborhood/meeting-join-request-message";
import { MeetingJoinRequestModal } from "./MeetingJoinRequestModal";
import { MeetingPasswordOnlyModal } from "./MeetingPasswordOnlyModal";

type ViewerMeetingStatus = "joined" | "pending" | "left" | "kicked" | "banned" | "rejected" | null;

export function MeetingJoinButton({
  meetingId,
  successSurface = "meeting",
  entryPolicy = "open",
  isClosed = false,
  memberCount,
  maxMembers,
  pendingCount = 0,
  viewerStatus = null,
  requiresApproval = false,
  embedChrome = false,
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
  const meetingPath = philifeAppPaths.meeting(meetingId);
  const mApi = philifeMeetingApi(meetingId);
  const [mounted, setMounted] = useState(false);
  const me = mounted ? getCurrentUser() : getHydrationSafeCurrentUser();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [localStatus, setLocalStatus] = useState<ViewerMeetingStatus>(viewerStatus);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [modalSubmitErr, setModalSubmitErr] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setLocalStatus(viewerStatus);
  }, [viewerStatus]);

  const isFull = typeof memberCount === "number" && typeof maxMembers === "number" && memberCount >= maxMembers;
  const effectiveStatus = localStatus;
  const isJoined = effectiveStatus === "joined";
  const entryNorm: "open" | "approve" | "password" | "invite_only" =
    entryPolicy === "approve" || entryPolicy === "invite_only" || entryPolicy === "password"
      ? entryPolicy
      : "open";
  const meetingPasswordRequired = entryNorm === "password" || Boolean(hasMeetingPassword);
  const useModalForJoinRequest =
    !isJoined &&
    effectiveStatus !== "pending" &&
    !(meetingPasswordRequired && !requiresApproval) &&
    (entryNorm === "approve" || entryNorm === "invite_only" || requiresApproval === true);
  const passwordOnlyOpenJoin =
    !isJoined &&
    effectiveStatus !== "pending" &&
    !requiresApproval &&
    entryNorm !== "approve" &&
    entryNorm !== "invite_only" &&
    meetingPasswordRequired;

  const parseJoinResponse = async (res: Response) => {
    const raw = await res.text();
    if (!raw.trim()) return {} as Record<string, unknown>;
    return JSON.parse(raw) as Record<string, unknown>;
  };

  const humanizeJoinError = (error?: string) => {
    if (error === "full") return "인원이 가득 찼습니다.";
    if (error === "closed") return "모집이 마감되었어요.";
    if (error === "meeting_banned") return "참여할 수 없는 모임입니다.";
    if (error === "invalid_password") return "비밀번호가 올바르지 않습니다.";
    return error ?? "참여를 처리하지 못했습니다.";
  };

  const finishJoin = async (payload?: { password?: string; message?: string }) => {
    if (!me?.id) {
      router.push("/login");
      return;
    }
    setBusy(true);
    setErr("");
    setModalSubmitErr("");
    try {
      const res = await fetch(mApi.join(), {
        method: "POST",
        credentials: "include",
        headers: payload ? { "Content-Type": "application/json" } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const json = (await parseJoinResponse(res)) as {
        ok?: boolean;
        error?: string;
        pending?: boolean;
        alreadyPending?: boolean;
        already?: boolean;
      };
      if (!res.ok || !json.ok) {
        const msg = humanizeJoinError(json.error);
        setErr(msg);
        setModalSubmitErr(msg);
        return;
      }
      if (json.pending || json.alreadyPending) {
        setLocalStatus("pending");
        setJoinModalOpen(false);
        setPasswordModalOpen(false);
        setOkMsg("참여 요청이 접수되었습니다. 운영자 승인을 기다려 주세요.");
        router.refresh();
        return;
      }
      setLocalStatus("joined");
      setJoinModalOpen(false);
      setPasswordModalOpen(false);
      setOkMsg(json.already ? "이미 참여 중입니다." : "모임 참여가 완료되었습니다.");
      if (pathname !== meetingPath) router.push(meetingPath);
      router.refresh();
    } catch {
      const msg = "네트워크 오류로 요청하지 못했습니다.";
      setErr(msg);
      setModalSubmitErr(msg);
    } finally {
      setBusy(false);
    }
  };

  const onClickMain = () => {
    if (!meetingId) return;
    if (!me?.id) {
      router.push("/login");
      return;
    }
    if (isJoined) {
      if (pathname !== meetingPath) router.push(meetingPath);
      else router.refresh();
      return;
    }
    if (isClosed || isFull || effectiveStatus === "pending") return;
    setErr("");
    if (useModalForJoinRequest) {
      setJoinModalOpen(true);
      return;
    }
    if (passwordOnlyOpenJoin) {
      setPasswordModalOpen(true);
      return;
    }
    void finishJoin();
  };

  const joinLabel = isJoined
    ? successSurface === "chat"
      ? "모임 보기"
      : "참여 중"
    : entryNorm === "approve" || entryNorm === "invite_only" || requiresApproval
      ? effectiveStatus === "pending"
        ? "가입 승인 대기 중"
        : "참여 요청"
      : meetingPasswordRequired
        ? "비밀번호로 참여"
        : "모임 참여";

  const helperText =
    isClosed
      ? "마감되었거나 종료된 모임입니다."
      : effectiveStatus === "pending"
        ? `운영자 승인 후 참여할 수 있어요${pendingCount > 0 ? ` · 현재 대기 ${pendingCount}명` : ""}.`
        : entryNorm === "approve" || entryNorm === "invite_only" || requiresApproval
          ? "참여 요청을 보내면 운영자가 확인 후 승인합니다."
          : meetingPasswordRequired
            ? "모임 비밀번호를 입력하면 참여할 수 있어요."
            : "";

  const btnClass = embedChrome
    ? "w-full rounded-ui-rect bg-emerald-600 py-3 text-[14px] font-semibold text-white disabled:opacity-40"
    : "w-full rounded-ui-rect bg-emerald-600 py-3 text-[15px] font-bold text-white shadow-sm disabled:opacity-45";

  return (
    <div className={embedChrome ? "space-y-2" : "space-y-3"}>
      <button
        type="button"
        onClick={onClickMain}
        disabled={busy || isClosed || isFull || effectiveStatus === "pending" || !meetingId}
        className={btnClass}
      >
        {busy ? "처리 중…" : joinLabel}
      </button>

      {helperText ? (
        <p className={embedChrome ? "text-[11px] leading-relaxed text-sam-muted" : "text-[12px] leading-relaxed text-sam-muted"}>
          {helperText}
        </p>
      ) : null}
      {err ? <p className="text-[12px] text-red-600">{err}</p> : null}
      {okMsg ? <p className="text-[12px] text-emerald-700">{okMsg}</p> : null}

      <MeetingPasswordOnlyModal
        open={passwordModalOpen}
        onClose={() => {
          if (!busy) {
            setPasswordModalOpen(false);
            setErr("");
          }
        }}
        busy={busy}
        error={passwordModalOpen ? err : ""}
        title="비밀번호로 참여"
        hint="모임에서 설정한 비밀번호를 입력하면 참여할 수 있어요."
        submitLabel="참여하기"
        onSubmit={(password) => {
          void finishJoin({ password });
        }}
      />

      <MeetingJoinRequestModal
        open={joinModalOpen}
        onClose={() => {
          if (!busy) {
            setJoinModalOpen(false);
            setModalSubmitErr("");
          }
        }}
        defaultNickname={me?.nickname?.trim() ?? ""}
        requirePassword={meetingPasswordRequired}
        busy={busy}
        submitError={modalSubmitErr}
        onSubmit={(payload) => {
          void finishJoin({
            message: formatMeetingJoinRequestMessage(payload),
            ...(payload.password ? { password: payload.password } : {}),
          });
        }}
      />
    </div>
  );
}
