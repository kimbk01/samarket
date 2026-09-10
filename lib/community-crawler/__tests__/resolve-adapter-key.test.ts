import { describe, expect, it } from "vitest";
import { resolveCommunityCrawlAdapterKey } from "@/lib/community-crawler/core/resolve-adapter-key";
import type { CommunityCrawlBoardRow, CommunityCrawlSourceRow } from "@/lib/community-crawler/crawl-ssot";

function source(partial: Partial<CommunityCrawlSourceRow>): CommunityCrawlSourceRow {
  return {
    id: "s1",
    name: "Travel Philippines — Department of Tourism",
    base_url: "https://app.philippines.travel",
    crawler_type: "custom_adapter",
    adapter_key: "travel_philippines",
    status: "ACTIVE",
    policy_status: "REVIEW_REQUIRED",
    publish_mode: "REFERENCE_SUMMARY",
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

function board(partial: Partial<CommunityCrawlBoardRow>): CommunityCrawlBoardRow {
  return {
    id: "b1",
    source_id: "s1",
    name: "See & Do",
    list_url: "https://app.philippines.travel/articles/category/see-and-do",
    dibay_topic_id: "t1",
    crawl_mode: "custom_adapter",
    adapter_config: {},
    update_policy: "CREATE_ONLY",
    author_policy: "SOURCE_AUTHOR",
    author_config: {},
    date_policy: "SOURCE_DATE",
    date_config: {},
    view_policy: "SOURCE_VIEW",
    view_config: {},
    schedule_enabled: false,
    crawl_interval_minutes: 60,
    next_run_at: null,
    max_pages: 1,
    max_posts: 15,
    ingest_mode: "DATASET",
    enabled: true,
    last_run_at: null,
    last_success_at: null,
    last_error: null,
    created_at: "",
    updated_at: "",
    ...partial,
  } as CommunityCrawlBoardRow;
}

describe("resolveCommunityCrawlAdapterKey", () => {
  it("resolves live Travel PH custom_adapter + adapter_key (screenshot board)", () => {
    expect(resolveCommunityCrawlAdapterKey(source({}), board({}))).toBe("travel_philippines");
  });

  it("does not reject Travel PH as unsupported when crawl_mode is custom_adapter", () => {
    const key = resolveCommunityCrawlAdapterKey(
      source({ crawler_type: "custom_adapter", adapter_key: "travel_philippines" }),
      board({ crawl_mode: "custom_adapter" })
    );
    expect(key).not.toBeNull();
    expect(key).toBe("travel_philippines");
  });

  it("resolves generic_html boards", () => {
    expect(
      resolveCommunityCrawlAdapterKey(
        source({
          base_url: "https://example.com",
          crawler_type: "generic_html",
          adapter_key: null,
        }),
        board({
          list_url: "https://example.com/list",
          crawl_mode: "generic_html",
        })
      )
    ).toBe("generic_html");
  });

  it("returns null for unknown custom adapter (true ADAPTER_UNSUPPORTED)", () => {
    expect(
      resolveCommunityCrawlAdapterKey(
        source({
          base_url: "https://unknown.example",
          crawler_type: "custom_adapter",
          adapter_key: "some_other_adapter",
        }),
        board({
          list_url: "https://unknown.example/list",
          crawl_mode: "custom_adapter",
        })
      )
    ).toBeNull();
  });
});
