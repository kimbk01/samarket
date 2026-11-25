import { afterEach, describe, expect, it, vi } from "vitest";

const prepare = vi.fn();
vi.mock("@/lib/community-messenger/attachment/messenger-photo-library", () => ({
  prepareMessengerNativeVideo: (...a: unknown[]) => prepare(...a),
  uploadMessengerNativePreparedVideo: vi.fn(),
  cancelMessengerNativeVideo: vi.fn(),
  onMessengerNativeVideoProgress: () => () => {},
}));

import { uploadMessengerVideo } from "@/lib/community-messenger/upload/messenger-video-upload-client";

const base = "/api/community-messenger/rooms/r1";

afterEach(() => vi.unstubAllGlobals());

describe("영상 보내기 실패 진단(재감사 S-D) — 실패할 때만 1건", () => {
  it("네이티브 압축 실패 → stage=prepare · 원인 코드 그대로, 업로드 URL 요청 없음", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    prepare.mockResolvedValue({ error: "reader_failed_-11800" });
    const out = await uploadMessengerVideo({
      roomResourcePath: base,
      source: {
        kind: "native",
        picked: { id: "v1", durationMs: 5000, width: 720, height: 1280, sizeBytes: 9, thumbnailDataUrl: "data:image/jpeg;base64,x" },
        prepared: null,
      },
      clientMessageId: "c1",
      signal: new AbortController().signal,
      onProgress: () => {},
    });
    expect(out.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${base}/videos/failure`);
    expect(JSON.parse(String(init.body))).toMatchObject({ stage: "prepare", code: "reader_failed_-11800" });
  });

  it("업로드 URL 거절 → stage=upload_url · 상태코드_오류", async () => {
    const fetchMock = vi.fn(async (u: string) =>
      u.endsWith("/videos/upload-url")
        ? new Response(JSON.stringify({ ok: false, error: "video_too_large" }), { status: 413 })
        : new Response("{}", { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    prepare.mockResolvedValue({ handle: "v1", sizeBytes: 1000, durationMs: 5000, width: 720, height: 1280, transcoded: true });
    await uploadMessengerVideo({
      roomResourcePath: base,
      source: {
        kind: "native",
        picked: { id: "v1", durationMs: 5000, width: 720, height: 1280, sizeBytes: 9, thumbnailDataUrl: "data:image/jpeg;base64,x" },
        prepared: null,
      },
      clientMessageId: "c1",
      signal: new AbortController().signal,
      onProgress: () => {},
    });
    const diag = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/videos/failure")) as unknown as [string, RequestInit];
    expect(JSON.parse(String(diag[1].body))).toMatchObject({ stage: "upload_url", code: "413_video_too_large" });
  });
});
