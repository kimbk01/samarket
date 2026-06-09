"use client";

import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

export type CommunityMessengerCallRuntimeHandle = {
  sessionId: string;
  session: CommunityMessengerCallSession | null;
  /** Agora leave·트랙 stop·톤 정지 */
  cleanupMedia: () => Promise<void>;
  /** active/ringing 세션 best-effort 종료 */
  patchTerminalBestEffort: (reason: "logout" | "account_switch") => Promise<void>;
};

let activeHandle: CommunityMessengerCallRuntimeHandle | null = null;

export function registerCommunityMessengerCallRuntime(handle: CommunityMessengerCallRuntimeHandle): () => void {
  activeHandle = handle;
  return () => {
    if (activeHandle === handle) activeHandle = null;
  };
}

export function getCommunityMessengerCallRuntime(): CommunityMessengerCallRuntimeHandle | null {
  return activeHandle;
}
