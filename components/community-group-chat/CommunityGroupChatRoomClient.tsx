"use client";

import type { ComponentProps } from "react";
import { MeetingOpenChatRoomClient } from "@/components/meeting-open-chat/MeetingOpenChatRoomClient";
import { philifeAppPaths } from "@/lib/philife/paths";

type RoomProps = ComponentProps<typeof MeetingOpenChatRoomClient>;

/** `group-chat` API·앱 경로로 `MeetingOpenChatRoomClient`를 씁니다. */
export function CommunityGroupChatRoomClient(props: Omit<RoomProps, "chatApiBasePath" | "chatRouteBasePath">) {
  const { meetingId, ...rest } = props;
  const enc = encodeURIComponent(meetingId);
  return (
    <MeetingOpenChatRoomClient
      {...rest}
      meetingId={meetingId}
      chatApiBasePath={`/api/community/meetings/${enc}/group-chat`}
      chatRouteBasePath={philifeAppPaths.meetingGroupChat(meetingId)}
    />
  );
}
