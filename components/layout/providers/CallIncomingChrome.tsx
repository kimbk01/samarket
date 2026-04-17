"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { CallProvider } from "@/app/_providers/CallProvider";
import { resolveSuppressIncomingCallOverlay } from "@/lib/layout/conditional-app-shell-flags";

const IncomingCallOverlay = dynamic(
  () =>
    import("@/components/community-messenger/IncomingCallOverlay").then((mod) => mod.IncomingCallOverlay),
  { ssr: false }
);

/**
 * 수신 통화 오버레이만 `CallProvider`(CommunityCallSurface) 안에 둔다.
 * `useCommunityCallSurface` 소비처는 현재 수신 통화 UI뿐이라 전역 트리에서 분리해도 동일.
 */
export function CallIncomingChrome() {
  const pathname = usePathname();
  if (resolveSuppressIncomingCallOverlay(pathname)) {
    return null;
  }

  return (
    <CallProvider>
      <IncomingCallOverlay />
    </CallProvider>
  );
}
