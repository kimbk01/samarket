"use client";

import { createContext, useContext } from "react";
import type { CommunityMessengerGroupCallHandle } from "@/lib/community-messenger/use-community-messenger-group-call";

const noopAsync = async () => {};
const remoteVideoNoop: CommunityMessengerGroupCallHandle["bindRemoteVideo"] = () => {};

/** 1:1 대화방 — 그룹 통화 훅을 마운트하지 않을 때 컨텍스트 기본값 (카카오톡식: 그룹 기능 그래프 미로드) */
export const DIRECT_ROOM_GROUP_CALL_STUB: CommunityMessengerGroupCallHandle = {
  panel: null,
  busy: null,
  errorMessage: null,
  elapsedSeconds: 0,
  localStream: null,
  localVideoRef: { current: null },
  remotePeers: [],
  bindRemoteVideo: remoteVideoNoop,
  callStatusLabel: "",
  connectionBadge: null,
  participants: [],
  prepareDevices: noopAsync,
  dismissPanel: noopAsync,
  startOutgoingCall: noopAsync,
  acceptIncomingCall: async () => false,
  rejectIncomingCall: noopAsync,
  cancelOutgoingCall: noopAsync,
  endActiveCall: noopAsync,
  retryConnection: noopAsync,
};

export const CommunityMessengerGroupCallContext = createContext<CommunityMessengerGroupCallHandle>(
  DIRECT_ROOM_GROUP_CALL_STUB
);

export function useCommunityMessengerRoomGroupCall(): CommunityMessengerGroupCallHandle {
  return useContext(CommunityMessengerGroupCallContext);
}
