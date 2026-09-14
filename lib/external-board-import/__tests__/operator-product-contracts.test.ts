/**
 * Operator product contracts — must fail if old developer contracts return.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveManilaSeoulTb } from "@/lib/external-board-import/adapters/manilaseoul-sections";
import { resolveTargetMapping } from "@/lib/external-board-import/mapping/target-mapping";
import type { ExternalBoardSourceRow } from "@/lib/external-board-import/types";

const root = process.cwd();

describe("external-board operator product contracts", () => {
  it("manilaseoul never defaults missing tb to board_free", () => {
    expect(resolveManilaSeoulTb("http://manilaseoul.co.kr/")).toBeNull();
    expect(resolveManilaSeoulTb("http://manilaseoul.co.kr/bbs_list.php")).toBeNull();
    expect(resolveManilaSeoulTb("http://manilaseoul.co.kr/bbs_list.php?tb=board_reader")).toBe(
      "board_reader"
    );
    const adapterSrc = readFileSync(join(root, "lib/external-board-import/adapters/manilaseoul.ts"), "utf8");
    expect(adapterSrc).not.toMatch(/\|\|\s*[\"']board_free[\"']/);
  });

  it("target mapping requires dibay_topic_id — slug alone is not authority", () => {
    const base = {
      id: "s",
      site_name: "x",
      source_board_name: "y",
      source_url: "https://x/y",
      site_key: "x",
      board_key: "/y",
      target_topic_id: null,
      target_topic_slug: "travel",
      target_location_id: null,
      target_region_label: null,
      mode: "MANUAL",
      check_status: null,
      check_reasons: [],
      rights_basis: null,
      rights_status: "missing",
      attribution_required: false,
      attribution_display_name: null,
      board_sequence_verified: false,
      enabled: true,
      auth_mode: "public",
      author_pool_id: null,
      date_recent_min_days: 3,
      date_recent_max_days: 10,
      view_seed_min: 1,
      view_seed_max: 2,
      last_checked_at: null,
      last_fetched_at: null,
      created_at: "",
      updated_at: "",
    } as ExternalBoardSourceRow;
    const miss = resolveTargetMapping(base);
    expect(miss.ok).toBe(false);
    if (!miss.ok) expect(miss.failureCode).toBe("dibay_topic_required");
    const ok = resolveTargetMapping({ ...base, target_topic_id: "topic-1" });
    expect(ok.ok).toBe(true);
  });

  it("Admin UI uses publish-selected and has no MANUAL Publish / Fetch snapshot CTA", () => {
    const ui = readFileSync(
      join(root, "components/admin/community/AdminExternalBoardImportPage.tsx"),
      "utf8"
    );
    expect(ui).toContain("publish-selected");
    expect(ui).toContain("게시할 글을 선택하세요");
    expect(ui).toContain("필리핀 정보 소스");
    expect(ui).toContain("사용 가능한 항목 보기");
    for (const bad of [
      "MANUAL Publish",
      "Fetch snapshot",
      "writeDelta",
      "SOURCE_UPDATED",
      "Board sequence",
      "Rights basis",
      "clean-room",
      "E2E gate",
      "adapter missing",
      "UNSUPPORTED",
      "VERIFY",
      "Source Catalog",
    ]) {
      expect(ui).not.toContain(bad);
    }
  });

  it("publish-selected rejects empty ids and loops only explicit ids", () => {
    const route = readFileSync(
      join(root, "app/api/admin/community/external-board/articles/publish-selected/route.ts"),
      "utf8"
    );
    expect(route).toContain("articleIds");
    expect(route).toContain("게시할 글을 선택하세요");
    expect(route).not.toContain("runExternalBoardAutoPublish");
    expect(route).not.toContain("listExternalBoardArticles");
  });

  it("build-transform never writes public attribution", () => {
    const src = readFileSync(
      join(root, "lib/external-board-import/publish/build-transform.ts"),
      "utf8"
    );
    expect(src).toContain("publicAttributionName: null");
    expect(src).toContain("publicAttributionUrl: null");
  });

  it("draft route updates draft only — never source_title/source_document", () => {
    const route = readFileSync(
      join(root, "app/api/admin/community/external-board/articles/[id]/draft/route.ts"),
      "utf8"
    );
    expect(route).toMatch(/draft_title|draft_document/);
    // Object keys must not write raw columns (values may read article.source_* for revert).
    expect(route).not.toMatch(/^\s*source_title\s*:/m);
    expect(route).not.toMatch(/^\s*source_document\s*:/m);
  });

  it("build-transform prefers draft and does not mutate raw source fields in writer", () => {
    const src = readFileSync(
      join(root, "lib/external-board-import/publish/build-transform.ts"),
      "utf8"
    );
    expect(src).toMatch(/draft_title|draftTitle|draft_document|draftDocument/);
    expect(src).not.toMatch(/source_document\s*=/);
  });
});
