"use client";

import { GlobalCallVideoPipHost } from "@/components/layout/providers/GlobalCallVideoPipHost";

/** 1:1 영상 PIP placeholder — fullscreen CallScreen이 SSOT */
export function CommunityMessengerActiveCallHost() {
  return <GlobalCallVideoPipHost />;
}

/** @deprecated minimize host sync — CallScreen route only */
export function subscribeCommunityCallHostSync(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  return () => {};
}

/** @deprecated */
export function notifyCommunityCallHostSync(): void {
  /* noop */
}
