/**
 * CONTENT FIDELITY / AUTH / TOPIC / DELETE-DEDUPE contract tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertPublishAllowedByPublicationState,
  isRepublishBlocked,
  publicationStateOperatorLabel,
} from "@/lib/external-board-import/integrity/publication-tombstone";
import { assertSourceSessionForCollect, COLLECT_GATE_LOGIN_REQUIRED } from "@/lib/external-board-import/auth/source-session";
import { buildExternalTopicProposal } from "@/lib/external-board-import/mapping/topic-proposal";
import { externalBoardDocumentToCommunityContent } from "@/lib/external-board-import/document/to-community-content";
import { findCatalogSection } from "@/lib/external-board-import/catalog/source-catalog";

const root = process.cwd();

describe("delete tombstone / republish gate", () => {
  it("blocks deleted/suppressed/hidden; allows none and republish_allowed", () => {
    expect(isRepublishBlocked("deleted")).toBe(true);
    expect(isRepublishBlocked("suppressed")).toBe(true);
    expect(isRepublishBlocked("hidden")).toBe(true);
    expect(isRepublishBlocked("none")).toBe(false);
    expect(isRepublishBlocked("republish_allowed")).toBe(false);
    expect(
      assertPublishAllowedByPublicationState({
        publicationState: "deleted",
        publishedPostId: "post-1",
      }).ok
    ).toBe(false);
    expect(
      assertPublishAllowedByPublicationState({
        publicationState: "republish_allowed",
        publishedPostId: null,
      }).ok
    ).toBe(true);
    expect(publicationStateOperatorLabel("deleted")).toContain("재게시 금지");
  });

  it("community delete routes write tombstone", () => {
    const soft = readFileSync(
      join(root, "app/api/admin/community/engine/posts/[postId]/route.ts"),
      "utf8"
    );
    const bulk = readFileSync(
      join(root, "app/api/admin/community/engine/posts/bulk-delete/route.ts"),
      "utf8"
    );
    expect(soft).toContain("suppressExternalBoardByCommunityPost");
    expect(bulk).toContain("suppressExternalBoardByCommunityPost");
    expect(
      readFileSync(
        join(root, "app/api/admin/community/external-board/articles/[id]/allow-republish/route.ts"),
        "utf8"
      )
    ).toContain("allowExternalBoardRepublish");
  });
});

describe("image / content fidelity", () => {
  it("preserves body+gallery order and never copies decorative into images list as only PASS", () => {
    const out = externalBoardDocumentToCommunityContent({
      title: "T",
      canonicalUrl: "https://example.com/a",
      feedThumbnailSrc: "https://cdn.example/thumb.jpg",
      nodes: [
        { type: "paragraph", text: "Intro" },
        { type: "image", src: "https://cdn.example/body1.jpg", role: "body" },
        {
          type: "gallery",
          images: [
            { src: "https://cdn.example/g1.jpg", role: "gallery" },
            { src: "https://cdn.example/g2.jpg", role: "gallery" },
          ],
        },
        { type: "image", src: "https://cdn.example/deco.jpg", role: "decorative" },
        { type: "caption", text: "Cap" },
      ],
    });
    expect(out.images[0]).toContain("thumb.jpg");
    expect(out.images).toContain("https://cdn.example/body1.jpg");
    expect(out.images).toContain("https://cdn.example/g1.jpg");
    expect(out.images).toContain("https://cdn.example/g2.jpg");
    expect(out.images).not.toContain("https://cdn.example/deco.jpg");
    expect(out.content).toContain("![");
    expect(out.content).toContain("Cap");
    expect(out.content).not.toContain("deco.jpg");
  });

  it("rehost path covers gallery nodes", () => {
    const rehost = readFileSync(join(root, "lib/external-board-import/media/fetch-rehost.ts"), "utf8");
    expect(rehost).toContain('node.type === "gallery"');
    const pub = readFileSync(
      join(root, "lib/external-board-import/publish/canonical-publisher.ts"),
      "utf8"
    );
    expect(pub).toContain("images: communityBody.images");
    expect(pub).toContain("assertPublishAllowedByPublicationState");
  });
});

describe("auth mode SSOT", () => {
  it("catalog sections default public; login sources need session for collect", async () => {
    expect(findCatalogSection("bsp-media-releases")?.section.authMode).toBe("public");
    const blocked = await assertSourceSessionForCollect({
      sb: {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      } as never,
      sourceId: "src-1",
      authMode: "login_required",
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.failureMessage).toBe(COLLECT_GATE_LOGIN_REQUIRED);
  });

  it("no plaintext password storage in auth module", () => {
    const auth = readFileSync(join(root, "lib/external-board-import/auth/source-session.ts"), "utf8");
    expect(auth).toContain("credential_ref");
    expect(auth.toLowerCase()).not.toMatch(/password\s*[:=]/);
  });
});

describe("topic proposal", () => {
  it("proposes without auto-create; matched when live topic exists", () => {
    const propose = buildExternalTopicProposal({
      recommendedTopicHint: "golf",
      liveTopics: [{ id: "1", name: "여행", slug: "travel" }],
    });
    expect(propose.status).toBe("propose");
    expect(propose.proposalLabel).toContain("새 DIBAY 주제 후보");

    const matched = buildExternalTopicProposal({
      recommendedTopicHint: "golf",
      liveTopics: [{ id: "2", name: "필리핀 골프", slug: "golf" }],
    });
    expect(matched.status).toBe("matched");
    expect(matched.matchedTopicId).toBe("2");
  });
});
