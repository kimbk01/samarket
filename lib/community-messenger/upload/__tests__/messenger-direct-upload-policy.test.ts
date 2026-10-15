import { describe, expect, it } from "vitest";
import {
  buildMessengerStagingPath,
  classifyMessengerSendFailure,
  decideMessengerUploadTransport,
  MESSENGER_MULTIPART_SAFE_MAX_BYTES,
  messengerUploadFallbackErrorCode,
  parseMessengerStagedPath,
} from "@/lib/community-messenger/upload/messenger-direct-upload-policy";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ROOM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ROOM2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const MB = 1024 * 1024;

describe("D-3 decideMessengerUploadTransport", () => {
  it("keeps small single files on multipart (old contract)", () => {
    expect(decideMessengerUploadTransport([1 * MB])).toBe("multipart");
    expect(decideMessengerUploadTransport([3 * MB])).toBe("multipart");
  });
  it("uses staged upload once total request bytes exceed the safe threshold", () => {
    expect(decideMessengerUploadTransport([5 * MB])).toBe("staged");
    expect(decideMessengerUploadTransport([15 * MB])).toBe("staged");
    // 10 × 1MB album = 10MB total → staged (album stays one message)
    expect(decideMessengerUploadTransport(Array.from({ length: 10 }, () => 1 * MB))).toBe("staged");
  });
  it("counts multipart overhead at the boundary", () => {
    expect(decideMessengerUploadTransport([MESSENGER_MULTIPART_SAFE_MAX_BYTES])).toBe("staged");
    expect(decideMessengerUploadTransport([MESSENGER_MULTIPART_SAFE_MAX_BYTES - 4096])).toBe("multipart");
  });
  it("threshold stays below Vercel 4.5MB body limit", () => {
    expect(MESSENGER_MULTIPART_SAFE_MAX_BYTES).toBeLessThan(4.5 * MB);
  });
});

describe("D-3 parseMessengerStagedPath (strict ownership)", () => {
  const ok = buildMessengerStagingPath({ kind: "file", userId: USER, roomId: ROOM, uuid: UUID, ext: "pdf" });
  it("accepts own user + room + staging + uuid.ext", () => {
    expect(ok).toBe(`${USER}/community/messenger-file-staging/${ROOM}/${UUID}.pdf`);
    const r = parseMessengerStagedPath({ kind: "file", userId: USER, roomId: ROOM, path: ok });
    expect(r).toEqual({ ok: true, path: ok, uuid: UUID, ext: "pdf" });
  });
  it("rejects another user's staging path", () => {
    expect(parseMessengerStagedPath({ kind: "file", userId: OTHER, roomId: ROOM, path: ok }).ok).toBe(false);
  });
  it("rejects another room's staging path", () => {
    expect(parseMessengerStagedPath({ kind: "file", userId: USER, roomId: ROOM2, path: ok }).ok).toBe(false);
  });
  it("rejects wrong kind (image staging used for file finalize) and final (non-staging) paths", () => {
    const img = buildMessengerStagingPath({ kind: "image", userId: USER, roomId: ROOM, uuid: UUID, ext: "jpg" });
    expect(parseMessengerStagedPath({ kind: "file", userId: USER, roomId: ROOM, path: img }).ok).toBe(false);
    expect(
      parseMessengerStagedPath({
        kind: "file",
        userId: USER,
        roomId: ROOM,
        path: `${USER}/community/messenger-file/${ROOM}/${UUID}.pdf`,
      }).ok
    ).toBe(false);
  });
  it("rejects traversal, nesting, non-uuid leaf, bad ext and non-strings", () => {
    const base = `${USER}/community/messenger-file-staging/${ROOM}/`;
    for (const path of [
      `${base}../../${OTHER}/x/${UUID}.pdf`,
      `${base}sub/${UUID}.pdf`,
      `${base}not-a-uuid.pdf`,
      `${base}${UUID}.PDF`,
      `${base}${UUID}.pdf?x=1`,
      `${base}${UUID}`,
      `/${base}${UUID}.pdf`,
      123,
      null,
    ]) {
      expect(parseMessengerStagedPath({ kind: "file", userId: USER, roomId: ROOM, path })).toEqual({ ok: false });
    }
  });
  it("rejects unsafe user / room ids", () => {
    expect(parseMessengerStagedPath({ kind: "file", userId: "../x", roomId: ROOM, path: ok }).ok).toBe(false);
    expect(parseMessengerStagedPath({ kind: "file", userId: USER, roomId: "", path: ok }).ok).toBe(false);
  });
});

describe("C-5 classifyMessengerSendFailure", () => {
  it("network / timeout / 5xx are indeterminate (keep cid)", () => {
    expect(classifyMessengerSendFailure({ networkError: true })).toBe("indeterminate");
    expect(classifyMessengerSendFailure({ status: 0 })).toBe("indeterminate");
    expect(classifyMessengerSendFailure({ status: 408 })).toBe("indeterminate");
    expect(classifyMessengerSendFailure({ status: 500 })).toBe("indeterminate");
    expect(classifyMessengerSendFailure({ status: 504 })).toBe("indeterminate");
    expect(classifyMessengerSendFailure({ status: 200, jsonParsed: false })).toBe("indeterminate");
  });
  it("explicit 4xx rejections are definitive (clear cid)", () => {
    expect(classifyMessengerSendFailure({ status: 400 })).toBe("definitive");
    expect(classifyMessengerSendFailure({ status: 403 })).toBe("definitive");
    expect(classifyMessengerSendFailure({ status: 413 })).toBe("definitive");
    expect(classifyMessengerSendFailure({ status: 429 })).toBe("definitive");
    expect(classifyMessengerSendFailure({ status: 200, jsonParsed: true })).toBe("definitive");
  });
  it("maps Vercel non-JSON 413 to a clear error code", () => {
    expect(messengerUploadFallbackErrorCode(413)).toBe("file_too_large");
    expect(messengerUploadFallbackErrorCode(502)).toBe("upload_failed");
  });
});
