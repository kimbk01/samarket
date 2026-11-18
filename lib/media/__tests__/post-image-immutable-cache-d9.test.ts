import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * D9 (2026-11-19) — post-images 업로드 기본 캐시 1년.
 * 호출처가 cacheControl 을 넘기지 않으면 Storage 기본 3600 이 저장돼 같은 사진을 1시간마다 다시 받았다.
 */
const optimizePostImageOriginalBuffer = vi.fn();
vi.mock("@/lib/media/canonical-image-pipeline.server", () => ({
  optimizePostImageOriginalBuffer: (...a: unknown[]) => optimizePostImageOriginalBuffer(...a),
  buildCanonicalDerivativeBuffers: async () => [],
}));

describe("uploadPostImageWithDerivatives — immutable cache default (D9)", () => {
  beforeEach(() => {
    vi.resetModules();
    optimizePostImageOriginalBuffer.mockResolvedValue({
      buf: Buffer.from("x"),
      contentType: "image/webp",
      ext: "webp",
    });
  });

  async function run(cacheControl?: string) {
    const uploads: Array<{ path: string; opts: Record<string, unknown> }> = [];
    const sb = {
      storage: {
        from: () => ({
          upload: async (path: string, _buf: unknown, opts: Record<string, unknown>) => {
            uploads.push({ path, opts });
            return { error: null };
          },
          remove: async () => ({ error: null }),
          getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn/${p}` } }),
        }),
      },
    };
    const mod = await import("@/lib/media/canonical-image-upload.server");
    await mod
      .uploadPostImageWithDerivatives({
        sb: sb as never,
        originalPath: "u/1.jpg",
        rawBuf: Buffer.from("raw"),
        mimeType: "image/jpeg",
        surfaces: [],
        ...(cacheControl ? { cacheControl } : {}),
      })
      .catch(() => undefined);
    return uploads;
  }

  it("cacheControl 을 넘기지 않으면 1년(31536000)으로 올린다", async () => {
    const uploads = await run();
    expect(uploads.length).toBeGreaterThan(0);
    for (const u of uploads) expect(u.opts.cacheControl).toBe("31536000");
    for (const u of uploads) expect(u.opts.upsert).toBe(false);
  });

  it("호출처가 값을 넘기면 그 값을 쓴다", async () => {
    const uploads = await run("600");
    for (const u of uploads) expect(u.opts.cacheControl).toBe("600");
  });
});
