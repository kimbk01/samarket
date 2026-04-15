"use client";

import type { ReactNode } from "react";
import { CommunityMessengerGroupCallContext } from "@/lib/community-messenger/room/community-messenger-group-call-context";
import { useCommunityMessengerGroupCall } from "@/lib/community-messenger/use-community-messenger-group-call";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

export type CommunityMessengerGroupCallBridgeDeps = {
  enabled: boolean;
  roomId: string;
  viewerUserId: string;
  roomLabel: string;
  activeCall: CommunityMessengerCallSession | null;
  onRefresh: () => void | Promise<void>;
};

export function CommunityMessengerGroupCallProviderBridge({
  children,
  ...deps
}: CommunityMessengerGroupCallBridgeDeps & { children: ReactNode }) {
  const value = useCommunityMessengerGroupCall(deps);
  return (
    <CommunityMessengerGroupCallContext.Provider value={value}>{children}</CommunityMessengerGroupCallContext.Provider>
  );
}
