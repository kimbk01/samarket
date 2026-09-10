import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-crawler/core/safe-url", () => ({
  assertPublicHttpUrlForCrawlFetch: async (u: string) => new URL(u),
}));

import { validateCoverImageCandidate } from "@/lib/community-crawler/core/validate-cover-candidate";

function mockResponse(input: {
  status: number;
  contentType?: string;
  body?: Uint8Array | string;
  headers?: Record<string, string>;
}): Response {
  const headers = new Headers(input.headers ?? {});
  if (input.contentType) headers.set("content-type", input.contentType);
  const raw =
    typeof input.body === "string"
      ? new TextEncoder().encode(input.body)
      : input.body ?? new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  return new Response(Buffer.from(raw), { status: input.status, headers });
}

describe("validateCoverImageCandidate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects empty candidate", async () => {
    const r = await validateCoverImageCandidate(null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty");
  });

  it("404 text/html candidate → invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        mockResponse({
          status: 404,
          contentType: "text/html",
          body: "<html>not found</html>",
        })
      )
    );
    const r = await validateCoverImageCandidate("https://cdn.example.com/cover.jpg");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("http_error");
      expect(r.status).toBe(404);
      expect(r.contentType).toContain("text/html");
    }
  });

  it("200 non-image → invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        mockResponse({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: "<html>ok</html>",
        })
      )
    );
    const r = await validateCoverImageCandidate("https://cdn.example.com/cover.jpg");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("content_type");
  });

  it("200 image/* → valid", async () => {
    const bytes = new Uint8Array(1200);
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        mockResponse({
          status: 200,
          contentType: "image/jpeg",
          body: bytes,
        })
      )
    );
    const r = await validateCoverImageCandidate("https://cdn.example.com/cover.jpg");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url).toContain("cdn.example.com/cover.jpg");
      expect(r.bytes).toBe(1200);
      expect(r.contentType).toContain("image/jpeg");
    }
  });

  it("redirect revalidation follows Location then validates image", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "https://cdn.example.com/final.jpg" },
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          contentType: "image/png",
          body: new Uint8Array(64).fill(1),
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const r = await validateCoverImageCandidate("https://cdn.example.com/start.jpg");
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("redirect to non-image final → invalid", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { Location: "https://cdn.example.com/gone.html" },
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          status: 404,
          contentType: "text/html",
          body: "missing",
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const r = await validateCoverImageCandidate("https://cdn.example.com/start.jpg");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("http_error");
  });
});
