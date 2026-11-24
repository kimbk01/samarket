import { beforeEach, describe, expect, it, vi } from "vitest";

const sendVideo = vi.fn();
vi.mock("@/lib/community-messenger/service", () => ({
  sendCommunityMessengerVideoMessage: (...args: unknown[]) => sendVideo(...args),
}));
vi.mock("@/lib/community-messenger/server/keep-messenger-notify-alive-after-ack", () => ({
  keepMessengerNotifyAliveAfterAck: () => {},
}));
const bump = vi.fn(async () => {});
vi.mock("@/lib/community-messenger/server/publish-messenger-room-bump", () => ({
  publishMessengerRoomBumpAfterMutation: (...a: unknown[]) => bump(...(a as [])),
}));

import {
  cancelMessengerVideoUpload,
  createMessengerVideoUploadUrls,
  finalizeMessengerVideoUpload,
} from "@/lib/community-messenger/server/messenger-video-upload-send";
import { resetMessengerMediaBucketCacheForTests } from "@/lib/community-messenger/server/messenger-media-bucket";
import { buildMessengerVideoPaths } from "@/lib/community-messenger/upload/messenger-video-upload-policy";
import { collectMessengerMediaStoragePaths } from "@/lib/community-messenger/messenger-media-purge";
import { collectMessengerMessageMediaRefs } from "@/lib/community-messenger/media/messenger-media-ref";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";
const ROOM = "22222222-2222-4222-8222-222222222222";
const UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PATHS = buildMessengerVideoPaths({ userId: USER, roomId: ROOM, uuid: UUID, ext: "mp4" });

type Info = { size: number; contentType: string } | null;

