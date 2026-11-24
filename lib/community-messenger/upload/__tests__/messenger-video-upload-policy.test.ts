import { describe, expect, it } from "vitest";
import {
  buildMessengerVideoPaths,
  formatMessengerVideoDuration,
  isMessengerJpegSignature,
  isMessengerVideoSignature,
  MESSENGER_VIDEO_MAX_BYTES,
  MESSENGER_VIDEO_MAX_DURATION_MS,
  messengerVideoExtFor,
  parseMessengerVideoPath,
  precheckMessengerVideo,
} from "@/lib/community-messenger/upload/messenger-video-upload-policy";
import { messengerVideoCombinedProgress } from "@/lib/community-messenger/upload/messenger-video-send-progress-store";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";
const ROOM = "22222222-2222-4222-8222-222222222222";
const UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("영상 정책 값 (Owner 2026-11-24 승인 O1)", () => {
  it("최대 3분 · 50MB (버킷 한도와 같음)", () => {
    expect(MESSENGER_VIDEO_MAX_DURATION_MS).toBe(180_000);
    expect(MESSENGER_VIDEO_MAX_BYTES).toBe(52_428_800);
  });
});

describe("precheckMessengerVideo", () => {
  it("크기·길이·형식", () => {
    expect(precheckMessengerVideo({ bytes: 10, durationMs: 1000, ext: "mp4" })).toEqual({ ok: true, ext: "mp4" });
    expect(precheckMessengerVideo({ bytes: 0, durationMs: 1000, ext: "mp4" })).toEqual({ ok: false, error: "empty_file" });
    expect(precheckMessengerVideo({ bytes: MESSENGER_VIDEO_MAX_BYTES + 1, durationMs: 1000, ext: "mp4" })).toEqual({
      ok: false,
      error: "video_too_large",
    });
    expect(precheckMessengerVideo({ bytes: 10, durationMs: MESSENGER_VIDEO_MAX_DURATION_MS + 501, ext: "mov" })).toEqual({
      ok: false,
      error: "video_too_long",
    });
    expect(precheckMessengerVideo({ bytes: 10, durationMs: MESSENGER_VIDEO_MAX_DURATION_MS + 400, ext: "mov" }).ok).toBe(true);
    expect(precheckMessengerVideo({ bytes: 10, durationMs: 1000, ext: "avi" })).toEqual({ ok: false, error: "unsupported_video" });
    expect(precheckMessengerVideo({ bytes: 10, durationMs: null, ext: "mp4" }).ok).toBe(true);
  });

  it("확장자 판정", () => {
    expect(messengerVideoExtFor({ mime: "video/mp4" })).toBe("mp4");
    expect(messengerVideoExtFor({ mime: "video/quicktime" })).toBe("mov");
    expect(messengerVideoExtFor({ name: "a.MOV" })).toBe("mov");
    expect(messengerVideoExtFor({ name: "a.webm", mime: "video/webm" })).toBeNull();
  });
});

describe("parseMessengerVideoPath — 본인·이 방·uuid 만", () => {
  const own = buildMessengerVideoPaths({ userId: USER, roomId: ROOM, uuid: UUID, ext: "mp4" });

  it("썸네일 경로는 서버가 같은 uuid 로 만든다", () => {
    expect(own.thumbPath).toBe(`${USER}/community/messenger-video/${ROOM}/${UUID}.thumb.jpg`);
    const p = parseMessengerVideoPath({ userId: USER, roomId: ROOM, path: own.videoPath });
    expect(p).toMatchObject({ ok: true, videoPath: own.videoPath, thumbPath: own.thumbPath, ext: "mp4" });
  });

  it("다른 사용자·다른 방·경로 탈출·썸네일 경로 직접 지정 거부", () => {
    expect(parseMessengerVideoPath({ userId: OTHER, roomId: ROOM, path: own.videoPath }).ok).toBe(false);
    expect(parseMessengerVideoPath({ userId: USER, roomId: OTHER, path: own.videoPath }).ok).toBe(false);
    expect(parseMessengerVideoPath({ userId: USER, roomId: ROOM, path: `${USER}/community/messenger-video/${ROOM}/../x/${UUID}.mp4` }).ok).toBe(false);
    expect(parseMessengerVideoPath({ userId: USER, roomId: ROOM, path: own.thumbPath }).ok).toBe(false);
    expect(parseMessengerVideoPath({ userId: USER, roomId: ROOM, path: 123 }).ok).toBe(false);
  });
});

describe("서명", () => {
  it("mp4/mov ftyp · JPEG", () => {
    const ftyp = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    expect(isMessengerVideoSignature(ftyp)).toBe(true);
    expect(isMessengerVideoSignature(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
    expect(isMessengerJpegSignature(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(isMessengerJpegSignature(new Uint8Array([0x89, 0x50, 0x4e]))).toBe(false);
  });
});

describe("표시", () => {
  it("길이 m:ss", () => {
    expect(formatMessengerVideoDuration(42_000)).toBe("0:42");
    expect(formatMessengerVideoDuration(180_000)).toBe("3:00");
    expect(formatMessengerVideoDuration(null)).toBe("0:00");
  });
  it("진행률 — 압축 40% + 업로드 60%, 압축 없으면 업로드만", () => {
    expect(messengerVideoCombinedProgress("transcode", 1, true)).toBeCloseTo(0.4);
    expect(messengerVideoCombinedProgress("upload", 0.5, true)).toBeCloseTo(0.7);
    expect(messengerVideoCombinedProgress("upload", 0.5, false)).toBeCloseTo(0.5);
  });
});
