/**
 * 업로드 결과 → 메시지 저장 입력 정리 단계가 업로드 필드를 버리지 않는다.
 * 2026-11-14 storage_bucket 누락 · 2026-11-16 흐린 미리보기 누락(S3 실기 FAIL) 둘 다 이 단계에서 났다.
 */
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { normalizeCommunityMessengerImageSendItems } from "@/lib/community-messenger/messenger-image-send-items";
import { processMessengerImageUploads } from "@/lib/community-messenger/server/messenger-image-upload-process";
import type { CommunityMessengerImageSendItem } from "@/lib/community-messenger/types";

const BLUR = "data:image/webp;base64,UklGRhQAAABXRUJQVlA4IAgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA=";

describe("normalizeCommunityMessengerImageSendItems", () => {
  it("모든 업로드 필드를 그대로 옮긴다 (타입 필드가 늘면 이 객체가 컴파일 오류로 알려 준다)", () => {
    const full: Required<CommunityMessengerImageSendItem> = {
      chatPublicUrl: "https://x/a.thumb.webp",
      previewPublicUrl: "https://x/a.preview.webp",
      originalPublicUrl: "https://x/a.jpg",
      originalStoragePath: "u/community/messenger-image/r/a.jpg",
      originalMimeType: "image/jpeg",
      storageBucket: "messenger-media",
      width: 1600,
      height: 1200,
      blurDataUrl: BLUR,
    };
    const [out] = normalizeCommunityMessengerImageSendItems([full]);
    expect(out).toEqual(full);
    expect(Object.keys(out!).sort()).toEqual(Object.keys(full).sort());
  });

  it("잘못된 흐린 미리보기·크기는 null, 필수 주소 없는 항목은 뺀다", () => {
    const out = normalizeCommunityMessengerImageSendItems([
      {
        chatPublicUrl: "https://x/a.thumb.webp",
        previewPublicUrl: "https://x/a.preview.webp",
        originalPublicUrl: "https://x/a.jpg",
        originalStoragePath: "p/a.jpg",
        originalMimeType: "",
        width: -1,
        height: "x" as unknown as number,
        blurDataUrl: "javascript:alert(1)",
      },
      { chatPublicUrl: "", previewPublicUrl: "", originalPublicUrl: "", originalStoragePath: "", originalMimeType: "" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.blurDataUrl).toBeNull();
    expect(out[0]!.width).toBeNull();
    expect(out[0]!.originalMimeType).toBe("image/jpeg");
  });

  it("실제 업로드 처리 결과를 정리해도 흐린 미리보기가 남는다 (S3 실기 FAIL 재현 방지)", async () => {
    const jpg = await sharp({
      create: { width: 1600, height: 1200, channels: 3, background: { r: 30, g: 110, b: 220 } },
    })
      .jpeg()
      .toBuffer();
    const bucket = {
      upload: async () => ({ error: null }),
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://x.test/storage/v1/object/public/messenger-media/${path}` } }),
    };
    const processed = await processMessengerImageUploads({
      bucket,
      baseDir: "u/community/messenger-image/r",
      images: [{ buf: jpg, mimeType: "image/jpeg" }],
      newId: () => "id1",
    });
    expect(processed.ok).toBe(true);
    if (!processed.ok) return;
    const [item] = normalizeCommunityMessengerImageSendItems(
      processed.items.map((it) => ({ ...it, storageBucket: "messenger-media" }))
    );
    expect(item!.blurDataUrl).toMatch(/^data:image\/webp;base64,/);
    expect(item!.width).toBe(1600);
    expect(item!.height).toBe(1200);
    expect(item!.storageBucket).toBe("messenger-media");
  });
});
