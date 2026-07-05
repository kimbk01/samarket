import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import type { CallPermissionCheckResult } from "@/lib/call/permissions/call-permission-types";

const gateCheckMock = vi.hoisted(() =>
  vi.fn<(kind: CommunityMessengerCallKind) => Promise<CallPermissionCheckResult>>()
);

function buildCheck(overrides: Partial<CallPermissionCheckResult> = {}): CallPermissionCheckResult {
  return {
    storeState: "unknown",
    os: { microphone: "granted", camera: "granted" },
    effectiveState: "granted_audio_video",
    microphoneGranted: true,
    cameraGranted: true,
    canVoice: true,
    canVideo: true,
    canFallbackToVoice: false,
    isPermanentlyDenied: false,
    ...overrides,
  };
}

vi.mock("@/lib/call/permissions/call-permission-gate", () => ({
  callPermissionGate: {
    check: gateCheckMock,
    prompt: vi.fn(),
    requireForOutgoing: vi.fn(),
    requireForIncoming: vi.fn(),
  },
}));

describe("call-media-permission-preflight", () => {
  beforeEach(() => {
    vi.resetModules();
    gateCheckMock.mockReset();
    gateCheckMock.mockResolvedValue(buildCheck());
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(),
      },
    });
  });

  it("allows video when camera and microphone are granted without requesting media", async () => {
    const { ensureCallCanUseMedia } = await import("@/lib/community-messenger/call-media-permission-preflight");
    const result = await ensureCallCanUseMedia("video");
    expect(result.ok).toBe(true);
    expect(gateCheckMock).toHaveBeenCalledWith("video");
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("blocks voice before media creation when microphone is denied", async () => {
    gateCheckMock.mockResolvedValue(
      buildCheck({
        os: { microphone: "permanently_denied", camera: "granted" },
        microphoneGranted: false,
        canVoice: false,
        canVideo: false,
        effectiveState: "denied_once",
      })
    );
    const { ensureCallCanUseMedia } = await import("@/lib/community-messenger/call-media-permission-preflight");
    const result = await ensureCallCanUseMedia("voice");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("permission_denied");
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("blocks video when camera is still unknown", async () => {
    gateCheckMock.mockResolvedValue(
      buildCheck({
        os: { microphone: "granted", camera: "unknown" },
        cameraGranted: false,
        canVideo: false,
        effectiveState: "unknown",
      })
    );
    const { ensureCallCanUseMedia } = await import("@/lib/community-messenger/call-media-permission-preflight");
    const result = await ensureCallCanUseMedia("video");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("permission_unknown");
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("delegates concurrent checks to callPermissionGate per kind", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    gateCheckMock.mockImplementation(async (kind: "voice" | "video") => {
      await gate;
      return buildCheck({ canVoice: true, canVideo: kind === "video" });
    });
    const { ensureCallCanUseMedia } = await import("@/lib/community-messenger/call-media-permission-preflight");
    const voice = ensureCallCanUseMedia("voice");
    const video = ensureCallCanUseMedia("video");
    release();
    await Promise.all([voice, video]);
    expect(gateCheckMock).toHaveBeenCalledTimes(2);
    expect(gateCheckMock).toHaveBeenCalledWith("voice");
    expect(gateCheckMock).toHaveBeenCalledWith("video");
  });
});
