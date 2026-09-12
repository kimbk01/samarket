import { describe, expect, it } from "vitest";
import {
  applyBoardImportReplacement,
  articleDocumentStructureKey,
  assertPublishLinkUniqueness,
  BOARD_IMPORT_DB_UNIQUE_ENFORCEMENT,
  buildSourceArticleIdentityFromDocument,
  buildSourceBoardIdentity,
  canResolveSameArticle,
  countInlineImages,
  decideArticleDedupe,
  detectSourceBoardDuplicate,
  firstValidInlineImage,
  makeFailureAudit,
  normalizeSourceBoardUrl,
  pickInitialViewSeed,
  previewBoardImportReplacement,
  publishBoardImportReplacement,
  resolveArticleAdminListKind,
  resolveBoardCheckStatus,
  resolveOpsStatus,
  summarizeCrawlDedupe,
  type ArticleDocument,
  type KnownSourceArticleRecord,
  type SourceArticleIdentity,
} from "@/lib/community-board-import";

function sampleDoc(overrides?: Partial<ArticleDocument>): ArticleDocument {
  return {
    title: "Visit Philippines Travel with Manila Bulletin",
    canonicalUrl: "https://example.com/travel/a1",
    sourceAuthor: "DOT",
    sourceDateIso: "2026-09-01",
    nodes: [
      { kind: "paragraph", text: "P1 from Department of Tourism" },
      { kind: "image", src: "https://cdn.example/a.jpg", imageId: "img-a", alt: "A" },
      { kind: "paragraph", text: "P2" },
      { kind: "image", src: "https://cdn.example/b.jpg", imageId: "img-b", alt: "B" },
      { kind: "paragraph", text: "P3" },
    ],
    ...overrides,
  };
}

function mustIdentity(doc: ArticleDocument, opts?: { stableArticleId?: string; sourceBoardId?: string }): SourceArticleIdentity {
  const r = buildSourceArticleIdentityFromDocument({
    sourceBoardId: opts?.sourceBoardId ?? "board-1",
    stableArticleId: opts?.stableArticleId,
    document: doc,
  });
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error("identity build failed");
  return r.identity;
}

describe("community-board-import Owner Final Product Lock contracts", () => {
  it("preserves article document order; feed thumbnail REFERENCES first image only", () => {
    const doc = sampleDoc();
    expect(countInlineImages(doc)).toBe(2);
    expect(firstValidInlineImage(doc)?.imageId).toBe("img-a");
    expect(articleDocumentStructureKey(doc)).toBe(
      "paragraph|image:img-a|paragraph|image:img-b|paragraph"
    );
  });

  it("replacement: source snapshot unchanged; preview === publish transform", () => {
    const source = sampleDoc();
    const rules = [
      {
        id: "1",
        from_text: "Philippines Travel",
        to_text: "DIBAY",
        apply_title: true,
        apply_body: true,
        priority: 10,
        enabled: true,
      },
      {
        id: "2",
        from_text: "Department of Tourism",
        to_text: "DIBAY 여행",
        apply_title: false,
        apply_body: true,
        priority: 20,
        enabled: true,
      },
    ];

    const preview = previewBoardImportReplacement({
      sourceTitle: source.title,
      sourceDocument: source,
      rules,
    });
    const published = publishBoardImportReplacement({
      sourceTitle: source.title,
      sourceDocument: source,
      rules,
    });
    expect(preview).toEqual(published);
    expect(applyBoardImportReplacement({
      sourceTitle: source.title,
      sourceDocument: source,
      rules,
    })).toEqual(preview);
    expect(source.nodes[0]).toEqual({
      kind: "paragraph",
      text: "P1 from Department of Tourism",
    });
    expect(preview.dibayTitle).toBe("Visit DIBAY with Manila Bulletin");
  });

  it("board check READY / PARTIAL / UNSUPPORTED with reasons", () => {
    expect(
      resolveBoardCheckStatus({
        reachable: true,
        discoveredCount: 24,
        titleOk: true,
        bodyOk: true,
        imageOk: true,
        validImageCount: 24,
      }).status
    ).toBe("READY");
    expect(
      resolveBoardCheckStatus({
        reachable: true,
        discoveredCount: 18,
        titleOk: true,
        bodyOk: true,
        imageOk: false,
        validImageCount: 12,
      }).status
    ).toBe("PARTIAL");
  });

  it("ops status + view seed + DB unique enforcement status", () => {
    expect(
      resolveOpsStatus({
        failure: null,
        published: { communityPostId: "p1", readableOnCommunity: true },
      })
    ).toBe("published");
    expect(makeFailureAudit({ stage: "MEDIA", code: "IMAGE_HTTP_404", message: "x" }).failure_code).toBe(
      "IMAGE_HTTP_404"
    );
    expect(pickInitialViewSeed({ min: 100, max: 500 }, () => 0)).toBe(100);
    expect(BOARD_IMPORT_DB_UNIQUE_ENFORCEMENT).toBe("NOT_PROVEN");
  });
});

