"use client";

import { useEffect, useRef } from "react";
import { runCommunityMessengerEntryMediaPreflight } from "@/lib/community-messenger/media-preflight";
import { ensureCommunityMessengerAppAudioContext } from "@/lib/community-messenger/cm-app-audio-context";
import { warmMessengerIceServers } from "@/lib/call/ice-servers";
import {
  cancelScheduledWhenBrowserIdle,
  isConstrainedNetwork,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";

/**
 * `/community-messenger/*` 진입 시 call_media store check-only — 장치 ID 갱신만 수행.
 * 권한 요청·GUM 프라임은 DiBaYCallMediaOnboardingGate 전용.
 */
const SESSION_PREFLIGHT_OK_KEY = "cm_messenger_entry_media_preflight_ok_v1";

export function CommunityMessengerMediaPreflight() {
  const attemptedRef = useRef(false);
  const callChunkWarmupIdleRef = useRef<number>(-1);

  useEffect(() => {
    if (typeof window === "undefined") return;
    void ensureCommunityMessengerAppAudioContext();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || attemptedRef.current) return;
    try {
      if (window.sessionStorage.getItem(SESSION_PREFLIGHT_OK_KEY) === "1") return;
    } catch {
      /* private mode */
    }
    attemptedRef.current = true;

    const t = window.setTimeout(() => {
      void runCommunityMessengerEntryMediaPreflight().then((r) => {
        if (!r.ok) return;
        try {
          window.sessionStorage.setItem(SESSION_PREFLIGHT_OK_KEY, "1");
        } catch {
          /* ignore */
        }
      });
    }, 0);

    return () => {
      window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isConstrainedNetwork()) return;
    callChunkWarmupIdleRef.current = scheduleWhenBrowserIdle(() => {
      warmMessengerIceServers();
    }, 900);
    return () => {
      cancelScheduledWhenBrowserIdle(callChunkWarmupIdleRef.current);
    };
  }, []);

  return null;
}
