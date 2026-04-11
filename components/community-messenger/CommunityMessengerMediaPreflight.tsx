"use client";

import { useEffect, useRef } from "react";
import { runCommunityMessengerEntryMediaPreflight } from "@/lib/community-messenger/media-preflight";

/**
 * `/community-messenger/*` 진입 시 마이크·카메라 권한을 한 번에 확보하고 장치 ID를 저장한다.
 * 브라우저 정책상 첫 프롬프트가 막히면 첫 터치/클릭 후 1회 재시도한다.
 */
export function CommunityMessengerMediaPreflight() {
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || attemptedRef.current) return;
    attemptedRef.current = true;

    let retry: (() => void) | null = null;
    const run = async () => {
      const r = await runCommunityMessengerEntryMediaPreflight();
      if (r.ok) return;
      if (r.code === "gum_failed") {
        retry = () => {
          void runCommunityMessengerEntryMediaPreflight();
          window.removeEventListener("pointerdown", retry!, true);
          retry = null;
        };
        window.addEventListener("pointerdown", retry, { capture: true, passive: true });
      }
    };

    const t = window.setTimeout(() => {
      void run();
    }, 0);

    return () => {
      window.clearTimeout(t);
      if (retry) window.removeEventListener("pointerdown", retry, true);
    };
  }, []);

  return null;
}
