import { describe, expect, it } from "vitest";
import {
  messengerImageOriginalUrls,
  messengerImageSaveNotice,
} from "@/lib/community-messenger/attachment/messenger-image-save";

const P = "https://x.supabase.co/storage/v1/object/public/post-images/u/r";

describe("messenger image save — original URLs", () => {
  it("album uses original-quality URLs (not thumbnails)", () => {
    expect(
      messengerImageOriginalUrls({
        messageType: "image",
        content: `${P}/a.thumb.webp`,
        imageAlbumUrls: [`${P}/a.thumb.webp`, `${P}/b.thumb.webp`],
        imageAlbumOriginalUrls: [`${P}/a.jpg`, `${P}/b.png`],
      })
    ).toEqual([`${P}/a.jpg`, `${P}/b.png`]);
  });
  it("single uses imageOriginalUrl, falls back to content", () => {
    expect(
      messengerImageOriginalUrls({ messageType: "image", content: `${P}/a.thumb.webp`, imageOriginalUrl: `${P}/a.jpg` })
    ).toEqual([`${P}/a.jpg`]);
    expect(messengerImageOriginalUrls({ messageType: "image", content: `${P}/a.jpg` })).toEqual([`${P}/a.jpg`]);
  });
  it("non-image / blob previews → nothing to save", () => {
    expect(messengerImageOriginalUrls({ messageType: "text", content: `${P}/a.jpg` })).toEqual([]);
    expect(messengerImageOriginalUrls({ messageType: "image", content: "blob:abc" })).toEqual([]);
  });
});

describe("messenger image save — result notice", () => {
  const base = { mode: "native" as const, total: 2, permissionDenied: false };
  it("all saved", () => {
    expect(messengerImageSaveNotice({ ...base, total: 1, savedCount: 1, failedCount: 0 }).key).toBe("cm_ui_photo_saved");
    expect(messengerImageSaveNotice({ ...base, savedCount: 2, failedCount: 0 })).toEqual({
      key: "cm_ui_photo_saved_count",
      params: { count: 2 },
      variant: "success",
    });
  });
  it("partial", () => {
    expect(messengerImageSaveNotice({ ...base, savedCount: 1, failedCount: 1 })).toEqual({
      key: "cm_ui_photo_save_partial",
      params: { saved: 1, failed: 1 },
      variant: "error",
    });
  });
  it("failed / permission denied / unsupported binary", () => {
    expect(messengerImageSaveNotice({ ...base, savedCount: 0, failedCount: 2 }).key).toBe("cm_ui_photo_save_failed");
    expect(
      messengerImageSaveNotice({ ...base, savedCount: 0, failedCount: 2, permissionDenied: true }).key
    ).toBe("cm_ui_photo_save_permission_denied");
    expect(messengerImageSaveNotice({ ...base, mode: "none", savedCount: 0, failedCount: 2 }).key).toBe(
      "cm_ui_photo_save_unsupported"
    );
  });
});
