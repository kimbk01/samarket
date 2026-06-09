import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  detachPreJoinHtmlVideo,
  shouldRetainPreJoinPreview,
} from "@/lib/community-messenger/call-local-video-pipeline";

describe("call-local-video-pipeline", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      body: { contains: () => false, appendChild: vi.fn() },
      createElement: (tag: string) => {
        if (tag === "video") {
          return {
            muted: false,
            playsInline: false,
            autoplay: false,
            srcObject: null as MediaStream | null,
            style: {},
            setAttribute: vi.fn(),
            play: vi.fn(() => Promise.resolve()),
            readyState: 4,
            videoWidth: 640,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          };
        }
        return {};
      },
    });
    vi.stubGlobal("window", {
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      },
      clearTimeout: vi.fn(),
      setTimeout: (cb: () => void) => {
        cb();
        return 0;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detachPreJoinHtmlVideo clears srcObject without stopping tracks", () => {
    const stop = vi.fn();
    const track = { kind: "video", readyState: "live", stop } as unknown as MediaStreamTrack;
    const stream = {
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const el = {
      srcObject: stream,
    } as unknown as HTMLVideoElement;

    detachPreJoinHtmlVideo(el);

    expect(el.srcObject).toBeNull();
    expect(stop).not.toHaveBeenCalled();
  });

  it("retains pre-join preview until local video is playing", () => {
    expect(shouldRetainPreJoinPreview(false)).toBe(true);
    expect(shouldRetainPreJoinPreview(true)).toBe(false);
  });

  it("bindAgoraRemoteVideoTrack verifies container video like local", async () => {
    const play = vi.fn();
    const track = { play } as unknown as import("agora-rtc-sdk-ng").IRemoteVideoTrack;
    const video = { videoWidth: 640, readyState: 4 };
    const container = {
      querySelector: () => video,
      innerHTML: "",
    } as unknown as HTMLElement;
    const { bindAgoraRemoteVideoTrack } = await import("@/lib/community-messenger/call-local-video-pipeline");
    await expect(bindAgoraRemoteVideoTrack(track, container)).resolves.toBe(true);
    expect(play).toHaveBeenCalled();
  });

  it("primeVideoElementAutoplayFromUserGesture starts sync play in gesture tick", async () => {
    const play = vi.fn(() => Promise.resolve());
    const stream = { getVideoTracks: () => [{ readyState: "live" }] } as unknown as MediaStream;
    vi.stubGlobal("document", {
      body: { contains: () => true, appendChild: vi.fn() },
      createElement: () => ({
        muted: false,
        playsInline: false,
        autoplay: false,
        srcObject: null as MediaStream | null,
        style: {},
        setAttribute: vi.fn(),
        play,
        readyState: 4,
        videoWidth: 640,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    const { primeVideoElementAutoplayFromUserGesture } = await import(
      "@/lib/community-messenger/call-local-video-pipeline"
    );
    expect(primeVideoElementAutoplayFromUserGesture(stream)).toBe(true);
    expect(play.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
