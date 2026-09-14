/**
 * CUT K — leak/bottleneck audit (external-board domain only).
 * ISSUES only where evidence exists; no drive-by optimization.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

type Verdict = "PROVEN" | "NOT_PROVEN" | "ISSUE";

const AUDIT: Array<{ id: string; verdict: Verdict; note: string }> = [
  {
    id: "A_same_source_fetched_repeatedly",
    verdict: "PROVEN",
    note: "discover upserts by source_id+stable_article_identity; UNCHANGED skips document rewrite when fingerprint matches.",
  },
  {
    id: "B_n_plus_one_detail_fetch",
    verdict: "ISSUE",
    note: "DOT discover fetches per-destination HTML gallery after WP list (bounded by limit/pages). Acceptable for fidelity; monitor concurrency.",
  },
  {
    id: "C_image_rehost_duplicate",
    verdict: "PROVEN",
    note: "mediaIdentityFromUrl hashes URL; rehost path dedupes by identity.",
  },
  {
    id: "D_derivative_repeated_creation",
    verdict: "PROVEN",
    note: "draft_document only via operator apply/save; published community_posts not auto-updated on source refresh.",
  },
  {
    id: "E_discover_response_memory_explosion",
    verdict: "PROVEN",
    note: "discover opts clamp page/limit; Admin collect UI uses bounded inputs.",
  },
  {
    id: "F_large_raw_html_db_duplication",
    verdict: "NOT_PROVEN",
    note: "source_document stores ordered nodes JSON not full HTML; no history table (latest raw only).",
  },
  {
    id: "G_publish_selected_serial_bottleneck",
    verdict: "ISSUE",
    note: "publish-selected loops articleIds serially (max 50). Correct for safety; not a silent queue drain.",
  },
  {
    id: "H_source_timeout_blocks_catalog",
    verdict: "PROVEN",
    note: "Adapters are per-source; catalog list is static; one timeout does not block other sources.",
  },
  {
    id: "I_retry_storm",
    verdict: "NOT_PROVEN",
    note: "No automatic retry loop in discover path beyond single fetch timeout.",
  },
  {
    id: "J_admin_refresh_auto_refetch",
    verdict: "PROVEN",
    note: "Admin 새로고침 reloads overview only; does not call discover.",
  },
  {
    id: "K_feed_thumbnail_fallback_network_leak",
    verdict: "PROVEN",
    note: "Admin DTO uses feedThumbnailSrc only; no blank placeholder URL invention from body.",
  },
];

describe("CUT K leak/bottleneck audit", () => {
  it("records A–K verdicts and forbids silent queue publish", () => {
    expect(AUDIT).toHaveLength(11);
    for (const row of AUDIT) {
      expect(["PROVEN", "NOT_PROVEN", "ISSUE"]).toContain(row.verdict);
      expect(row.note.length).toBeGreaterThan(10);
    }
    const route = readFileSync(
      join(root, "app/api/admin/community/external-board/articles/publish-selected/route.ts"),
      "utf8"
    );
    expect(route).not.toContain("runExternalBoardAutoPublish");
    expect(route).toContain("articleIds");
  });
});

export { AUDIT };
