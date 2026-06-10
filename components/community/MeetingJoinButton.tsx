"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { philifeMeetingApi } from "@domain/philife/api";
import { philifeAppPaths } from "@domain/philife/paths";
import { getCurrentUser, getHydrationSafeCurrentUser } from "@/lib/auth/get-current-user";
import { formatMeetingJoinRequestMessage } from "@/lib/neighborhood/meeting-join-request-message";
import { MeetingJoinRequestModal } from "./MeetingJoinRequestModal";
import { MeetingPasswordOnlyModal } from "./MeetingPasswordOnlyModal";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";

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
  const { t } = useI18n();
  const router = useRouter();
  const requireAction = useRequireAuthAction();
  const pathname = usePathname();
  const meetingPath = philifeAppPaths.meeting(meetingId);
  const messengerRoomPath = chatRoomId ? `/community-messenger/rooms/${encodeURIComponent(chatRoomId)}` : meetingPath;
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
    setLocalStatus((prev) => (prev === viewerStatus ? prev : viewerStatus));
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
    if (error === "full") return t("community_meeting_join_full");
    if (error === "closed") return t("community_meeting_join_closed");
    if (error === "meeting_banned") return t("community_meeting_join_banned");
    if (error === "invalid_password") return t("community_meeting_join_bad_password");
    return error ?? t("community_meeting_join_failed");
  };

  const finishJoin = async (payload?: { password?: string; message?: string }) => {
    if (!me?.id) {
      await requireAction("messenger_open", () => finishJoin(payload));
      return;
    }
    setBusy((prev) => (prev ? prev : true));
    setErr((prev) => (prev === "" ? prev : ""));
    setModalSubmitErr((prev) => (prev === "" ? prev : ""));
    try {
      const res = await fetch(mApi.join(), {
        method: "POST",
        credentials: "include",
        headers: payload ? { "Content-Type": "application/json" } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
      });
      if (res.status === 401) {
        await requireAction("messenger_open", () => finishJoin(payload));
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
        setOkMsg(t("community_meeting_join_request_ok"));
        router.refresh();
        return;
      }
      setLocalStatus("joined");
      setJoinModalOpen(false);
      setPasswordModalOpen(false);
      setOkMsg(json.already ? t("community_meeting_join_already") : t("community_meeting_join_done"));
      if (pathname !== messengerRoomPath) router.push(messengerRoomPath);
      router.refresh();
    } catch {
      const msg = t("community_meeting_join_network_err");
      setErr(msg);
      setModalSubmitErr(msg);
    } finally {
      setBusy((prev) => (prev ? false : prev));
    }
  };

  const onClickMain = () => {
    if (!meetingId) return;
    if (!me?.id) {
      void requireAction("messenger_open", onClickMain);
      return;
    }
    if (isJoined) {
      if (pathname !== messengerRoomPath) router.push(messengerRoomPath);
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
      ? t("community_meeting_join_chat_entry")
      : t("community_meeting_join_active")
    : entryNorm === "approve" || entryNorm === "invite_only" || requiresApproval
      ? effectiveStatus === "pending"
        ? t("community_meeting_join_pending")
        : t("community_meeting_join_request")
      : meetingPasswordRequired
        ? t("community_meeting_join_with_password")
        : t("community_meeting_join_cta");

  const pendingSuffix =
    pendingCount > 0 ? ` · ${t("community_meeting_pending_approval", { count: pendingCount }).trim()}` : "";
  const helperText = isClosed
    ? t("community_meeting_join_closed_hint")
    : effectiveStatus === "pending"
      ? t("community_meeting_join_approve_hint", { pending: pendingSuffix })
      : entryNorm === "approve" || entryNorm === "invite_only" || requiresApproval
        ? t("community_meeting_join_request_hint")
        : meetingPasswordRequired
          ? t("community_meeting_join_password_hint")
          : "";

  const btnClass = embedChrome
    ? "w-full rounded-ui-rect bg-emerald-600 py-3 sam-text-body font-semibold text-white disabled:opacity-40"
    : "w-full rounded-ui-rect bg-emerald-600 py-3 sam-text-body font-bold text-white shadow-sm disabled:opacity-45";

  return (
    <div className={embedChrome ? "space-y-2" : "space-y-3"}>
      <button
        type="button"
        onClick={onClickMain}
        disabled={busy || isClosed || isFull || effectiveStatus === "pending" || !meetingId}
        className={btnClass}
      >
        {busy ? t("community_meeting_join_processing") : joinLabel}
      </button>

      {helperText ? (
        <p className={embedChrome ? "sam-text-xxs leading-relaxed text-sam-muted" : "sam-text-helper leading-relaxed text-sam-muted"}>
          {helperText}
        </p>
      ) : null}
      {err ? <p className="sam-text-helper text-red-600">{err}</p> : null}
      {okMsg ? <p className="sam-text-helper text-emerald-700">{okMsg}</p> : null}

      <MeetingPasswordOnlyModal
        open={passwordModalOpen}
        onClose={() => {
          if (!busy) {
            setPasswordModalOpen(false);
            setErr((prev) => (prev === "" ? prev : ""));
          }
        }}
        busy={busy}
        error={passwordModalOpen ? err : ""}
        title={t("community_join_password_title")}
        hint={t("community_meeting_password_modal_hint")}
        submitLabel={t("community_meeting_join_submit")}
        onSubmit={(password) => {
          void finishJoin({ password });
        }}
      />

      <MeetingJoinRequestModal
        open={joinModalOpen}
        onClose={() => {
          if (!busy) {
            setJoinModalOpen((prev) => (prev ? false : prev));
            setModalSubmitErr((prev) => (prev === "" ? prev : ""));
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