function mockSb(opts: {
  privateBucket?: boolean;
  info?: Record<string, Info>;
  /** info 엔드포인트가 없는 Storage — 목록 검색으로만 메타를 준다 */
  infoUnsupported?: boolean;
  heads?: Record<string, number[]>;
  referenced?: boolean;
}) {
  const remove = vi.fn(async (_paths: string[]) => ({ data: [], error: null }));
  const createSignedUploadUrl = vi.fn(async (path: string) => ({ data: { signedUrl: `https://s/upload/${path}`, token: "t", path }, error: null }));
  const bucketApi = {
    remove,
    createSignedUploadUrl,
    list: vi.fn(async (dir: string, o: { search: string }) => {
      const path = `${dir}/${o.search}`;
      const i = opts.info?.[path];
      return { data: i ? [{ name: o.search, metadata: { size: i.size, mimetype: i.contentType } }] : [], error: null };
    }),
    info: vi.fn(async (path: string) => {
      if (opts.infoUnsupported) return { data: null, error: { message: "not found" } };
      const i = opts.info?.[path];
      return i ? { data: { size: i.size, contentType: i.contentType }, error: null } : { data: null, error: { message: "nf" } };
    }),
    createSignedUrl: vi.fn(async (path: string) => ({ data: { signedUrl: `https://s/sign/${encodeURIComponent(path)}` }, error: null })),
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/messenger-media/${path}` } }),
  };
  const from = vi.fn(() => bucketApi);
  const query = {
    select: () => query,
    eq: () => query,
    limit: async () => ({ data: opts.referenced ? [{ id: "m1" }] : [] }),
  };
  const sb = {
    storage: {
      from,
      getBucket: vi.fn(async () => (opts.privateBucket === false ? { data: null, error: { message: "nf" } } : { data: { public: false }, error: null })),
    },
    from: () => query,
  };
  const heads = opts.heads ?? {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = decodeURIComponent(String(url).replace("https://s/sign/", ""));
      const bytes = heads[path] ?? [];
      return new Response(new Uint8Array(bytes), { status: 206 });
    })
  );
  return { sb: sb as never, remove, createSignedUploadUrl };
}

const MP4_HEAD = [0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d];
const JPG_HEAD = [0xff, 0xd8, 0xff, 0xe0];

beforeEach(() => {
  resetMessengerMediaBucketCacheForTests();
  sendVideo.mockReset();
  bump.mockClear();
});

describe("createMessengerVideoUploadUrls", () => {
  it("검사 통과 → 영상·썸네일 서명 업로드 URL(최종 경로)", async () => {
    const { sb, createSignedUploadUrl } = mockSb({});
    const r = await createMessengerVideoUploadUrls({ sb, userId: USER, roomId: ROOM, bytes: 1000, durationMs: 5000, ext: "mp4" });
    expect(r.status).toBe(200);
    expect(createSignedUploadUrl).toHaveBeenCalledTimes(2);
    expect(String(r.body.videoPath)).toMatch(new RegExp(`^${USER}/community/messenger-video/${ROOM}/[0-9a-f-]{36}\\.mp4$`));
  });
  it("상한 초과·공개 버킷은 URL 을 만들지 않는다", async () => {
    const a = mockSb({});
    expect((await createMessengerVideoUploadUrls({ sb: a.sb, userId: USER, roomId: ROOM, bytes: 60 * 1024 * 1024, durationMs: 1, ext: "mp4" })).status).toBe(413);
    expect((await createMessengerVideoUploadUrls({ sb: a.sb, userId: USER, roomId: ROOM, bytes: 10, durationMs: 200_000, ext: "mp4" })).body.error).toBe("video_too_long");
    resetMessengerMediaBucketCacheForTests();
    const b = mockSb({ privateBucket: false });
    expect((await createMessengerVideoUploadUrls({ sb: b.sb, userId: USER, roomId: ROOM, bytes: 10, durationMs: 1, ext: "mp4" })).body.error).toBe("video_unavailable");
    expect(a.createSignedUploadUrl).not.toHaveBeenCalled();
    expect(b.createSignedUploadUrl).not.toHaveBeenCalled();
  });
});

const goodInfo = {
  [PATHS.videoPath]: { size: 2_000_000, contentType: "video/mp4" },
  [PATHS.thumbPath]: { size: 30_000, contentType: "image/jpeg" },
};
const goodHeads = { [PATHS.videoPath]: MP4_HEAD, [PATHS.thumbPath]: JPG_HEAD };
const base = { userId: USER, canonicalRoomId: ROOM, rawRouteRoomId: ROOM, durationMs: 5000, width: 720, height: 1280, clientMessageId: "cid-1" };

describe("finalizeMessengerVideoUpload — 누수 계약", () => {
  it("남의 경로는 거부하고 삭제도 하지 않는다", async () => {
    const { sb, remove } = mockSb({ info: goodInfo, heads: goodHeads });
    const other = buildMessengerVideoPaths({ userId: OTHER, roomId: ROOM, uuid: UUID, ext: "mp4" });
    const r = await finalizeMessengerVideoUpload({ sb, ...base, videoPath: other.videoPath });
    expect(r.body.error).toBe("staged_path_invalid");
    expect(remove).not.toHaveBeenCalled();
    expect(sendVideo).not.toHaveBeenCalled();
  });

  it("contentType 이 다르거나 서명이 틀리면 두 파일 삭제 후 거부", async () => {
    const a = mockSb({ info: { ...goodInfo, [PATHS.videoPath]: { size: 10, contentType: "text/html" } }, heads: goodHeads });
    expect((await finalizeMessengerVideoUpload({ sb: a.sb, ...base, videoPath: PATHS.videoPath })).body.error).toBe("unsupported_video");
    expect(a.remove).toHaveBeenCalledWith([PATHS.videoPath, PATHS.thumbPath]);
    resetMessengerMediaBucketCacheForTests();
    const b = mockSb({ info: goodInfo, heads: { ...goodHeads, [PATHS.videoPath]: [0x3c, 0x68, 0x74, 0x6d, 0, 0, 0, 0, 0, 0, 0, 0] } });
    expect((await finalizeMessengerVideoUpload({ sb: b.sb, ...base, videoPath: PATHS.videoPath })).body.error).toBe("unsupported_video");
    expect(b.remove).toHaveBeenCalledWith([PATHS.videoPath, PATHS.thumbPath]);
    expect(sendVideo).not.toHaveBeenCalled();
  });

  it("Storage info 미지원이면 목록 검색 메타로 같은 검사", async () => {
    const { sb, remove } = mockSb({ info: goodInfo, heads: goodHeads, infoUnsupported: true });
    sendVideo.mockResolvedValue({ ok: true, message: { id: "m1", createdAt: "t" } });
    expect((await finalizeMessengerVideoUpload({ sb, ...base, videoPath: PATHS.videoPath })).status).toBe(200);
    expect(remove).not.toHaveBeenCalled();
  });

  it("Range 를 무시하고 전체를 보내도 앞 64바이트만 읽고 끊는다", async () => {
    const { sb } = mockSb({ info: goodInfo, heads: goodHeads });
    let pulled = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const isVideo = String(url).includes(encodeURIComponent(PATHS.videoPath));
        const head = isVideo ? MP4_HEAD : JPG_HEAD;
        const stream = new ReadableStream<Uint8Array>({
          pull(c) {
            pulled += 1;
            if (pulled > 50) throw new Error("read too much");
            c.enqueue(new Uint8Array([...head, ...new Array(1024 * 1024).fill(0)]));
          },
        });
        return new Response(stream, { status: 200 });
      })
    );
    sendVideo.mockResolvedValue({ ok: true, message: { id: "m1", createdAt: "t" } });
    expect((await finalizeMessengerVideoUpload({ sb, ...base, videoPath: PATHS.videoPath })).status).toBe(200);
    expect(pulled).toBeLessThanOrEqual(4);
  });

  it("업로드가 없으면(PUT 실패) 삭제 후 upload_missing", async () => {
    const { sb, remove } = mockSb({ info: {}, heads: {} });
    expect((await finalizeMessengerVideoUpload({ sb, ...base, videoPath: PATHS.videoPath })).body.error).toBe("upload_missing");
    expect(remove).toHaveBeenCalled();
  });

  it("정상: 메시지 1행(영상·썸네일 경로) + bump · 삭제 없음", async () => {
    const { sb, remove } = mockSb({ info: goodInfo, heads: goodHeads });
    sendVideo.mockResolvedValue({ ok: true, message: { id: "m1", createdAt: "t" } });
    const r = await finalizeMessengerVideoUpload({ sb, ...base, videoPath: PATHS.videoPath });
    expect(r.status).toBe(200);
    expect(sendVideo).toHaveBeenCalledWith(
      expect.objectContaining({ videoPath: PATHS.videoPath, thumbPath: PATHS.thumbPath, fileSizeBytes: 2_000_000, durationMs: 5000, clientMessageId: "cid-1" })
    );
    expect(remove).not.toHaveBeenCalled();
    expect(bump).toHaveBeenCalledTimes(1);
  });

  it("멱등 재전송(deduped)·전송 거절은 이번 업로드 삭제", async () => {
    const a = mockSb({ info: goodInfo, heads: goodHeads });
    sendVideo.mockResolvedValue({ ok: true, deduped: true, message: { id: "m0", createdAt: "t" } });
    await finalizeMessengerVideoUpload({ sb: a.sb, ...base, videoPath: PATHS.videoPath });
    expect(a.remove).toHaveBeenCalledWith([PATHS.videoPath, PATHS.thumbPath]);
    resetMessengerMediaBucketCacheForTests();
    const b = mockSb({ info: goodInfo, heads: goodHeads });
    sendVideo.mockResolvedValue({ ok: false, error: "room_blocked" });
    expect((await finalizeMessengerVideoUpload({ sb: b.sb, ...base, videoPath: PATHS.videoPath })).status).toBe(400);
    expect(b.remove).toHaveBeenCalledWith([PATHS.videoPath, PATHS.thumbPath]);
  });
});

describe("cancelMessengerVideoUpload", () => {
  it("메시지가 없으면 두 파일 삭제, 이미 메시지가 가리키면 지우지 않는다", async () => {
    const a = mockSb({});
    await cancelMessengerVideoUpload({ sb: a.sb, userId: USER, canonicalRoomId: ROOM, videoPath: PATHS.videoPath });
    expect(a.remove).toHaveBeenCalledWith([PATHS.videoPath, PATHS.thumbPath]);
    resetMessengerMediaBucketCacheForTests();
    const b = mockSb({ referenced: true });
    const r = await cancelMessengerVideoUpload({ sb: b.sb, userId: USER, canonicalRoomId: ROOM, videoPath: PATHS.videoPath });
    expect(r.body.kept).toBe(true);
    expect(b.remove).not.toHaveBeenCalled();
  });
});

describe("삭제·조회 권한 수집기가 영상과 썸네일을 모두 포함", () => {
  const metadata = {
    storagePath: PATHS.videoPath,
    storage_bucket: "messenger-media",
    storage_path: PATHS.videoPath,
    storage_paths: [PATHS.videoPath, PATHS.thumbPath],
    video_thumb_url: `https://x.supabase.co/storage/v1/object/public/messenger-media/${PATHS.thumbPath}`,
  };
  it("purge(모두에게서 삭제)", () => {
    const paths = collectMessengerMediaStoragePaths({ metadata, content: "" });
    expect(paths).toEqual(expect.arrayContaining([PATHS.videoPath, PATHS.thumbPath]));
  });
  it("조회 라우트 허용 객체", () => {
    const refs = collectMessengerMessageMediaRefs({ metadata, content: "" }).map((r) => r.path);
    expect(refs).toEqual(expect.arrayContaining([PATHS.videoPath, PATHS.thumbPath]));
  });
});
