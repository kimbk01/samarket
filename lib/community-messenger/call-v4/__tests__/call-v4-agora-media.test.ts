import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCanAttach = vi.fn(() => true);
const mockReadPhase = vi.fn(() => "connected");
const mockGetClient = vi.fn();
const mockGetLocalTracks = vi.fn();
const mockSetLocalTracks = vi.fn();
const mockBindLocalVideoTrack = vi.fn(async () => true);
const mockClearLocalVideoContainer = vi.fn();
const mockSetCameraEnabled = vi.fn();
const mockSetLocalVideoReady = vi.fn();
const mockLogCallV4 = vi.fn();
const mockSwitchCameraFacing = vi.fn();
const mockIsCameraSwitchSupported = vi.fn();

vi.mock("@/lib/community-messenger/call-camera-switch", () => ({
  switchCommunityMessengerCameraFacing: (...args: unknown[]) => mockSwitchCameraFacing(...args),
  isCommunityMessengerCameraSwitchSupported: (...args: unknown[]) => mockIsCameraSwitchSupported(...args),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-connected-media-policy", () => ({
  canAttachCallV4VideoMedia: () => mockCanAttach(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-store", () => ({
  readCallV4Phase: () => mockReadPhase(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-agora", () => ({
  getCallV4AgoraClient: mockGetClient,
  getCallV4AgoraLocalTracks: mockGetLocalTracks,
  getCallV4AgoraRemoteVideoTrack: () => null,
  setCallV4AgoraLocalTracks: mockSetLocalTracks,
  setCallV4AgoraRemoteVideoTrack: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-local-video-pipeline", () => ({
  bindAgoraLocalVideoTrack: mockBindLocalVideoTrack,
  bindAgoraRemoteVideoTrack: vi.fn(async () => true),
  clearLocalVideoContainer: mockClearLocalVideoContainer,
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-media-state", () => ({
  readCallV4MediaState: () => ({
    cameraEnabled: false,
    localVideoReady: false,
    remoteVideoReady: false,
  }),
  useCallV4MediaStore: {
    getState: () => ({
      setCameraEnabled: mockSetCameraEnabled,
      setLocalVideoReady: mockSetLocalVideoReady,
      setRemoteVideoReady: vi.fn(),
      setMicEnabled: vi.fn(),
    }),
  },
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-debug", () => ({
  logCallV4: mockLogCallV4,
}));

describe("call-v4-agora-media publish toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAttach.mockReturnValue(true);
    mockReadPhase.mockReturnValue("connected");
  });

  it("re-publishes existing local track after unpublish", async () => {
    const callId = "call-republish";
    const client = {
      publish: vi.fn(async () => undefined),
      unpublish: vi.fn(async () => undefined),
    };
    const videoTrack = {
      enabled: true,
      setEnabled: vi.fn(async (enabled: boolean) => {
        videoTrack.enabled = enabled;
      }),
    };
    mockGetClient.mockReturnValue(client);
    mockGetLocalTracks.mockReturnValue({ audioTrack: {}, videoTrack });

    const { publishCallV4LocalVideo, unpublishCallV4LocalVideo } = await import(
      "@/lib/community-messenger/call-v4/call-v4-agora-media"
    );

    await unpublishCallV4LocalVideo(callId, null);
    const ok = await publishCallV4LocalVideo(callId, null);

    expect(ok).toBe(true);
    expect(videoTrack.setEnabled).toHaveBeenCalledWith(false);
    expect(videoTrack.setEnabled).toHaveBeenCalledWith(true);
    expect(client.publish).toHaveBeenCalledTimes(1);
    expect(mockSetCameraEnabled).toHaveBeenCalledWith(true);
    expect(mockSetLocalVideoReady).toHaveBeenCalledWith(true);
    expect(mockLogCallV4).toHaveBeenCalledWith("local_video_publish_start", { callId });
    expect(mockLogCallV4).toHaveBeenCalledWith("local_video_republish_existing_track", { callId });
    expect(mockLogCallV4).toHaveBeenCalledWith("local_video_publish_done", { callId });
  });

  it("does not duplicate publish when track is already enabled and not unpublished", async () => {
    const callId = "call-already-published";
    const client = {
      publish: vi.fn(async () => undefined),
      unpublish: vi.fn(async () => undefined),
    };
    const videoTrack = {
      enabled: true,
      setEnabled: vi.fn(async () => undefined),
    };
    mockGetClient.mockReturnValue(client);
    mockGetLocalTracks.mockReturnValue({ audioTrack: {}, videoTrack });

    const { publishCallV4LocalVideo } = await import("@/lib/community-messenger/call-v4/call-v4-agora-media");
    const ok = await publishCallV4LocalVideo(callId, null);

    expect(ok).toBe(true);
    expect(videoTrack.setEnabled).not.toHaveBeenCalled();
    expect(client.publish).not.toHaveBeenCalled();
    expect(mockLogCallV4).toHaveBeenCalledWith("local_video_publish_start", { callId });
    expect(mockLogCallV4).not.toHaveBeenCalledWith("local_video_republish_existing_track", { callId });
    expect(mockLogCallV4).toHaveBeenCalledWith("local_video_publish_done", { callId });
  });

  it("logs publish failure when existing-track re-publish fails", async () => {
    const callId = "call-republish-fail";
    const client = {
      publish: vi.fn(async () => undefined),
      unpublish: vi.fn(async () => undefined),
    };
    const videoTrack = {
      enabled: true,
      setEnabled: vi.fn(async () => undefined),
    };
    mockGetClient.mockReturnValue(client);
    mockGetLocalTracks.mockReturnValue({ audioTrack: {}, videoTrack });

    const { publishCallV4LocalVideo, unpublishCallV4LocalVideo } = await import(
      "@/lib/community-messenger/call-v4/call-v4-agora-media"
    );
    await unpublishCallV4LocalVideo(callId, null);
    client.publish.mockRejectedValueOnce(new Error("publish failed"));

    const ok = await publishCallV4LocalVideo(callId, null);
    expect(ok).toBe(false);
    expect(mockLogCallV4).toHaveBeenCalledWith("local_video_publish_failed", { callId });
  });
});

