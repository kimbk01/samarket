import { describe, expect, it } from "vitest";
import { fixtureExternalBoardAdapter } from "@/lib/external-board-import/adapters/types";
import { resolveExternalBoardAdapter } from "@/lib/external-board-import/adapters/registry";
import { resolvePublishAttribution } from "@/lib/external-board-import/attribution/public-attribution";
import { validateExternalBoardDocument } from "@/lib/external-board-import/document/ordered-document";
import { externalBoardDocumentToCommunityContent } from "@/lib/external-board-import/document/to-community-content";
import { fingerprintExternalBoardDocument } from "@/lib/external-board-import/identity/article-identity";
import { deriveSourceBoardIdentity } from "@/lib/external-board-import/identity/source-board-identity";
import { classifySourceUpdateSignal } from "@/lib/external-board-import/integrity/source-update";
import { OLD_EXTERNAL_IMPORT_COMPLETE_REMOVE } from "@/lib/external-board-import/old-product-remove-boundary";
import {
  EXTERNAL_BOARD_FIXTURE_IS_NOT_FINAL_ACCEPTANCE,
  EXTERNAL_BOARD_P0_INTEGRITY,
  EXTERNAL_BOARD_UNKNOWN_CHRONOLOGY,
} from "@/lib/external-board-import/product-lock";
import { isRealSourceE2EAllowed, EXTERNAL_BOARD_OWNER_E2E_GATE } from "@/lib/external-board-import/owner-e2e-gate";
import { applyReplacementPolicy } from "@/lib/external-board-import/policy/replacement";
import { computePreviewWriteDelta } from "@/lib/external-board-import/preview/measure-write-delta";
import { resolveExternalBoardPublishedAt } from "@/lib/external-board-import/publish/chronology";
import {
  assertNoCustomerFacingOriginUi,
  EXTERNAL_BOARD_PUBLIC_INTEGRATION,
} from "@/lib/external-board-import/public/natural-integration";
import {
  assertExternalBoardRightsDeclared,
  RIGHTS_PUBLIC_IS_NOT_REPUBLISH,
} from "@/lib/external-board-import/rights/rights-gate";
import type { ExternalBoardArticleRow, ExternalBoardSourceRow } from "@/lib/external-board-import/types";

