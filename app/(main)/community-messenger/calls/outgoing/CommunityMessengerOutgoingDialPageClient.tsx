"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { bootstrapCommunityMessengerOutgoingCallAndNavigate } from "@/lib/community-messenger/call-session-navigation-seed";
import { messengerMonitorCallFlowPhase } from "@/lib/community-messenger/monitoring/client";
import { logClientPerf } from "@/lib/performance/samarket-perf";

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
 * 딥링크·북마크용 `/calls/outgoing` — 앱 내 발신은 `startOutgoingCallSessionAndOpen` 으로 이 경로를 거치지 않는다.
 * 중간에 CallScreen(전화 거는 중)을 그리면 `/calls/:id` 진입 시 화면이 겹쳐 보이므로, 여기서는 최소 로딩만 표시한다.
 */
export function CommunityMessengerOutgoingDialPageClient() {
  const router = useRouter();
  const [dial, setDial] = useState<OutgoingDialParams | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useLayoutEffect(() => {
    const p = readOutgoingDialParamsFromLocation();
    setDial(p);
    logClientPerf("messenger-call.outgoing.shell", {
      phase: "layout_params",
      roomId: p.roomId || null,
      hasPeerUserId: Boolean(p.peerUserId),
      kind: p.kind,
    });
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    if (!dial) return;
    if (!dial.roomId && !dial.peerUserId) {
      setError("방 정보가 없어 통화를 시작할 수 없습니다.");
      return;
    }

    const ac = new AbortController();
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    logClientPerf("messenger-call.outgoing.bootstrap", { phase: "start", ...dial });

    void (async () => {
      try {
        const result = await bootstrapCommunityMessengerOutgoingCallAndNavigate(
          {
            signal: ac.signal,
            roomId: dial.roomId || null,
            peerUserId: dial.peerUserId || null,
            kind: dial.kind,
          },
          (href) => router.replace(href)
        );
        if (cancelledRef.current || ac.signal.aborted) return;
        const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
        logClientPerf("messenger-call.outgoing.bootstrap", {
          phase: result.ok ? "ok" : "fail",
          ms: Math.round(t1 - t0),
        });
        if (!result.ok) {
          setError(result.userMessage);
          return;
        }
        messengerMonitorCallFlowPhase(result.session.id, "flow_call_outgoing_bootstrap", Math.round(t1 - t0), {
          media: dial.kind,
          role: "initiator",
        });
        logClientPerf("messenger-call.outgoing.navigate", {
          phase: "replace_session",
          sessionId: result.session.id,
        });
      } catch (e) {
        if (cancelledRef.current || ac.signal.aborted) return;
        const name = typeof e === "object" && e && "name" in e ? String((e as { name?: unknown }).name) : "";
        setError(
          name === "AbortError"
            ? "통화 준비가 중단되었습니다."
            : "네트워크 오류로 통화를 시작하지 못했습니다."
        );
      }
    })();

    return () => {
      cancelledRef.current = true;
      ac.abort();
    };
  }, [dial, router]);

  if (error) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[linear-gradient(180deg,#7b63ef_0%,#4a56d4_58%,#3a72d4_100%)] px-6 text-center">
        <p className="sam-text-body text-white/95">{error}</p>
        <button
          type="button"
          className="mt-6 rounded-ui-rect bg-white/15 px-5 py-2.5 sam-text-body font-medium text-white"
          onClick={() => router.back()}
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
      <p className="mt-6 text-center sam-text-body text-white/90">통화 준비 중…</p>
    </div>
  );
}
