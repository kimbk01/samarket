"use client";

import { CallInAppNoticeBanner } from "@/components/messenger/call/CallInAppNoticeBanner";
import { CallInAppNoticeCenterDialog } from "@/components/messenger/call/CallInAppNoticeCenterDialog";
import { useCallInAppNoticeStore } from "@/lib/community-messenger/stores/call-in-app-notice-store";

/**
 * Layout host — single visible Call in-app notice (MAX=1 via store priority).
 * E-C3: CENTER → DibayInfoDialog; BANNER / PERSISTENT_BANNER → top strip.
 * Never mounts both for the same current notice.
 */
export function CallInAppNoticeHost() {
  const presentation = useCallInAppNoticeStore((s) => s.current?.spec.presentation ?? null);
  if (presentation === "CENTER") {
    return <CallInAppNoticeCenterDialog />;
  }
  return <CallInAppNoticeBanner />;
}
