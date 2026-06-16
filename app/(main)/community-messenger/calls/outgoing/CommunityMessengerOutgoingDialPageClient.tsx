"use client";

import { useLayoutEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { primeOutgoingCallMediaBeforeNavigate } from "@/lib/community-messenger/call-media-bootstrap";
import { getCallMediaPermissionBlockedMessageKey } from "@/lib/community-messenger/call-media-permission-preflight";
import {
  buildCommunityMessengerInstantOutgoingCallHref,
} from "@/lib/community-messenger/call-session-navigation-seed";
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

/**
 * 레거시 `/calls/outgoing` — 즉시 임시 세션이 붙은 `/calls/tmp_*` 로 치환한다.
 * 실제 세션 POST 는 `CommunityMessengerCallClient` 가 백그라운드에서 수행한다.
 */
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
      const href = buildCommunityMessengerInstantOutgoingCallHref({
        kind: p.kind,
        roomId: p.roomId || undefined,
        peerUserId: p.peerUserId || undefined,
        peerLabel: p.peerLabelRaw || undefined,
      });
      const primeResult = await primeOutgoingCallMediaBeforeNavigate(p.kind);
      if (!primeResult.ok) {
        setError(t(getCallMediaPermissionBlockedMessageKey(p.kind)));
        return;
      }
      router.replace(href);
    })();
  }, [router, t]);

  if (error) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[linear-gradient(180deg,#7b63ef_0%,#4a56d4_58%,#3a72d4_100%)] px-6 text-center">
        <p className="sam-text-body text-white/95">{error}</p>
        <button
          type="button"
          className="mt-6 rounded-ui-rect bg-white/15 px-5 py-2.5 sam-text-body font-medium text-white"
          onClick={() => {
            const next = pathname.trim() || "/community-messenger";
            if (redirectForBlockedAction(router, undefined, next)) return;
            router.back();
          }}
        >
          {t("nav_back")}
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center bg-[linear-gradient(180deg,#7b63ef_0%,#4a56d4_58%,#3a72d4_100%)] px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white"
        aria-hidden
      />
      <p className="mt-6 text-center sam-text-body text-white/90">{t("cm_ui_moving_to_call_screen")}</p>
    </div>
  );
}
