import { describe, expect, it } from "vitest";
import { defaultOperatorDraftEdit } from "@/lib/community-operator-import/draft-apply";
import { isClaimFresh } from "@/lib/community-operator-import/jobs";
import { buildPublishContent } from "@/lib/community-operator-import/publish-content";
import {
  allowsFullContent,
  allowsHiddenAttribution,
  attributionShown,
  capPolicyByRights,
  parseRightsBasis,
  type SourceRights,
} from "@/lib/community-operator-import/rights";
import { mapSourceRow } from "@/lib/community-operator-import/source-store";
import type { OperatorNormalizedArticle } from "@/lib/community-operator-import/types";

const unverified: SourceRights = { rightsBasis: "unverified", attributionRequired: true };
const permissionNoDuty: SourceRights = { rightsBasis: "permission", attributionRequired: false };
const permissionWithDuty: SourceRights = { rightsBasis: "permission", attributionRequired: true };
const ccBy: SourceRights = { rightsBasis: "cc_by", attributionRequired: false };

const article: OperatorNormalizedArticle = {
  sourceSite: "s",
  sourceBoard: "b",
  sourceBoardLabel: "B",
  canonicalUrl: "https://example.com/1",
  sourceArticleKey: "1",
  title: "세부 여행",
  author: "글쓴이",
  sourcePublishedDate: "2026-10-01T01:00:00.000Z",
  orderedContentBlocks: [
    { type: "image", url: "https://e.com/1.jpg", displaySrc: null, alt: null, caption: null },
    { type: "paragraph", text: "첫 문장입니다." },
    { type: "image", url: "https://e.com/2.jpg", displaySrc: null, alt: null, caption: null },
  ],
};

describe("republication rights", () => {
  it("public visibility is not a right: unverified sources never get full content", () => {
    expect(allowsFullContent(unverified)).toBe(false);
    expect(capPolicyByRights("full", unverified)).toBe("summary_link");
    expect(capPolicyByRights("link_only", unverified)).toBe("link_only");
    expect(capPolicyByRights("full", permissionWithDuty)).toBe("full");
  });

  it("the 출처 block can be hidden only without an attribution duty", () => {
    expect(allowsHiddenAttribution(unverified)).toBe(false);
    expect(allowsHiddenAttribution(ccBy)).toBe(false);
    expect(allowsHiddenAttribution(permissionWithDuty)).toBe(false);
    expect(allowsHiddenAttribution(permissionNoDuty)).toBe(true);
    expect(attributionShown(false, ccBy)).toBe(true);
    expect(attributionShown(false, permissionNoDuty)).toBe(false);
    expect(attributionShown(undefined, permissionNoDuty)).toBe(true);
  });

  it("unknown/absent DB values read as unverified (pre-migration rows)", () => {
    expect(parseRightsBasis(undefined)).toBe("unverified");
    expect(parseRightsBasis("bogus")).toBe("unverified");
    const row = mapSourceRow({ id: "x", engine: "rss_atom", content_policy: "full", enabled: true });
    expect(row.rights.rightsBasis).toBe("unverified");
    expect(row.contentPolicy).toBe("summary_link");
  });

  it("publish content is capped and the 출처 block forced on without rights", () => {
    const edit = { ...defaultOperatorDraftEdit(article), contentPolicy: "full" as const, showAttribution: false };
    const c = buildPublishContent({ article, edit, sourcePolicy: "summary_link", sourceName: "S", rules: [], rights: unverified });
    expect(c.policy).toBe("summary_link");
    expect(c.cappedByRights).toBe(true);
    expect(c.attributionVisible).toBe(true);
    expect(c.imageUrls).toHaveLength(1);
  });

  it("with rights and no duty: full body, every image, 출처 hidden on request", () => {
    const edit = { ...defaultOperatorDraftEdit(article), contentPolicy: "full" as const, showAttribution: false };
    const c = buildPublishContent({ article, edit, sourcePolicy: "summary_link", sourceName: "S", rules: [], rights: permissionNoDuty });
    expect(c.policy).toBe("full");
    expect(c.cappedByRights).toBe(false);
    expect(c.attributionVisible).toBe(false);
    expect(c.imageUrls).toEqual(["https://e.com/1.jpg", "https://e.com/2.jpg"]);
  });

  it("summary + link always shows the 출처 block (the link is the point)", () => {
    const edit = { ...defaultOperatorDraftEdit(article), contentPolicy: "summary_link" as const, showAttribution: false };
    expect(buildPublishContent({ article, edit, sourcePolicy: "full", sourceName: "S", rules: [], rights: permissionNoDuty }).attributionVisible).toBe(true);
  });
});

describe("job item claims", () => {
  const now = Date.parse("2026-10-16T10:00:00Z");
  it("a fresh claim blocks other runners; a stale one (dead runner) does not", () => {
    expect(isClaimFresh({ message: "processing", updated_at: "2026-10-16T09:58:00Z" }, now)).toBe(true);
    expect(isClaimFresh({ message: "processing", updated_at: "2026-10-16T09:40:00Z" }, now)).toBe(false);
    expect(isClaimFresh({ message: null, updated_at: "2026-10-16T09:59:00Z" }, now)).toBe(false);
  });
});
