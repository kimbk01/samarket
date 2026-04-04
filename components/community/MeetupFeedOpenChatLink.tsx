"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { philifeOpenChatUnifiedEnterClient } from "@/lib/neighborhood/philife-open-chat-unified-enter-client";
import type { FeedMeetupOpenChatNavPlan } from "@/lib/neighborhood/resolve-feed-meetup-open-chat-nav";
import { philifeAppPaths } from "@/lib/philife/paths";
import { MeetingOpenChatRoomCredentialsModal } from "./MeetingOpenChatRoomCredentialsModal";
import { MeetingPasswordOnlyModal } from "./MeetingPasswordOnlyModal";

const linkCls =
  "block px-4 py-3 transition-colors hover:bg-neutral-50/60 active:bg-neutral-100/80 cursor-pointer";

export function MeetupFeedOpenChatLink({
  meetingId,
  fallbackHref,
  children,
}: {
  meetingId: string;
  fallbackHref: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const mid = String(meetingId ?? "").trim();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [roomPwdOpen, setRoomPwdOpen] = useState(false);
  const [unifiedOpen, setUnifiedOpen] = useState(false);
  const [planPayload, setPlanPayload] = useState<{
    kind: "room_password" | "unified";
    defaultRoomId: string;
    openChatRoomHasPassword: boolean;
    openChatRoomNeedsApprovalIntro: boolean;
  } | null>(null);

  const me = typeof window !== "undefined" ? getCurrentUser() : null;
  const defaultNickname = me?.nickname?.trim() ?? "";
  const openChatDisplayNickname = (): string => {
    if (defaultNickname) return defaultNickname;
    const id = me?.id?.trim();
    if (id) return `u${id.replace(/-/g, "").slice(0, 12)}`;
    return "";
  };

  const applyPlan = useCallback(
    (plan: FeedMeetupOpenChatNavPlan) => {
      if (plan.action === "navigate") {
        router.push(plan.path);
        return;
      }
      if (plan.action === "room_password_modal") {
        setPlanPayload({
          kind: "room_password",
          defaultRoomId: plan.defaultRoomId,
          openChatRoomHasPassword: plan.openChatRoomHasPassword,
          openChatRoomNeedsApprovalIntro: plan.openChatRoomNeedsApprovalIntro,
        });
        setErr("");
        setRoomPwdOpen(true);
        return;
      }
      setPlanPayload({
        kind: "unified",
        defaultRoomId: plan.defaultRoomId,
        openChatRoomHasPassword: plan.openChatRoomHasPassword,
        openChatRoomNeedsApprovalIntro: plan.openChatRoomNeedsApprovalIntro,
      });
      setErr("");
      setUnifiedOpen(true);
    },
    [router]
  );

  const onActivate = useCallback(async () => {
    if (!mid || busy) return;
    if (!me?.id) {
      router.push("/login");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/community/meetings/${encodeURIComponent(mid)}/feed-open-chat-nav`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as { ok?: boolean; plan?: FeedMeetupOpenChatNavPlan; error?: string };
      if (!res.ok || !json.ok || !json.plan) {
        router.push(fallbackHref);
        return;
      }
      applyPlan(json.plan);
    } catch {
      router.push(fallbackHref);
    } finally {
      setBusy(false);
    }
  }, [mid, busy, me?.id, fallbackHref, router, applyPlan]);

  const afterUnifiedSuccess = useCallback(
    (roomId: string) => {
      setRoomPwdOpen(false);
      setUnifiedOpen(false);
      setPlanPayload(null);
      router.push(philifeAppPaths.meetingGroupChatRoom(mid, roomId));
      router.refresh();
    },
    [router, mid]
  );

  return (
    <>
      <a
        href={fallbackHref}
        className={linkCls}
        aria-busy={busy}
        onClick={(e) => {
          e.preventDefault();
          void onActivate();
        }}
      >
        {children}
      </a>

      {planPayload?.kind === "room_password" ? (
        <MeetingPasswordOnlyModal
          open={roomPwdOpen}
          onClose={() => {
            if (!busy) {
              setRoomPwdOpen(false);
              setPlanPayload(null);
              setErr("");
            }
          }}
          busy={busy}
          error={err}
          title="채팅방 비밀번호"
          hint="방장이 설정한 비밀번호를 입력하면 모임에 참여한 뒤 채팅방으로 이동합니다."
          submitLabel="입장하기"
          onSubmit={async (pwd) => {
            const nick = openChatDisplayNickname();
            if (!nick) {
              setErr("프로필 닉네임을 설정한 뒤 다시 시도해 주세요.");
              return;
            }
            setBusy(true);
            setErr("");
            try {
              const r = await philifeOpenChatUnifiedEnterClient({
                meetingId: mid,
                defaultRoomId: planPayload.defaultRoomId,
                openChatRoomHasPassword: planPayload.openChatRoomHasPassword,
                openChatRoomNeedsApprovalIntro: planPayload.openChatRoomNeedsApprovalIntro,
                openNickname: nick,
                roomPassword: pwd,
                introMessage: "",
              });
              if (!r.ok) {
                if ("needsLogin" in r && r.needsLogin) {
                  router.push("/login");
                  return;
                }
                if ("meetingPending" in r && r.meetingPending) {
                  alert(r.message);
                  setRoomPwdOpen(false);
                  router.refresh();
                  return;
                }
                if ("chatPendingApproval" in r && r.chatPendingApproval) {
                  alert("입장 신청이 접수되었습니다. 운영자 승인을 기다려 주세요.");
                  setRoomPwdOpen(false);
                  router.refresh();
                  return;
                }
                setErr("error" in r ? r.error : "입장에 실패했습니다.");
                return;
              }
              afterUnifiedSuccess(r.roomId);
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}

      {planPayload?.kind === "unified" ? (
        <MeetingOpenChatRoomCredentialsModal
          open={unifiedOpen}
          onClose={() => {
            if (!busy) {
              setUnifiedOpen(false);
              setPlanPayload(null);
              setErr("");
            }
          }}
          busy={busy}
          error={unifiedOpen ? err : ""}
          defaultNickname={defaultNickname}
          showRoomPassword={planPayload.openChatRoomHasPassword}
          showApprovalIntro={planPayload.openChatRoomNeedsApprovalIntro}
          onSubmit={async (p) => {
            setBusy(true);
            setErr("");
            try {
              const r = await philifeOpenChatUnifiedEnterClient({
                meetingId: mid,
                defaultRoomId: planPayload.defaultRoomId,
                openChatRoomHasPassword: planPayload.openChatRoomHasPassword,
                openChatRoomNeedsApprovalIntro: planPayload.openChatRoomNeedsApprovalIntro,
                openNickname: p.openNickname,
                roomPassword: p.roomPassword,
                introMessage: p.introMessage,
              });
              if (!r.ok) {
                if ("needsLogin" in r && r.needsLogin) {
                  router.push("/login");
                  return;
                }
                if ("meetingPending" in r && r.meetingPending) {
                  alert(r.message);
                  setUnifiedOpen(false);
                  router.refresh();
                  return;
                }
                if ("chatPendingApproval" in r && r.chatPendingApproval) {
                  alert("입장 신청이 접수되었습니다. 운영자 승인을 기다려 주세요.");
                  setUnifiedOpen(false);
                  router.refresh();
                  return;
                }
                setErr("error" in r ? r.error : "입장에 실패했습니다.");
                return;
              }
              afterUnifiedSuccess(r.roomId);
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </>
  );
}