describe("call-v4-agora-media camera switch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAttach.mockReturnValue(true);
    mockReadPhase.mockReturnValue("connected");
    mockIsCameraSwitchSupported.mockImplementation((track: unknown) => Boolean(track));
    mockSwitchCameraFacing.mockImplementation(
      async (args: { videoTrack: unknown; onAfterSwitch?: () => void | Promise<void> }) => {
        await args.onAfterSwitch?.();
        return args.videoTrack;
      },
    );
  });

  it("delegates to legacy switchCommunityMessengerCameraFacing when track exists", async () => {
    const callId = "call-flip";
    const client = { publish: vi.fn(), unpublish: vi.fn() };
    const videoTrack = { enabled: true, setDevice: vi.fn() };
    const container = {} as HTMLElement;
    mockGetClient.mockReturnValue(client);
    mockGetLocalTracks.mockReturnValue({ audioTrack: {}, videoTrack });

    const { switchCallV4CameraFacing } = await import("@/lib/community-messenger/call-v4/call-v4-agora-media");
    const ok = await switchCallV4CameraFacing(callId, container);

    expect(ok).toBe(true);
    expect(mockSwitchCameraFacing).toHaveBeenCalledTimes(1);
    expect(mockSwitchCameraFacing).toHaveBeenCalledWith(
      expect.objectContaining({
        videoTrack,
        client,
        useRearFacingRef: expect.objectContaining({ current: expect.any(Boolean) }),
      }),
    );
    expect(mockBindLocalVideoTrack).toHaveBeenCalledWith(videoTrack, container, {
      fit: "cover",
      mirror: true,
    });
    expect(mockLogCallV4).toHaveBeenCalledWith("camera_switch_start", { callId });
    expect(mockLogCallV4).toHaveBeenCalledWith("camera_switch_done", { callId });
  });

  it("returns false without calling legacy switch when track is missing", async () => {
    mockGetClient.mockReturnValue({ publish: vi.fn(), unpublish: vi.fn() });
    mockGetLocalTracks.mockReturnValue({ audioTrack: {} });
    mockIsCameraSwitchSupported.mockReturnValue(false);

    const { switchCallV4CameraFacing } = await import("@/lib/community-messenger/call-v4/call-v4-agora-media");
    const ok = await switchCallV4CameraFacing("call-no-track", null);

    expect(ok).toBe(false);
    expect(mockSwitchCameraFacing).not.toHaveBeenCalled();
  });

  it("reports availability from legacy isCommunityMessengerCameraSwitchSupported", async () => {
    const videoTrack = { enabled: true };
    mockGetLocalTracks.mockReturnValue({ audioTrack: {}, videoTrack });
    mockIsCameraSwitchSupported.mockReturnValue(true);

    const { isCallV4CameraSwitchAvailable } = await import("@/lib/community-messenger/call-v4/call-v4-agora-media");
    expect(isCallV4CameraSwitchAvailable("call-available")).toBe(true);
    expect(mockIsCameraSwitchSupported).toHaveBeenCalledWith(videoTrack);
  });
});
