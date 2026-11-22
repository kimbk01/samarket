"use client";

import { useLayoutEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { launchOutgoingDirectCall, isOutgoingCallPhoneVerificationRequired } from "@/lib/community-messenger/call-session-navigation-seed";
import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibaySpinner } from "@/components/ui/DibaySpinner";

type OutgoingDialParams = {
  roomId: string;
  peerUserId: string;
  kind: "voice" | "video";
};

function readOutgoingDialParamsFromLocation(): OutgoingDialParams {
  if (typeof window === "undefined") {
    return { roomId: "", peerUserId: "", kind: "voice" };
  }
  const q = new URLSearchParams(window.location.search);
  return {
    roomId: q.get("roomId")?.trim() ?? "",
    peerUserId: q.get("peerUserId")?.trim() ?? "",
    kind: q.get("kind") === "video" ? "video" : "voice",
  };
}

/**
 * 레거시 `/calls/outgoing` — 세션 POST 완료 후 실제 `/calls/:sessionId` 로 이동한다.
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
      const result = await launchOutgoingDirectCall(
        {
          kind: p.kind,
          roomId: p.roomId || null,
          peerUserId: p.peerUserId || null,
        },
        router
      );
      if (!result.ok) {
        if (isOutgoingCallPhoneVerificationRequired(result)) return;
        setError(result.userMessage);
      }
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
      {/* P4 C1 (Owner 「C1·C2만 승인」 2026-11-22): 모양만 DIBAY 스피너 단일 정의(흰색) — 문구·흐름 무변경 */}
      <DibaySpinner size="lg" tone="inverse" decorative />
      <p className="mt-6 text-center sam-text-body text-white/90">{t("cm_ui_moving_to_call_screen")}</p>
    </div>
  );
}
