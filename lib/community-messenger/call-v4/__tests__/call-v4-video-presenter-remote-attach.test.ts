import { describe, expect, it } from "vitest";
import { classifyCallV4RemoteAttachSkip } from "@/lib/community-messenger/call-v4/call-v4-video-presenter";

describe("classifyCallV4RemoteAttachSkip", () => {
  it("returns phase_not_connected when canAttach is false", () => {
    expect(
      classifyCallV4RemoteAttachSkip({
        canAttach: false,
        wantsVideo: true,
        hasRemoteTrack: true,
        hasContainer: true,
        alreadyAttached: false,
      }),
    ).toBe("phase_not_connected");
  });

  it("returns wants_video_false when presenter is not in video mode", () => {
    expect(
      classifyCallV4RemoteAttachSkip({
        canAttach: true,
        wantsVideo: false,
        hasRemoteTrack: true,
        hasContainer: true,
        alreadyAttached: false,
      }),
    ).toBe("wants_video_false");
  });

  it("returns remote_track_missing when track is absent", () => {
    expect(
      classifyCallV4RemoteAttachSkip({
        canAttach: true,
        wantsVideo: true,
        hasRemoteTrack: false,
        hasContainer: true,
        alreadyAttached: false,
      }),
    ).toBe("remote_track_missing");
  });

  it("returns video_ref_null when container is absent", () => {
    expect(
      classifyCallV4RemoteAttachSkip({
        canAttach: true,
        wantsVideo: true,
        hasRemoteTrack: true,
        hasContainer: false,
        alreadyAttached: false,
      }),
    ).toBe("video_ref_null");
  });

  it("returns already_attached when same attach was completed", () => {
    expect(
      classifyCallV4RemoteAttachSkip({
        canAttach: true,
        wantsVideo: true,
        hasRemoteTrack: true,
        hasContainer: true,
        alreadyAttached: true,
      }),
    ).toBe("already_attached");
  });

  it("returns null when attach should proceed", () => {
    expect(
      classifyCallV4RemoteAttachSkip({
        canAttach: true,
        wantsVideo: true,
        hasRemoteTrack: true,
        hasContainer: true,
        alreadyAttached: false,
      }),
    ).toBeNull();
  });
});
