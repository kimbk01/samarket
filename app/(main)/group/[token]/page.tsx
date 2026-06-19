"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildGroupRoomWebPath } from "@/lib/community-messenger/group/group-room-deeplink";

export default function GroupInviteJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const { safeT } = useI18n();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { token } = await params;
      const inviteToken = decodeURIComponent(token ?? "").trim();
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
      const res = await fetch("/api/community-messenger/group-rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteToken }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; roomId?: string; roomPath?: string };
      if (cancelled) return;
      if (res.ok && json.ok && json.roomId) {
        setStatus("ok");
        router.replace(json.roomPath ?? buildGroupRoomWebPath(json.roomId));
        return;
      }
      setStatus("error");
      setMessage(
        safeT("cm_ui_group_invite_join_failed", {
          fallbackKo: "그룹 참여에 실패했습니다.",
          fallbackEn: "Could not join the group.",
        })
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [params, router, safeT]);

  return (
    <main className="flex min-h-[50vh] items-center justify-center bg-sam-app px-4">
      <p className="sam-text-body-lg text-sam-fg">
        {status === "loading"
          ? safeT("cm_ui_group_invite_joining", {
              fallbackKo: "그룹에 참여하는 중…",
              fallbackEn: "Joining group…",
            })
          : message}
      </p>
    </main>
  );
}
