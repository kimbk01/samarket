"use client";

import { CallInAppNoticeBanner } from "@/components/messenger/call/CallInAppNoticeBanner";

/** Layout host — single visible Call in-app notice (MAX=1 via store priority). */
export function CallInAppNoticeHost() {
  return <CallInAppNoticeBanner />;
}
