import { describe, expect, it } from "vitest";
import {
  ADMIN_TOPIC_SORT_METADATA_NOT_WRITABLE,
  ADMIN_TOPIC_SORT_SLOT_SLUG_FORBIDDEN,
  adminTopicCreateSortMetadata,
  applyAdminTopicPatchSortMetadata,
  assertAdminTopicSlugNotSortSlot,
} from "@/lib/community-feed/admin-topic-sort-metadata-contract";

describe("admin topic sort metadata contract", () => {
  it("create always forces content topic sort metadata off", () => {
    expect(adminTopicCreateSortMetadata()).toEqual({
      is_feed_sort: false,
      feed_sort_mode: null,
    });
  });

  it("forbids sort-slot slugs on Admin Topics API", () => {
    expect(assertAdminTopicSlugNotSortSlot("recommended")).toEqual({
      ok: false,
      error: ADMIN_TOPIC_SORT_SLOT_SLUG_FORBIDDEN,
    });
    expect(assertAdminTopicSlugNotSortSlot("popular")).toEqual({
      ok: false,
      error: ADMIN_TOPIC_SORT_SLOT_SLUG_FORBIDDEN,
    });
    expect(assertAdminTopicSlugNotSortSlot("phlifee")).toEqual({ ok: true });
  });

  it("rejects recontamination: is_feed_sort=true / feed_sort_mode popular|recommended", () => {
    expect(applyAdminTopicPatchSortMetadata({ is_feed_sort: true }, {})).toEqual({
      ok: false,
      error: ADMIN_TOPIC_SORT_METADATA_NOT_WRITABLE,
    });
    expect(
      applyAdminTopicPatchSortMetadata({ feed_sort_mode: "popular" }, {})
    ).toEqual({
      ok: false,
      error: ADMIN_TOPIC_SORT_METADATA_NOT_WRITABLE,
    });
    expect(
      applyAdminTopicPatchSortMetadata({ feed_sort_mode: "recommended" }, {})
    ).toEqual({
      ok: false,
      error: ADMIN_TOPIC_SORT_METADATA_NOT_WRITABLE,
    });
  });

  it("allows clearing sort metadata on content rows", () => {
    const patch: Record<string, unknown> = {};
    expect(applyAdminTopicPatchSortMetadata({ is_feed_sort: false }, patch)).toEqual({
      ok: true,
    });
    expect(patch).toEqual({ is_feed_sort: false, feed_sort_mode: null });

    const patch2: Record<string, unknown> = {};
    expect(applyAdminTopicPatchSortMetadata({ feed_sort_mode: null }, patch2)).toEqual({
      ok: true,
    });
    expect(patch2).toEqual({ is_feed_sort: false, feed_sort_mode: null });
  });
});
