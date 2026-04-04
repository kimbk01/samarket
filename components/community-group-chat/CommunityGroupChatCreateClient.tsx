"use client";

import type { ComponentProps } from "react";
import { MeetingOpenChatCreateClient } from "@/components/meeting-open-chat/MeetingOpenChatCreateClient";
import { philifeAppPaths } from "@/lib/philife/paths";

type CreateProps = ComponentProps<typeof MeetingOpenChatCreateClient>;

export function CommunityGroupChatCreateClient(
  props: Omit<CreateProps, "chatApiBasePath" | "chatRouteBasePath">
) {
  const { meetingId, ...rest } = props;
  const enc = encodeURIComponent(meetingId);
  return (
    <MeetingOpenChatCreateClient
      {...rest}
      meetingId={meetingId}
      chatApiBasePath={`/api/community/meetings/${enc}/group-chat`}
      chatRouteBasePath={philifeAppPaths.meetingGroupChat(meetingId)}
    />
  );
}
