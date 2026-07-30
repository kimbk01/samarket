"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildGroupRoomWebPath } from "@/lib/community-messenger/group/group-room-deeplink";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";

type Preview = {
  roomId: string;
  title: string;
  summary: string;
  avatarUrl: string | null;
  memberCount: number;
  requiresApproval: boolean;
  linkName: string | null;
  viewerStatus: "guest" | "member" | "pending" | "banned";
  requestId: string | null;
};

export default function GroupInviteJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const { safeT } = useI18n();
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "busy" | "error">("loading");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { token: raw } = await params;
      const inviteToken = decodeURIComponent(raw ?? "").trim();
      if (!inviteToken) {
        if (!cancelled) {
          setStatus("error");
          setMessage(
            safeT("cm_ui_group_invite_invalid", {
              fallbackKo: "유효하지 않은 초대 링크입니다.",
              fallbackEn: "This invite link is invalid.",
            })
          );
        }
        return;
      }
      setToken(inviteToken);
      const res = await fetch(
        `/api/community-messenger/group-rooms/invite-preview?token=${encodeURIComponent(inviteToken)}`
      );
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; preview?: Preview };
      if (cancelled) return;
      if (!res.ok || !json.ok || !json.preview) {
        setStatus("error");
        setMessage(
          safeT("cm_ui_group_invite_invalid", {
            fallbackKo: "유효하지 않은 초대 링크입니다.",
            fallbackEn: "This invite link is invalid.",
          })
        );
        return;
      }
      setPreview(json.preview);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [params, safeT]);

  async function joinNow() {
    if (!token || status === "busy") return;
    setStatus("busy");
    const res = await fetch("/api/community-messenger/group-rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteToken: token }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      roomId?: string;
      roomPath?: string;
      code?: string;
    };
    if (res.ok && json.ok && json.roomId) {
      router.replace(json.roomPath ?? buildGroupRoomWebPath(json.roomId));
      return;
    }
    setStatus("ready");
    setMessage(
      json.code === "user_banned"
        ? safeT("cm_ui_group_user_banned", {
            fallbackKo: "이 그룹에서 차단되어 참여할 수 없습니다.",
            fallbackEn: "You are banned from this group and cannot join.",
          })
        : safeT("cm_ui_group_invite_join_failed", {
            fallbackKo: "그룹 참여에 실패했습니다.",
            fallbackEn: "Could not join the group.",
          })
    );
  }

  async function requestJoin() {
    if (!token || status === "busy") return;
    setStatus("busy");
    const res = await fetch("/api/community-messenger/group-rooms/join-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteToken: token }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      alreadyMember?: boolean;
      roomId?: string;
      roomPath?: string;
      requestId?: string;
      code?: string;
    };
    if (res.ok && json.ok && json.alreadyMember && json.roomId) {
      router.replace(json.roomPath ?? buildGroupRoomWebPath(json.roomId));
      return;
    }
    if (res.ok && json.ok) {
      setPreview((prev) =>
        prev
          ? { ...prev, viewerStatus: "pending", requestId: json.requestId ?? prev.requestId }
          : prev
      );
      setStatus("ready");
      return;
    }
    setStatus("ready");
    setMessage(
      json.code === "user_banned"
        ? safeT("cm_ui_group_user_banned", {
            fallbackKo: "이 그룹에서 차단되어 참여할 수 없습니다.",
            fallbackEn: "You are banned from this group and cannot join.",
          })
        : safeT("cm_ui_group_join_request_failed", {
            fallbackKo: "가입 요청에 실패했습니다.",
            fallbackEn: "Could not send join request.",
          })
    );
  }

  async function cancelRequest() {
    if (!preview?.roomId || status === "busy") return;
    setStatus("busy");
    await fetch("/api/community-messenger/group-rooms/join-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", roomId: preview.roomId }),
    });
    setPreview((prev) => (prev ? { ...prev, viewerStatus: "guest", requestId: null } : prev));
    setStatus("ready");
  }

  if (status === "loading") {
    return (
      <main className="flex min-h-[50vh] items-center justify-center bg-sam-app px-4">
        <p className="sam-text-body-lg text-sam-fg">
          {safeT("cm_ui_group_invite_preview_loading", {
            fallbackKo: "그룹 정보를 불러오는 중…",
            fallbackEn: "Loading group…",
          })}
        </p>
      </main>
    );
  }

  if (status === "error" || !preview) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center bg-sam-app px-4">
        <p className="sam-text-body-lg text-sam-fg">{message}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 bg-sam-app px-4 py-8">
      {preview.avatarUrl ? (
        <SamarketThumbnail src={preview.avatarUrl} size={72} roundedClassName="rounded-full" />
      ) : (
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-sam-surface text-sam-muted sam-text-page-title">
          {(preview.title || "G").slice(0, 1)}
        </div>
      )}
      <h1 className="text-center sam-text-page-title font-semibold text-sam-fg">{preview.title || "Group"}</h1>
      <p className="text-center sam-text-helper text-sam-muted">
        {safeT("cm_ui_group_member_count_label", {
          fallbackKo: `멤버 ${preview.memberCount}명`,
          fallbackEn: `${preview.memberCount} members`,
        })}
      </p>
      {preview.summary ? <p className="text-center sam-text-body text-sam-muted">{preview.summary}</p> : null}
      {message ? <p className="text-center sam-text-helper text-red-600">{message}</p> : null}

      {preview.viewerStatus === "member" ? (
        <button
          type="button"
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 sam-text-body font-semibold text-sam-fg"
          onClick={() => router.replace(buildGroupRoomWebPath(preview.roomId))}
        >
          {safeT("cm_ui_group_open", { fallbackKo: "그룹 열기", fallbackEn: "Open group" })}
        </button>
      ) : preview.viewerStatus === "banned" ? (
        <p className="text-center sam-text-body font-semibold text-red-700">
          {safeT("cm_ui_group_user_banned", {
            fallbackKo: "이 그룹에서 차단되어 참여할 수 없습니다.",
            fallbackEn: "You are banned from this group and cannot join.",
          })}
        </p>
      ) : preview.viewerStatus === "pending" ? (
        <div className="flex w-full flex-col gap-2">
          <p className="text-center sam-text-body text-sam-fg">
            {safeT("cm_ui_group_join_pending", {
              fallbackKo: "승인 대기 중",
              fallbackEn: "Awaiting approval",
            })}
          </p>
          <button
            type="button"
            className="w-full rounded-ui-rect border border-sam-border px-4 py-3 sam-text-body font-semibold text-sam-fg"
            disabled={status === "busy"}
            onClick={() => void cancelRequest()}
          >
            {safeT("cm_ui_group_join_cancel_request", {
              fallbackKo: "요청 취소",
              fallbackEn: "Cancel request",
            })}
          </button>
        </div>
      ) : preview.requiresApproval ? (
        <button
          type="button"
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 sam-text-body font-semibold text-sam-fg disabled:opacity-40"
          disabled={status === "busy"}
          onClick={() => void requestJoin()}
        >
          {status === "busy"
            ? safeT("cm_ui_group_join_requesting", { fallbackKo: "요청 중…", fallbackEn: "Requesting…" })
            : safeT("cm_ui_group_join_request", { fallbackKo: "가입 요청", fallbackEn: "Request to join" })}
        </button>
      ) : (
        <button
          type="button"
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 sam-text-body font-semibold text-sam-fg disabled:opacity-40"
          disabled={status === "busy"}
          onClick={() => void joinNow()}
        >
          {status === "busy"
            ? safeT("cm_ui_group_invite_joining", {
                fallbackKo: "그룹에 참여하는 중…",
                fallbackEn: "Joining group…",
              })
            : safeT("cm_ui_group_join", { fallbackKo: "그룹 참여", fallbackEn: "Join group" })}
        </button>
      )}
    </main>
  );
}
