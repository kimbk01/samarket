import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  it("fetch px — Phase 2A tier snap (112×80 display → 320)", () => {
    expect(storeNoticeCardFetchWidthPx()).toBe(320);
    expect(storeNoticeCardFetchHeightPx()).toBe(320);
  });

  it("store-product notice — object/public", () => {
    const adapter = loadStoreNoticeCardImageFetchUrl(STORE_RAW);
    expect(adapter).toBe(STORE_RAW);
    expect(adapter).not.toContain("/render/image/");
  });

  it("post-images notice — detail derivative", () => {
    const adapter = loadStoreNoticeCardImageFetchUrl(POST_RAW);
    expect(adapter).toContain(".detail.webp");
    expect(adapter).not.toContain("/render/image/");
  });

  it("external URL — pass-through", () => {
    expect(loadStoreNoticeCardImageFetchUrl(EXTERNAL_RAW)).toBe(EXTERNAL_RAW);
  });

  it("empty input — null", () => {
    expect(loadStoreNoticeCardImageFetchUrl(null)).toBeNull();
    expect(loadStoreNoticeCardImageFetchUrl("")).toBeNull();
  });
});
