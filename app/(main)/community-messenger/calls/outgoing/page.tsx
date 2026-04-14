"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CallScreenShell } from "@/components/community-messenger/call-ui/CallScreenShell";
import {
  bootstrapCommunityMessengerOutgoingCallSession,
  primeCommunityMessengerCallNavigationSeed,
} from "@/lib/community-messenger/call-session-navigation-seed";
import { MESSENGER_CALL_GRADIENT_SURFACE } from "@/lib/community-messenger/messenger-call-gradient";

/**
 * 1:1 발신 — 클릭 직후 이 경로로 들어와 calling UI 를 먼저 그린 뒤, 백그라운드에서 세션을 만든다.
 */
function OutgoingCallDialContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = searchParams.get("roomId")?.trim() ?? "";
  const peerUserId = searchParams.get("peerUserId")?.trim() ?? "";
  const peerLabelRaw = searchParams.get("peerLabel")?.trim() ?? "";
  const kind = searchParams.get("kind") === "video" ? "video" : "voice";
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId && !peerUserId) {
      setError("방 정보가 없어 통화를 시작할 수 없습니다.");
      return;
    }

    const ac = new AbortController();
    void (async () => {
      try {
        const result = await bootstrapCommunityMessengerOutgoingCallSession({
          signal: ac.signal,
          roomId: roomId || null,
          peerUserId: peerUserId || null,
          kind,
        });
        if (ac.signal.aborted) return;
        if (!result.ok) {
          setError(result.userMessage);
          return;
        }
        primeCommunityMessengerCallNavigationSeed(result.session.id, result.session);
        router.replace(`/community-messenger/calls/${encodeURIComponent(result.session.id)}`);
      } catch (e) {
        if (ac.signal.aborted) return;
        const name = typeof e === "object" && e && "name" in e ? String((e as { name?: unknown }).name) : "";
        setError(name === "AbortError" ? "통화 준비가 중단되었습니다." : "네트워크 오류로 통화를 시작하지 못했습니다.");
      }
    })();

    return () => {
      ac.abort();
    };
  }, [roomId, peerUserId, kind, router]);

  const displayName = peerLabelRaw || "상대방";
  const kindLabel = kind === "video" ? "영상 통화" : "음성 통화";

  if (error) {
    return (
      <CallScreenShell variant="page" className={`${MESSENGER_CALL_GRADIENT_SURFACE} bg-sam-app`}>
        <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
          <p className="text-[15px] text-white/95">{error}</p>
          <button
            type="button"
            className="mt-6 rounded-ui-rect bg-white/15 px-5 py-2.5 text-[14px] font-medium text-white"
            onClick={() => router.back()}
          >
            돌아가기
          </button>
        </div>
      </CallScreenShell>
    );
  }

  return (
    <CallScreenShell variant="page" className={`${MESSENGER_CALL_GRADIENT_SURFACE} bg-sam-app`}>
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
        <p className="text-[22px] font-semibold text-white">{displayName}</p>
        <p className="mt-2 text-[14px] text-white/75">{kindLabel}</p>
        <p className="mt-8 text-[15px] text-white/90">발신 중…</p>
        <p className="mt-2 text-[13px] text-white/60">연결을 준비하고 있습니다</p>
      </div>
    </CallScreenShell>
  );
}

export default function CommunityMessengerOutgoingDialPage() {
  return (
    <Suspense
      fallback={
        <CallScreenShell variant="page" className={`${MESSENGER_CALL_GRADIENT_SURFACE} bg-sam-app`}>
          <div className="flex min-h-[100dvh] flex-col items-center justify-center">
            <p className="text-[15px] text-white/80">불러오는 중…</p>
          </div>
        </CallScreenShell>
      }
    >
      <OutgoingCallDialContent />
    </Suspense>
  );
}
