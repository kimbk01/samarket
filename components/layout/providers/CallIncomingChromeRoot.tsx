"use client";

import dynamic from "next/dynamic";

/**
 * CONTRACT — 통화 수신·FCM·active call chrome 은 SSR 금지.
 * `CallIncomingChrome` 정적 import 시 Agora/browser SDK 가 RSC 번들에 섞일 수 있다.
 */
const CallIncomingChrome = dynamic(
  () =>
    import("@/components/layout/providers/CallIncomingChrome").then((m) => m.CallIncomingChrome),
  { ssr: false }
);

export function CallIncomingChromeRoot() {
  return <CallIncomingChrome />;
}
