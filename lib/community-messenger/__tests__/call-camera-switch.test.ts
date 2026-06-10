import { describe, expect, it, vi } from "vitest";

const listCommunityMessengerCameras = vi.fn();

vi.mock("agora-rtc-sdk-ng", () => ({
  default: {
    createCameraVideoTrack: vi.fn(),
  },
}));

vi.mock("@/lib/community-messenger/call-provider/client", () => ({
  listCommunityMessengerCameras: (...args: unknown[]) => listCommunityMessengerCameras(...args),
}));

vi.mock("@/lib/community-messenger/media-preflight", () => ({
  readPreferredCommunityMessengerDeviceIds: vi.fn(() => ({
    audioDeviceId: "mic-1",
    videoDeviceId: "cam-1",
  })),
  writePreferredCommunityMessengerDeviceIds: vi.fn(),
}));

import {
  isCommunityMessengerCameraSwitchSupported,
  isCommunityMessengerCameraVideoTrack,
  switchCommunityMessengerCameraFacing,
} from "@/lib/community-messenger/call-camera-switch";

describe("call-camera-switch", () => {
  it("detects camera video tracks with setDevice", () => {
    const track = { setDevice: vi.fn() };
    expect(isCommunityMessengerCameraVideoTrack(track as never)).toBe(true);
    expect(isCommunityMessengerCameraSwitchSupported(track as never)).toBe(true);
  });

  it("toggles facingMode on camera tracks", async () => {
    const setDevice = vi.fn().mockResolvedValue(undefined);
    const track = {
      setDevice,
      getMediaStreamTrack: () => ({ getSettings: () => ({ deviceId: "cam-1" }) }),
    };
    const useRearFacingRef = { current: false };
    const onAfterSwitch = vi.fn();

    const next = await switchCommunityMessengerCameraFacing({
      videoTrack: track as never,
      useRearFacingRef,
      onAfterSwitch,
    });

    expect(next).toBe(track);
    expect(useRearFacingRef.current).toBe(true);
    expect(setDevice).toHaveBeenCalledWith({ facingMode: "environment" });
    expect(onAfterSwitch).toHaveBeenCalled();
  });

  it("falls back to camera device list when facingMode fails", async () => {
    const setDevice = vi
      .fn()
      .mockRejectedValueOnce(new Error("facing"))
      .mockResolvedValueOnce(undefined);
    const track = {
      setDevice,
      getMediaStreamTrack: () => ({ getSettings: () => ({ deviceId: "cam-1" }) }),
    };
    listCommunityMessengerCameras.mockResolvedValue([
      { deviceId: "cam-1" },
      { deviceId: "cam-2" },
    ]);

    await switchCommunityMessengerCameraFacing({
      videoTrack: track as never,
      useRearFacingRef: { current: false },
    });

    expect(setDevice).toHaveBeenLastCalledWith("cam-2");
  });
});
