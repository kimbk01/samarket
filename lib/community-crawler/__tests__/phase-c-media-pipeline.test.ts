/**
 * PHASE C media pipeline targeted tests (policy / validation / idempotency / override / orphan).
 */
import { createHash } from "node:crypto";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isCommunityCrawlMediaRehostPermitted } from "@/lib/community-crawler/media/policy";
import {
  buildCrawlMediaStoragePath,
  safeFetchCrawlMediaBytes,
} from "@/lib/community-crawler/media/safe-fetch-image";

vi.mock("@/lib/security/remote-image-import-url", () => ({
  assertPublicHttpUrlForImageFetch: vi.fn(async (url: string) => new URL(url)),
}));

async function jpeg1x1(): Promise<Buffer> {
  return sharp({
    create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .jpeg()
    .toBuffer();
}

describe("PHASE C media policy gate", () => {
  it("MEDIA_ALLOWED permits rehost", () => {
    expect(isCommunityCrawlMediaRehostPermitted("MEDIA_ALLOWED")).toBe(true);
  });
  it("MEDIA_REVIEW_REQUIRED blocks rehost", () => {
    expect(isCommunityCrawlMediaRehostPermitted("MEDIA_REVIEW_REQUIRED")).toBe(false);
  });
  it("MEDIA_DISABLED blocks rehost", () => {
    expect(isCommunityCrawlMediaRehostPermitted("MEDIA_DISABLED")).toBe(false);
  });
});

describe("PHASE C storage path idempotency", () => {
  it("same hash → same path", () => {
    const a = buildCrawlMediaStoragePath({
      sourceId: "src",
      crawlItemId: "item",
      contentHash: "abc",
      ext: "jpg",
    });
    const b = buildCrawlMediaStoragePath({
      sourceId: "src",
      crawlItemId: "item",
      contentHash: "abc",
      ext: "jpg",
    });
    expect(a).toBe("community-crawler/src/item/abc.jpg");
    expect(a).toBe(b);
  });
});

describe("PHASE C safeFetchCrawlMediaBytes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("accepts valid jpeg bytes", async () => {
    const buf = await jpeg1x1();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        headers: { get: (k: string) => (k === "content-type" ? "image/jpeg" : null) },
        body: null,
        arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      }))
    );
    const r = await safeFetchCrawlMediaBytes("https://cdn.example.com/a.jpg");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mime).toBe("image/jpeg");
      expect(r.width).toBeGreaterThan(0);
      expect(r.height).toBeGreaterThan(0);
      expect(r.contentHash).toBe(createHash("sha256").update(buf).digest("hex"));
    }
  });

  it("rejects HTTP 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 404,
        headers: { get: () => null },
        body: null,
        arrayBuffer: async () => new ArrayBuffer(0),
      }))
    );
    const r = await safeFetchCrawlMediaBytes("https://cdn.example.com/missing.jpg");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("http_error");
  });

  it("rejects text/html body", async () => {
    const html = Buffer.from("<html>not image</html>");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        headers: { get: (k: string) => (k === "content-type" ? "text/html" : null) },
        body: null,
        arrayBuffer: async () =>
          html.buffer.slice(html.byteOffset, html.byteOffset + html.byteLength),
      }))
    );
    const r = await safeFetchCrawlMediaBytes("https://cdn.example.com/page");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("mime_rejected");
  });

  it("rejects corrupt image bytes", async () => {
    const junk = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        headers: { get: (k: string) => (k === "content-type" ? "image/jpeg" : null) },
        body: null,
        arrayBuffer: async () =>
          junk.buffer.slice(junk.byteOffset, junk.byteOffset + junk.byteLength),
      }))
    );
    const r = await safeFetchCrawlMediaBytes("https://cdn.example.com/bad.jpg");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(["decode_failed", "zero_dimension", "mime_rejected"]).toContain(r.reason);
  });

  it("blocks SSRF redirect hop when assert rejects", async () => {
    const { assertPublicHttpUrlForImageFetch } = await import(
      "@/lib/security/remote-image-import-url"
    );
    vi.mocked(assertPublicHttpUrlForImageFetch)
      .mockResolvedValueOnce(new URL("https://cdn.example.com/a.jpg"))
      .mockRejectedValueOnce(new Error("private"));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 302,
        headers: {
          get: (k: string) => (k === "location" ? "http://127.0.0.1/secret" : null),
        },
        body: null,
        arrayBuffer: async () => new ArrayBuffer(0),
      }))
    );
    const r = await safeFetchCrawlMediaBytes("https://cdn.example.com/a.jpg");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("redirect_blocked");
  });
});
