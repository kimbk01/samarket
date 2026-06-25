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
