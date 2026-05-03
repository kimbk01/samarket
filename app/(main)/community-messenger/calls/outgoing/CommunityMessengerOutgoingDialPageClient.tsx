"use client";

import { useLayoutEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  buildCommunityMessengerInstantOutgoingCallHref,
} from "@/lib/community-messenger/call-session-navigation-seed";
import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";

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
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const p = readOutgoingDialParamsFromLocation();
    if (!p.roomId && !p.peerUserId) {
      setError("방 정보가 없어 통화를 시작할 수 없습니다.");
      return;
    }
    const href = buildCommunityMessengerInstantOutgoingCallHref({
      kind: p.kind,
      roomId: p.roomId || undefined,
      peerUserId: p.peerUserId || undefined,
      peerLabel: p.peerLabelRaw || undefined,
    });
    router.replace(href);
  }, [router]);

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
          돌아가기
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
      <p className="mt-6 text-center sam-text-body text-white/90">통화 화면으로 이동 중…</p>
    </div>
  );
}
