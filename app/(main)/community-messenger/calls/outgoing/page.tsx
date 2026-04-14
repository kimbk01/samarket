"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CallScreenShell } from "@/components/community-messenger/call-ui/CallScreenShell";
import {
  bootstrapCommunityMessengerOutgoingCallSession,
  primeCommunityMessengerCallNavigationSeed,
} from "@/lib/community-messenger/call-session-navigation-seed";
import { MESSENGER_CALL_GRADIENT_SURFACE } from "@/lib/community-messenger/messenger-call-gradient";
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
      setError("방 정보가 없어 통화를 시작할 수 없습니다.");
      return;
    }
    if (bootStartedRef.current) return;
    bootStartedRef.current = true;

    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    logClientPerf("messenger-call.outgoing.bootstrap", { phase: "start", ...dial });

    const ac = new AbortController();
    void (async () => {
      try {
        const result = await bootstrapCommunityMessengerOutgoingCallSession({
          signal: ac.signal,
          roomId: dial.roomId || null,
          peerUserId: dial.peerUserId || null,
          kind: dial.kind,
        });
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
        primeCommunityMessengerCallNavigationSeed(result.session.id, result.session);
        logClientPerf("messenger-call.outgoing.navigate", {
          phase: "replace_session",
          sessionId: result.session.id,
        });
        router.replace(`/community-messenger/calls/${encodeURIComponent(result.session.id)}`);
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

  const displayName = dial?.peerLabelRaw || "상대방";
  const kindLabel = dial?.kind === "video" ? "영상 통화" : "음성 통화";

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
            {"\uB3CC\uC544\uAC00\uAE30"}
          </button>
        </div>
      </CallScreenShell>
    );
  }

  return (
    <CallScreenShell variant="page" className={`${MESSENGER_CALL_GRADIENT_SURFACE} bg-sam-app`}>
      <div className="flex min-h-[100dvh] flex-col justify-between px-6 pb-[max(24px,calc(env(safe-area-inset-bottom)+12px))] pt-[max(24px,calc(env(safe-area-inset-top)+12px))] text-center">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[13px] font-medium text-white/90"
            onClick={() => router.back()}
          >
            취소
          </button>
          <span className="rounded-full bg-white/12 px-3 py-1 text-[11px] font-semibold text-white/85">
            {dial ? kindLabel : "통화"}
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-white/10 text-[44px] font-semibold text-white shadow-[0_0_0_18px_rgba(255,255,255,0.05)]">
            <div className="absolute inset-[-14px] rounded-full border border-white/20 animate-pulse" aria-hidden />
            {(dial ? displayName : "?").trim().slice(0, 1)}
          </div>
          <p className="mt-8 text-[26px] font-semibold tracking-tight text-white">{dial ? displayName : "…"}</p>
          <p className="mt-2 text-[14px] text-white/75">{dial ? kindLabel : "음성 통화"}</p>
          <p className="mt-10 text-[16px] font-medium text-white/92">발신 중…</p>
          <p className="mt-2 text-[13px] text-white/60">연결을 준비하고 있습니다</p>
        </div>
        <div className="flex justify-center">
          <button
            type="button"
            className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-[#e5394a] text-white shadow-[0_12px_40px_rgba(229,57,74,0.45)]"
            onClick={() => router.back()}
            aria-label="통화 취소"
          >
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path
                d="M5.6 9.3c3.7-3.5 9.1-3.5 12.8 0l.7.7-2.5 2.4-.7-.7a6.3 6.3 0 0 0-7.8 0l-.7.7L4.9 10l.7-.7Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </CallScreenShell>
  );
}
