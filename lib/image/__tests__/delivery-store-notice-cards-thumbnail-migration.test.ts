import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPostImageTransformUrl } from "@/lib/media/post-image-transform";
import {
  buildStoreProductImageTransformUrl,
  deliveryThumbFetchPx,
} from "@/lib/media/store-product-image-transform";
import {
  STORE_NOTICE_CARD_DISPLAY_HEIGHT_PX,
  STORE_NOTICE_CARD_DISPLAY_WIDTH_PX,
  loadStoreNoticeCardImageFetchUrl,
  storeNoticeCardFetchHeightPx,
  storeNoticeCardFetchWidthPx,
} from "@/lib/image";

const POST_RAW =
  "https://abc.supabase.co/storage/v1/object/public/post-images/u1/notice.webp";
const STORE_RAW =
  "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/notice.webp";
const EXTERNAL_RAW = "https://cdn.example.com/notice.webp";

describe("delivery store notice card thumbnail migration (StoreOwnerNoticeCards SSOT)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fetch px — display 112×80 → width=224 height=160", () => {
    expect(storeNoticeCardFetchWidthPx()).toBe(
      deliveryThumbFetchPx(STORE_NOTICE_CARD_DISPLAY_WIDTH_PX)
    );
    expect(storeNoticeCardFetchHeightPx()).toBe(
      deliveryThumbFetchPx(STORE_NOTICE_CARD_DISPLAY_HEIGHT_PX)
    );
    expect(storeNoticeCardFetchWidthPx()).toBe(224);
    expect(storeNoticeCardFetchHeightPx()).toBe(160);
  });

  it("store-product notice — byte-identical to legacy transform", () => {
    const opts = { width: 224, height: 160 };
    const legacy = buildStoreProductImageTransformUrl(STORE_RAW, opts);
    const adapter = loadStoreNoticeCardImageFetchUrl(STORE_RAW);
    expect(adapter).toBe(legacy);
    expect(adapter).toContain("width=224");
    expect(adapter).toContain("height=160");
    expect(adapter).toContain("/render/image/public/store-product-images/");
  });

  it("post-images notice — byte-identical to legacy transform", () => {
    const opts = { width: 224, height: 160 };
    const legacy = buildPostImageTransformUrl(POST_RAW, opts);
    const adapter = loadStoreNoticeCardImageFetchUrl(POST_RAW);
    expect(adapter).toBe(legacy);
    expect(adapter).toContain("/render/image/public/post-images/");
  });

  it("external URL — pass-through byte-identical", () => {
    expect(loadStoreNoticeCardImageFetchUrl(EXTERNAL_RAW)).toBe(EXTERNAL_RAW);
  });

  it("empty input — null", () => {
    expect(loadStoreNoticeCardImageFetchUrl(null)).toBeNull();
    expect(loadStoreNoticeCardImageFetchUrl("")).toBeNull();
  });
});