function fakeSource(partial: Partial<ExternalBoardSourceRow> = {}): ExternalBoardSourceRow {
  return {
    id: "s1",
    site_name: "example.com",
    source_board_name: "/board",
    source_url: "https://example.com/board",
    site_key: "example.com",
    board_key: "/board",
    target_topic_id: null,
    target_topic_slug: "travel",
    target_location_id: null,
    target_region_label: null,
    mode: "MANUAL",
    check_status: "READY",
    check_reasons: [],
    rights_basis: "owner note",
    rights_status: "declared",
    attribution_required: false,
    attribution_display_name: null,
    board_sequence_verified: false,
    enabled: true,
    auth_mode: "public",
    author_pool_id: null,
    date_recent_min_days: 3,
    date_recent_max_days: 10,
    view_seed_min: 100,
    view_seed_max: 500,
    last_checked_at: null,
    last_fetched_at: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

function fakeArticle(partial: Partial<ExternalBoardArticleRow> = {}): ExternalBoardArticleRow {
  return {
    id: "a1",
    source_id: "s1",
    stable_article_identity: "stable:1",
    identity_kind: "stable_id",
    content_fingerprint: "x",
    canonical_source_url: "https://example.com/a/1",
    source_title: "t",
    source_document: { title: "t", canonicalUrl: "https://example.com/a/1", nodes: [] },
    draft_title: null,
    draft_document: null,
    edit_status: null,
    source_author: null,
    source_published_at: null,
    source_language: null,
    detected_language: null,
    display_language: null,
    translation_status: null,
    source_page: null,
    source_sequence: null,
    chronology_case: null,
    operator_published_at: null,
    operator_batch_order: null,
    snapshot_version: 1,
    ops_status: "unpublished",
    article_signal: "NEW",
    publication_state: "none",
    suppressed_at: null,
    suppression_reason: null,
    published_post_id: null,
    failure_stage: null,
    failure_code: null,
    failure_message: null,
    failed_at: null,
    first_seen_at: "",
    last_seen_at: "",
    source_changed_at: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

describe("external-board-import clean-room contracts", () => {
  it("locks P0 integrity and fixture≠final", () => {
    expect(EXTERNAL_BOARD_P0_INTEGRITY).toContain("public_attribution_not_gated_by_origin_kind");
    expect(EXTERNAL_BOARD_FIXTURE_IS_NOT_FINAL_ACCEPTANCE).toBe(true);
    expect(EXTERNAL_BOARD_OWNER_E2E_GATE.status).toBe("BLOCKED");
    expect(OLD_EXTERNAL_IMPORT_COMPLETE_REMOVE.deleteNow).toBe(false);
    expect(EXTERNAL_BOARD_UNKNOWN_CHRONOLOGY.AUTO).toBe("BLOCK");
  });

  it("rights gate blocks missing basis", () => {
    const missing = assertExternalBoardRightsDeclared({ rightsStatus: "missing" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.failureStage).toBe("rights");
      expect(missing.failureMessage).toContain("not republishing rights");
    }
    expect(RIGHTS_PUBLIC_IS_NOT_REPUBLISH.length).toBeGreaterThan(10);
  });

  it("attribution is policy-driven, not origin-driven", () => {
    expect(EXTERNAL_BOARD_PUBLIC_INTEGRATION.attributionAuthority).toBe("explicit_policy_metadata");
    expect(resolvePublishAttribution({
      attributionRequired: false,
      attributionDisplayName: null,
      siteName: "x",
      canonicalSourceUrl: "https://x/a",
    }).publicAttributionName).toBeNull();
    expect(resolvePublishAttribution({
      attributionRequired: true,
      attributionDisplayName: "Foo Board",
      siteName: "x",
      canonicalSourceUrl: "https://x/a",
    })).toEqual({
      publicAttributionName: "Foo Board",
      publicAttributionUrl: "https://x/a",
    });
  });

  it("chronology CASE A/B/C with Owner UNKNOWN rules", () => {
    const a = resolveExternalBoardPublishedAt({
      source: fakeSource(),
      article: fakeArticle({ source_published_at: "2024-01-02T00:00:00.000Z" }),
      mode: "AUTO",
    });
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.case).toBe("A");

    const b = resolveExternalBoardPublishedAt({
      source: fakeSource({ board_sequence_verified: true }),
      article: fakeArticle(),
      mode: "AUTO",
      sequenceIndex: 2,
      sequenceBaseNow: new Date("2024-06-01T12:00:00.000Z"),
    });
    expect(b.ok).toBe(true);
    if (b.ok) {
      expect(b.case).toBe("B");
      expect(b.publishedAtIso).toBe("2024-06-01T11:59:58.000Z");
    }

    const cAuto = resolveExternalBoardPublishedAt({
      source: fakeSource({ mode: "AUTO" }),
      article: fakeArticle(),
      mode: "AUTO",
    });
    expect(cAuto.ok).toBe(false);
    if (!cAuto.ok) expect(cAuto.failureCode).toBe("chronology_unknown_auto_blocked");

    const cManualNoOp = resolveExternalBoardPublishedAt({
      source: fakeSource({ mode: "MANUAL" }),
      article: fakeArticle(),
      mode: "MANUAL",
    });
    expect(cManualNoOp.ok).toBe(false);

    const cManual = resolveExternalBoardPublishedAt({
      source: fakeSource({ mode: "MANUAL" }),
      article: fakeArticle({ operator_published_at: "2024-05-01T08:00:00.000Z" }),
      mode: "MANUAL",
    });
    expect(cManual.ok).toBe(true);
    if (cManual.ok) expect(cManual.case).toBe("C");
  });

  it("preserves ordered document into community content; first image is thumb ref", async () => {
    const { ctx } = resolveExternalBoardAdapter("https://fixture.external-board.local/board");
    const items = await fixtureExternalBoardAdapter.discoverArticles(ctx, { limit: 1 });
    const doc = items[0]!.sampleDocument!;
    expect(validateExternalBoardDocument(doc).ok).toBe(true);
    const community = externalBoardDocumentToCommunityContent(doc);
    expect(community.images[0]).toContain("/img/fx-1.jpg");
    expect(community.content).toContain("Second paragraph after image");
  });

  it("SOURCE_UPDATED does not invent a new Community post signal", () => {
    expect(
      classifySourceUpdateSignal({
        previousFingerprint: "aaa",
        nextFingerprint: "bbb",
        publishedPostId: "post-1",
      })
    ).toBe("SOURCE_UPDATED");
  });

  it("fingerprint changes when node order changes", () => {
    const a = {
      title: "t",
      canonicalUrl: "https://fixture.external-board.local/a/1",
      nodes: [
        { type: "paragraph" as const, text: "A" },
        { type: "image" as const, src: "https://x/a.jpg" },
      ],
    };
    const b = {
      ...a,
      nodes: [
        { type: "image" as const, src: "https://x/a.jpg" },
        { type: "paragraph" as const, text: "A" },
      ],
    };
    expect(fingerprintExternalBoardDocument(a)).not.toBe(fingerprintExternalBoardDocument(b));
  });

  it("applies exact replacement on title and body", () => {
    const doc = applyReplacementPolicy(
      {
        title: "Hello SOURCE",
        canonicalUrl: "https://fixture.external-board.local/a/1",
        nodes: [{ type: "paragraph", text: "Visit SOURCE site" }],
      },
      [
        {
          id: "1",
          source_id: "s",
          from_text: "SOURCE",
          to_text: "DIBAY",
          apply_title: true,
          apply_body: true,
          priority: 1,
          enabled: true,
        },
      ]
    );
    expect(doc.title).toBe("Hello DIBAY");
  });

  it("public natural integration forbids origin-gated product UI", () => {
    expect(EXTERNAL_BOARD_PUBLIC_INTEGRATION.originRankingFactor).toBe(0);
    expect(
      assertNoCustomerFacingOriginUi({
        gatesAttributionByOriginKind: true,
      }).ok
    ).toBe(false);
    expect(assertNoCustomerFacingOriginUi({}).ok).toBe(true);
  });

  it("real-source E2E stays blocked without Owner URL+rights", () => {
    expect(isRealSourceE2EAllowed({})).toBe(false);
    expect(
      isRealSourceE2EAllowed({
        ownerAllowedUrl: "https://example.com/board",
        ownerRightsBasis: "written permission",
      })
    ).toBe(true);
  });

  it("preview write-delta measurement flags forbidden table changes", () => {
    const before = {
      communityPosts: 10,
      mediaAssets: 0,
      publishClaims: 0,
      articlePublishedPostId: null,
      articleOpsStatus: "unpublished",
    };
    expect(computePreviewWriteDelta(before, before).writeDelta).toBe(0);
    expect(
      computePreviewWriteDelta(before, { ...before, communityPosts: 11 }).violations
    ).toContain("community_posts");
    expect(
      computePreviewWriteDelta(before, { ...before, articleOpsStatus: "published" }).violations
    ).toContain("article.ops_status");
  });

  it("derive board identity", () => {
    const id = deriveSourceBoardIdentity("https://WWW.Example.com/board/foo/?x=1#hash");
    expect(id?.siteKey).toBe("example.com");
  });
});
