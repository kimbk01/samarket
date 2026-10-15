import { describe, expect, it, vi } from "vitest";
import {
  processMessengerImageUploads,
  sniffMessengerImageMime,
  type MessengerImageStorageBucketLike,
} from "@/lib/community-messenger/server/messenger-image-upload-process";

function bucket(failOn?: string) {
  const uploads: Array<{ path: string; contentType: string }> = [];
  const b: MessengerImageStorageBucketLike = {
    upload: vi.fn(async (path: string, _body: Buffer, opts: { contentType: string }) => {
      if (failOn && path.endsWith(failOn)) return { error: { message: "boom" } };
      uploads.push({ path, contentType: opts.contentType });
      return { error: null };
    }),
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${path}` } }),
  };
  return { b, uploads };
}

let n = 0;
const newId = () => `id${++n}`;

describe("D-3 shared image processing helper (multipart + staged)", () => {
  it("uploads sanitized original + thumb + preview to the final baseDir", async () => {
    n = 0;
    const { b, uploads } = bucket();
    const r = await processMessengerImageUploads({
      bucket: b,
      baseDir: "u/community/messenger-image/r",
      images: [{ buf: Buffer.from("a"), mimeType: "image/png" }],
      newId,
      buildVariants: async () => ({
        kind: "triple",
        original: Buffer.from("o"),
        originalContentType: "image/png",
        thumb: Buffer.from("t"),
        preview: Buffer.from("p"),
      }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(uploads).toEqual([
      { path: "u/community/messenger-image/r/id1.png", contentType: "image/png" },
      { path: "u/community/messenger-image/r/id1.thumb.webp", contentType: "image/webp" },
      { path: "u/community/messenger-image/r/id1.preview.webp", contentType: "image/webp" },
    ]);
    expect(r.items[0]).toMatchObject({
      chatPublicUrl: "https://cdn/u/community/messenger-image/r/id1.thumb.webp",
      originalStoragePath: "u/community/messenger-image/r/id1.png",
    });
  });

  it("gif original_only keeps one object", async () => {
    n = 0;
    const { b, uploads } = bucket();
    const r = await processMessengerImageUploads({
      bucket: b,
      baseDir: "d",
      images: [{ buf: Buffer.from("g"), mimeType: "image/gif" }],
      newId,
      buildVariants: async () => ({ kind: "original_only", original: Buffer.from("g"), originalMime: "image/gif" }),
    });
    expect(r.ok).toBe(true);
    expect(uploads.map((u) => u.path)).toEqual(["d/id1.gif"]);
  });

  it("rejected (sharp cannot sanitize) returns already-uploaded paths for purge", async () => {
    n = 0;
    const { b } = bucket();
    let call = 0;
    const r = await processMessengerImageUploads({
      bucket: b,
      baseDir: "d",
      images: [
        { buf: Buffer.from("1"), mimeType: "image/jpeg" },
        { buf: Buffer.from("2"), mimeType: "image/jpeg" },
      ],
      newId,
      buildVariants: async () =>
        ++call === 1
          ? { kind: "original_only", original: Buffer.from("o"), originalMime: "image/jpeg" }
          : { kind: "rejected", reason: "image_unprocessable" },
    });
    expect(r).toEqual({ ok: false, error: "unsupported_image", status: 400, uploadedStoragePaths: ["d/id1.jpg"] });
  });

  it("storage failure mid-way returns 500 with partial paths", async () => {
    n = 0;
    const { b } = bucket(".thumb.webp");
    const r = await processMessengerImageUploads({
      bucket: b,
      baseDir: "d",
      images: [{ buf: Buffer.from("1"), mimeType: "image/jpeg" }],
      newId,
      buildVariants: async () => ({
        kind: "triple",
        original: Buffer.from("o"),
        originalContentType: "image/jpeg",
        thumb: Buffer.from("t"),
        preview: Buffer.from("p"),
      }),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(500);
    expect(r.uploadedStoragePaths).toEqual(["d/id1.jpg"]);
  });
});

describe("sniffMessengerImageMime (staged path never trusts client MIME)", () => {
  it("detects by magic bytes", () => {
    expect(sniffMessengerImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMessengerImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffMessengerImageMime(Buffer.from("GIF89a....", "latin1"))).toBe("image/gif");
    expect(sniffMessengerImageMime(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1"))).toBe("image/webp");
    expect(sniffMessengerImageMime(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
  });
});
