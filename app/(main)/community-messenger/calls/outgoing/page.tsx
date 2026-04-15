"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CallScreen } from "@/components/messenger/call/CallScreen";
import type { CallScreenViewModel } from "@/components/messenger/call/call-ui.types";
import { bootstrapCommunityMessengerOutgoingCallAndNavigate } from "@/lib/community-messenger/call-session-navigation-seed";
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
 * 1:1 outgoing dial: avoid useSearchParams Suspense; parse location in layout for first paint.
 * Session POST runs in useEffect (async).
 */
export default function CommunityMessengerOutgoingDialPage() {
  const router = useRouter();
  const [dial, setDial] = useState<OutgoingDialParams | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bootStartedRef = useRef(false);

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
    if (!dial) return;
    if (!dial.roomId && !dial.peerUserId) {
      setError("\uBC29 \uC815\uBCF4\uAC00 \uC5C6\uC5B4 \uD1B5\uD654\uB97C \uC2DC\uC791\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }
    if (bootStartedRef.current) return;
    bootStartedRef.current = true;

    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    logClientPerf("messenger-call.outgoing.bootstrap", { phase: "start", ...dial });

    const ac = new AbortController();
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
        if (ac.signal.aborted) return;
        const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
        logClientPerf("messenger-call.outgoing.bootstrap", {
          phase: result.ok ? "ok" : "fail",
          ms: Math.round(t1 - t0),
        });
        if (!result.ok) {
          setError(result.userMessage);
          return;
        }
        logClientPerf("messenger-call.outgoing.navigate", {
          phase: "replace_session",
          sessionId: result.session.id,
        });
      } catch (e) {
        if (ac.signal.aborted) return;
        const name = typeof e === "object" && e && "name" in e ? String((e as { name?: unknown }).name) : "";
        setError(
          name === "AbortError"
            ? "\uD1B5\uD654 \uC900\uBE44\uAC00 \uC911\uB2E8\uB418\uC5C8\uC2B5\uB2C8\uB2E4."
            : "\uB124\uD2B8\uC6CC\uD06C \uC624\uB958\uB85C \uD1B5\uD654\uB97C \uC2DC\uC791\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4."
        );
      }
    })();

    return () => {
      ac.abort();
      bootStartedRef.current = false;
    };
  }, [dial, router]);

  const displayName = dial?.peerLabelRaw || "\uC0C1\uB300\uBC29";
  const kindLabel = dial?.kind === "video" ? "\uC601\uC0C1 \uD1B5\uD654" : "\uC74C\uC131 \uD1B5\uD654";

  const outgoingVm: CallScreenViewModel = {
    mode: dial?.kind === "video" ? "video" : "voice",
    direction: "outgoing",
    phase: "ringing",
    peerLabel: dial ? displayName : "…",
    peerAvatarUrl: null,
    statusText: "Ringing...",
    subStatusText: "세션을 준비하는 동안 전체 화면 통화 UI로 전환 중입니다.",
    topLabel: dial?.kind === "video" ? kindLabel : null,
    onTopLabelClick: null,
    footerNote: "실제 통화 시간은 상대가 받고 연결된 뒤부터 시작됩니다.",
    mediaState: {
      micEnabled: true,
      speakerEnabled: dial?.kind === "video",
      cameraEnabled: dial?.kind === "video",
      localVideoMinimized: true,
    },
    onBack: null,
    primaryActions: [
      {
        id: "speaker",
        label: "스피커",
        icon: "speaker",
        active: dial?.kind === "video",
        disabled: true,
        onClick: () => {},
      },
      {
        id: "video",
        label: dial?.kind === "video" ? "카메라" : "영상 전환",
        icon: dial?.kind === "video" ? "camera" : "video",
        active: dial?.kind === "video",
        disabled: true,
        onClick: () => {},
      },
      {
        id: "mute",
        label: "음소거",
        icon: "mic",
        active: false,
        disabled: true,
        onClick: () => {},
      },
      {
        id: "end",
        label: "종료",
        icon: "end",
        tone: "danger",
        onClick: () => router.back(),
      },
    ],
  };

  if (error) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[linear-gradient(180deg,#7b63ef_0%,#4a56d4_58%,#3a72d4_100%)] px-6 text-center">
        <p className="text-[15px] text-white/95">{error}</p>
        <button
          type="button"
          className="mt-6 rounded-ui-rect bg-white/15 px-5 py-2.5 text-[14px] font-medium text-white"
          onClick={() => router.back()}
        >
          {"\uB3CC\uC544\uAC00\uAE30"}
        </button>
      </div>
    );
  }

  return <CallScreen vm={outgoingVm} variant="page" />;
}