describe("P0 duplicate identity — primary vs fingerprint", () => {
  it("normalizes board URL variants; keeps different paths separate", () => {
    const a = normalizeSourceBoardUrl("http://www.example.com/travel/?utm_source=x");
    const b = normalizeSourceBoardUrl("https://example.com/travel/");
    expect(a).toBe(b);
    expect(normalizeSourceBoardUrl("https://example.com/news")).not.toBe(a);
    const idTravel = buildSourceBoardIdentity({ boardUrl: a });
    const dup = detectSourceBoardDuplicate({
      candidate: idTravel,
      existing: [
        {
          identity: idTravel,
          siteName: "Travel Philippines",
          sourceBoardName: "See & Do",
          targetLabel: "여행정보",
          existingBoardId: "board-1",
        },
      ],
    });
    expect(dup.duplicate).toBe(true);
  });

  it("primary identity + fingerprint change detection", () => {
    const id1 = mustIdentity(sampleDoc(), { stableArticleId: "CMS-99" });
    expect(id1.identityKind).toBe("stable_id");
    const known: KnownSourceArticleRecord = {
      identity: id1,
      contentFingerprint: id1.contentFingerprint,
      publishedPostId: "post-1",
      firstSeenAt: "2026-09-01T00:00:00.000Z",
      lastSeenAt: "2026-09-01T00:00:00.000Z",
      sourceChangedAt: null,
    };
    expect(
      decideArticleDedupe({ incoming: id1, knownByPrimaryIdentity: known }).outcome
    ).toBe("DUPLICATE_UNCHANGED");

    const idChanged = mustIdentity(
      sampleDoc({
        nodes: [
          { kind: "paragraph", text: "P1 EDITED" },
          { kind: "image", src: "https://cdn.example/a.jpg", imageId: "img-a", alt: "A" },
          { kind: "paragraph", text: "P2" },
          { kind: "image", src: "https://cdn.example/b.jpg", imageId: "img-b", alt: "B" },
          { kind: "paragraph", text: "P3" },
        ],
      }),
      { stableArticleId: "CMS-99" }
    );
    const updated = decideArticleDedupe({
      incoming: idChanged,
      knownByPrimaryIdentity: known,
    });
    expect(updated.outcome).toBe("SOURCE_UPDATED");
    expect(updated.adminHint).toBe("원문이 변경되었습니다");
    expect(
      assertPublishLinkUniqueness({
        existingPublishedPostId: "post-1",
        attemptingNewPublish: true,
      }).allowNewPost
    ).toBe(false);
  });

  it("different identity + same fingerprint → FINGERPRINT_COLLISION (no auto SAME_ARTICLE)", () => {
    const doc = sampleDoc();
    const a = mustIdentity(doc, { stableArticleId: "A" });
    const b = mustIdentity(doc, { stableArticleId: "B" });
    expect(a.contentFingerprint).toBe(b.contentFingerprint);
    expect(a.stableArticleIdentity).not.toBe(b.stableArticleIdentity);

    expect(
      canResolveSameArticle({
        primaryIdentityEquals: false,
        fingerprintEquals: true,
        evidence: { redirectOrCanonicalToKnown: false },
      })
    ).toBe(false);

    const decision = decideArticleDedupe({
      incoming: b,
      knownByPrimaryIdentity: null,
      otherWithSameFingerprint: {
        identity: a,
        contentFingerprint: a.contentFingerprint,
        publishedPostId: "post-a",
        firstSeenAt: "2026-09-01T00:00:00.000Z",
        lastSeenAt: "2026-09-01T00:00:00.000Z",
        sourceChangedAt: null,
      },
    });
    expect(decision.outcome).toBe("FINGERPRINT_COLLISION");
    expect(decision.forbidNewImportRow).toBe(false);

    expect(
      decideArticleDedupe({
        incoming: b,
        knownByPrimaryIdentity: null,
        sameArticleEvidence: {
          known: {
            identity: a,
            contentFingerprint: a.contentFingerprint,
            publishedPostId: "post-a",
            firstSeenAt: "2026-09-01T00:00:00.000Z",
            lastSeenAt: "2026-09-01T00:00:00.000Z",
            sourceChangedAt: null,
          },
          redirectOrCanonicalToKnown: true,
        },
      }).outcome
    ).toBe("SAME_ARTICLE");
  });

  it("PRIMARY_IDENTITY_MISSING when no id/url — fingerprint not used as UNIQUE key", () => {
    const r = buildSourceArticleIdentityFromDocument({
      sourceBoardId: "board-1",
      document: sampleDoc({ canonicalUrl: "" }),
      canonicalUrl: "",
      finalUrl: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PRIMARY_IDENTITY_MISSING");
  });

  it("AUTO crawl summary: 10 unchanged + 1 new → exactly 1 new Community post", () => {
    const decisions = [];
    for (let i = 0; i < 10; i++) {
      const incoming = mustIdentity(
        sampleDoc({ title: `Article ${i}`, canonicalUrl: `https://example.com/travel/a${i}` }),
        { stableArticleId: `id-${i}` }
      );
      decisions.push(
        decideArticleDedupe({
          incoming,
          knownByPrimaryIdentity: {
            identity: incoming,
            contentFingerprint: incoming.contentFingerprint,
            publishedPostId: `post-${i}`,
            firstSeenAt: "2026-09-01T00:00:00.000Z",
            lastSeenAt: "2026-09-01T00:00:00.000Z",
            sourceChangedAt: null,
          },
        })
      );
    }
    const newbie = mustIdentity(
      sampleDoc({ title: "Article 10", canonicalUrl: "https://example.com/travel/a10" }),
      { stableArticleId: "id-10" }
    );
    decisions.push(decideArticleDedupe({ incoming: newbie, knownByPrimaryIdentity: null }));
    expect(summarizeCrawlDedupe(decisions)).toMatchObject({
      discovered: 11,
      newCount: 1,
      unchangedDuplicate: 10,
      newCommunityPosts: 1,
      fingerprintCollision: 0,
    });
  });

  it("TARGET excluded; admin list kinds; duplicate != failure", () => {
    const a = mustIdentity(sampleDoc(), { stableArticleId: "CMS-1" });
    expect("targetTopicId" in a).toBe(false);
    expect(
      resolveArticleAdminListKind({
        failure: false,
        publishedPostId: "p1",
        readableOnCommunity: true,
        sourceUpdated: true,
      })
    ).toBe("source_changed");
  });
});
