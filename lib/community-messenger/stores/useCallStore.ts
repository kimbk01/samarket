import { create } from "zustand";

/** 음성/영상 — UI·세션과 동일 어휘 */
export type MessengerCallKind = "voice" | "video";

/**
 * 통화 UI 단계. 서버 `CommunityMessengerCallSessionStatus` 와 1:1은 아니며,
 * 클라이언트에서 발신/수신/협상 과정까지 포함한 상위 상태.
 */
export type MessengerCallStatus =
  | "idle"
  | "incoming"
  | "outgoing"
  | "connecting"
  | "ringing"
  | "active"
  | "ended"
  | "missed"
  | "declined"
  | "canceled"
  | "failed"
  | "minimized";

export type MessengerCallPeer = {
  id: string;
  name: string;
  avatarUrl: string | null;
  roomId: string;
};

type CallState = {
  callType: MessengerCallKind;
  callStatus: MessengerCallStatus;
  sessionId: string | null;
  peer: MessengerCallPeer | null;
  startedAt: string | null;
  endedAt: string | null;
  isMuted: boolean;
  isSpeakerOn: boolean;
  isVideoEnabled: boolean;
  isLocalPreviewMinimized: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  errorMessage: string | null;

  openIncomingCall: (args: {
    sessionId: string;
    callType: MessengerCallKind;
    peer: MessengerCallPeer;
  }) => void;
  startOutgoingCall: (args: { sessionId: string; callType: MessengerCallKind; peer: MessengerCallPeer }) => void;
  setConnecting: () => void;
  setRinging: () => void;
  /** 미디어 연결 완료 → 통화 중 */
  markActive: (startedAtIso?: string) => void;
  acceptCall: () => void;
  declineCall: () => void;
  cancelCall: () => void;
  endCall: () => void;
  failCall: (message: string) => void;
  minimizeCall: () => void;
  restoreCall: () => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  toggleVideo: () => void;
  toggleLocalPreviewMinimized: () => void;
  resetCall: () => void;
};

const initialMedia = {
  localStream: null as MediaStream | null,
  remoteStream: null as MediaStream | null,
  isMuted: false,
  isSpeakerOn: true,
  isVideoEnabled: true,
  isLocalPreviewMinimized: false,
  startedAt: null as string | null,
  endedAt: null as string | null,
  errorMessage: null as string | null,
};

export const useCallStore = create<CallState>((set, get) => ({
  callType: "voice",
  callStatus: "idle",
  sessionId: null,
  peer: null,
  ...initialMedia,

  openIncomingCall: ({ sessionId, callType, peer }) =>
    set({
      sessionId,
      callType,
      peer,
      callStatus: "incoming",
      errorMessage: null,
    }),

  startOutgoingCall: ({ sessionId, callType, peer }) =>
    set({
      sessionId,
      callType,
      peer,
      callStatus: "outgoing",
      errorMessage: null,
    }),

  setConnecting: () => set({ callStatus: "connecting" }),

  setRinging: () => set({ callStatus: "ringing" }),

  markActive: (startedAtIso) =>
    set({
      callStatus: "active",
      startedAt: startedAtIso ?? new Date().toISOString(),
    }),

  acceptCall: () => set({ callStatus: "connecting" }),

  declineCall: () =>
    set({
      callStatus: "declined",
      endedAt: new Date().toISOString(),
    }),

  cancelCall: () =>
    set({
      callStatus: "canceled",
      endedAt: new Date().toISOString(),
    }),

  endCall: () =>
    set({
      callStatus: "ended",
      endedAt: new Date().toISOString(),
    }),

  failCall: (message) =>
    set({
      callStatus: "failed",
      errorMessage: message,
      endedAt: new Date().toISOString(),
    }),

  minimizeCall: () => set({ callStatus: "minimized" }),

  restoreCall: () => {
    const { callStatus } = get();
    if (callStatus === "minimized") set({ callStatus: "active" });
  },

  setLocalStream: (localStream) => set({ localStream }),
  setRemoteStream: (remoteStream) => set({ remoteStream }),

  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  toggleSpeaker: () => set((s) => ({ isSpeakerOn: !s.isSpeakerOn })),
  toggleVideo: () => set((s) => ({ isVideoEnabled: !s.isVideoEnabled })),
  toggleLocalPreviewMinimized: () => set((s) => ({ isLocalPreviewMinimized: !s.isLocalPreviewMinimized })),

  resetCall: () =>
    set({
      callType: "voice",
      callStatus: "idle",
      sessionId: null,
      peer: null,
      ...initialMedia,
    }),
}));
