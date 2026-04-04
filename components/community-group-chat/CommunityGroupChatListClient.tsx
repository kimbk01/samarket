"use client";

import type { ComponentProps } from "react";
import { MeetingOpenChatListClient } from "@/components/meeting-open-chat/MeetingOpenChatListClient";
import { philifeAppPaths } from "@/lib/philife/paths";

type ListProps = ComponentProps<typeof MeetingOpenChatListClient>;

/** `group-chat` API·앱 경로로 `MeetingOpenChatListClient`를 씁니다. */
export function CommunityGroupChatListClient(props: Omit<ListProps, "chatApiBasePath" | "chatRouteBasePath">) {
  const { meetingId, ...rest } = props;
  const enc = encodeURIComponent(meetingId);
  return (
    <MeetingOpenChatListClient
      {...rest}
      meetingId={meetingId}
      chatApiBasePath={`/api/community/meetings/${enc}/group-chat`}
      chatRouteBasePath={philifeAppPaths.meetingGroupChat(meetingId)}
    />
  );
}
