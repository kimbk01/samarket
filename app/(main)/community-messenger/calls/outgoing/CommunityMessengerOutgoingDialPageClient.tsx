"use client";

import { useLayoutEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { primeOutgoingCallMediaBeforeNavigate } from "@/lib/community-messenger/call-media-bootstrap";
import { getCallMediaPermissionBlockedMessageKey } from "@/lib/community-messenger/call-media-permission-preflight";
import { startFreshOutgoingCall } from "@/lib/call/call-navigation";
import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type OutgoingDialParams = {
  roomId: string;
  peerUserId: string;
  peerLabelRaw: string;
  kind: "voice" | "video";
};

function readOutgoingDialParamsFromLocation(): OutgoingDialParams {
  if (typeof window === "undefined") {
    return { roomId: "", peerUserId: "", peerLabelRaw: "", kind: "voice" };
  }
  const q = new URLSearchParams(window.location.search);
  return {
    roomId: q.get("roomId")?.trim() ?? "",
    peerUserId: q.get("peerUserId")?.trim() ?? "",
    peerLabelRaw: q.get("peerLabel")?.trim() ?? "",
    kind: q.get("kind") === "video" ? "video" : "voice",
  };
}

/** `/calls/outgoing` — query params로 fresh POST 발신 후 실제 session route로 replace */
export function CommunityMessengerOutgoingDialPageClient() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const p = readOutgoingDialParamsFromLocation();
    if (!p.roomId && !p.peerUserId) {
      setError(t("cm_ui_call_outgoing_missing_room"));
      return;
    }
    void (async () => {
      const primeResult = await primeOutgoingCallMediaBeforeNavigate(p.kind);
      if (!primeResult.ok) {
        setError(t(getCallMediaPermissionBlockedMessageKey(p.kind)));
        return;
      }
      let roomId = p.roomId;
      if (!roomId && p.peerUserId) {
        const res = await fetch("/api/community-messenger/rooms/direct", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ peerUserId: p.peerUserId }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; roomId?: string; error?: string };
        if (!res.ok || !json.ok || !json.roomId?.trim()) {
          if (redirectForBlockedAction(router, json.error, pathname)) return;
          setError(t("cm_ui_network_error_could_not_start_call"));
          return;
        }
        roomId = json.roomId.trim();
      }
      const result = await startFreshOutgoingCall({
        roomId,
        callKind: p.kind,
        peerUserId: p.peerUserId || null,
        peerLabel: p.peerLabelRaw || undefined,
        router,
      });
      if (!result.ok) {
        setError(result.userMessage ?? t("cm_ui_network_error_could_not_start_call"));
      }
    })();
  }, [pathname, router, t]);

  if (error) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center px-6 text-center">
        <p className="text-sam-fg sam-text-body">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-sam-fg sam-text-body">{t("cm_ui_connecting")}</p>
    </div>
  );
}
