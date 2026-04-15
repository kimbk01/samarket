"use client";

import { useEffect, useRef } from "react";
import { markCommunityMessengerMediaTrustedOnce } from "@/lib/community-messenger/call-permission";
import { runCommunityMessengerEntryMediaPreflight } from "@/lib/community-messenger/media-preflight";
import { warmMessengerIceServers } from "@/lib/call/ice-servers";
import {
  cancelScheduledWhenBrowserIdle,
  isConstrainedNetwork,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";

/**
 * `/community-messenger/*` 진입 시 마이크·카메라 권한을 한 번에 확보하고 장치 ID를 저장한다.
 * 브라우저 정책상 첫 프롬프트가 막히면 첫 터치/클릭 후 1회 재시도한다.
 */
export function CommunityMessengerMediaPreflight() {
  const attemptedRef = useRef(false);
  const callChunkWarmupIdleRef = useRef<number>(-1);

  useEffect(() => {
    if (typeof window === "undefined" || attemptedRef.current) return;
    attemptedRef.current = true;

    let retry: (() => void) | null = null;
    const run = async (allowPrompt: boolean) => {
      const r = await runCommunityMessengerEntryMediaPreflight({ allowPermissionPrompt: allowPrompt });
      if (r.ok) {
        markCommunityMessengerMediaTrustedOnce();
        return;
      }
      if (r.code === "gum_failed" && !allowPrompt) {
        retry = () => {
          void runCommunityMessengerEntryMediaPreflight({ allowPermissionPrompt: true }).then((r2) => {
            if (r2.ok) markCommunityMessengerMediaTrustedOnce();
          });
          window.removeEventListener("pointerdown", retry!, true);
          retry = null;
        };
        window.addEventListener("pointerdown", retry, { capture: true, passive: true });
      }
    };

    const t = window.setTimeout(() => {
      void run(false);
    }, 0);

    return () => {
      window.clearTimeout(t);
      if (retry) window.removeEventListener("pointerdown", retry, true);
    };
  }, []);

  /** 유휴 시 통화 화면 청크(Agora 등)를 미리 받아 두어 진입 체감 지연을 줄인다. 절약 모드·느린 망에서는 생략 */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isConstrainedNetwork()) return;
    callChunkWarmupIdleRef.current = scheduleWhenBrowserIdle(() => {
      warmMessengerIceServers();
      /**
       * NOTE: 메신저 진입 직후 통화 화면(`CommunityMessengerCallClient`) 번들 워밍업은
       * 홈/룸 JS를 무겁게 만들어 “메신저가 느리다” 체감을 키운다.
       *
       * 통화 진입의 즉시성은 "진짜 CTA 클릭"에서 prefetch/seed로 해결하고,
       * 여기서는 ICE 서버 워밍만 유지한다.
       *
       * (비보안 출처 이슈로 인한 dev 오버레이도 예방)
       */
    }, 900);
    return () => {
      cancelScheduledWhenBrowserIdle(callChunkWarmupIdleRef.current);
    };
  }, []);

  return null;
}
