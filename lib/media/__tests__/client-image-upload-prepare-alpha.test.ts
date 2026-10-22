import { beforeEach, describe, expect, it, vi } from "vitest";

/** 캔버스·인코더는 브라우저 전용 — 픽셀 alpha 와 toBlob 결과 타입만 흉내 낸다. */
const state = { alpha: 255, webpSupported: true, sizeOf: (_type: string, _q: number) => 1000 };

vi.mock("@/components/write/shared/image-editor-canvas", () => ({
  loadImage: async () => ({}),
  createWorkingCanvasFromImage: () => ({
    width: 2,
    height: 1,
    getContext: () => ({
      getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, state.alpha]) }),
    }),
  }),
  canvasToBlob: async (_canvas: unknown, type: string, q: number) => {
    const actual = type === "image/webp" && !state.webpSupported ? "image/png" : type;
    return new Blob([new Uint8Array(state.sizeOf(actual, q))], { type: actual });
  },
  blobToFile: (blob: Blob, name: string) => new File([blob], name, { type: blob.type }),
}));

import { prepareImageFileForFunctionUpload } from "@/lib/media/client-image-upload-prepare";

function bigFile(name: string, type: string): File {
  return new File([new Uint8Array(5000)], name, { type });
}

beforeEach(() => {
  state.alpha = 255;
  state.webpSupported = true;
  state.sizeOf = () => 1000;
  vi.stubGlobal("document", {});
  vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
});

describe("IMG-02 shrink keeps PNG/WebP transparency", () => {
  it("transparent PNG → WebP (alpha kept), never JPEG", async () => {
    state.alpha = 0;
    const r = await prepareImageFileForFunctionUpload(bigFile("logo.png", "image/png"), 4000);
    expect(r.ok && r.file.type).toBe("image/webp");
    expect(r.ok && r.file.name).toBe("logo.webp");
  });

  it("WebView without WebP encoding → PNG once; too big stays an error instead of JPEG", async () => {
    state.alpha = 10;
    state.webpSupported = false;
    const ok = await prepareImageFileForFunctionUpload(bigFile("logo.png", "image/png"), 4000);
    expect(ok.ok && ok.file.type).toBe("image/png");
    state.sizeOf = () => 9000;
    const tooBig = await prepareImageFileForFunctionUpload(bigFile("logo.png", "image/png"), 4000);
    expect(tooBig).toEqual({ ok: false, error: "file_too_large" });
  });

  it("opaque PNG and camera JPEG still shrink to JPEG", async () => {
    const png = await prepareImageFileForFunctionUpload(bigFile("menu.png", "image/png"), 4000);
    expect(png.ok && png.file.type).toBe("image/jpeg");
    const jpg = await prepareImageFileForFunctionUpload(bigFile("photo.jpg", "image/jpeg"), 4000);
    expect(jpg.ok && jpg.file.type).toBe("image/jpeg");
  });
});
