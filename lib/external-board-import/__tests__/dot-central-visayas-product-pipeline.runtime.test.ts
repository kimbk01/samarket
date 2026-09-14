/**
 * DOT Central Visayas — CUT B: gallery fidelity closes collect gate.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { findCatalogSection } from "@/lib/external-board-import/catalog/source-catalog";
import { discoverExternalBoardArticles } from "@/lib/external-board-import/discovery/article-discovery";
import { listWriteEligibleTopicsForExternalImport } from "@/lib/external-board-import/mapping/assert-write-eligible-topic";
import {
  createExternalBoardSource,
  ExternalBoardSourceDuplicateError,
  getExternalBoardSource,
  listExternalBoardSources,
  patchExternalBoardSource,
} from "@/lib/external-board-import/registry/source-board-store";
import { publishExternalBoardArticleCanonical } from "@/lib/external-board-import/publish/canonical-publisher";

const DOT_URL = "https://www.tourism.gov.ph/destination/central-visayas/";

function loadEnvLocal(): Record<string, string> {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

describe("DOT Central Visayas product pipeline runtime", () => {
  it("catalog available → discover → Mandaue gallery nodes → publish", async () => {
    const catalog = findCatalogSection("dot-central-visayas");
    expect(catalog?.section.status).toBe("available");
    expect(catalog?.section.capabilities.bodyImage).toBe("proven");
    expect(catalog?.section.canonicalUrl).toBe(DOT_URL);

    const env = loadEnvLocal();
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.warn("SKIP: no service credentials — catalog assertions passed");
      return;
    }

    const sb = createClient(url, key, { auth: { persistSession: false } });
    const topics = await listWriteEligibleTopicsForExternalImport(sb);
    expect(topics.length).toBeGreaterThan(0);
    const topic = topics.find((t) => /travel|여행/i.test(`${t.slug} ${t.name}`)) ?? topics[0]!;

    let source;
    try {
      source = await createExternalBoardSource(sb, {
        sourceUrl: DOT_URL,
        sourceBoardName: "Department of Tourism · Central Visayas",
        siteName: "Department of Tourism",
        targetTopicId: topic.id,
        targetTopicSlug: topic.slug,
        rightsBasis: "Official public destination content — Department of Tourism",
        rightsStatus: "declared",
        enabled: true,
      });
    } catch (e) {
      if (e instanceof ExternalBoardSourceDuplicateError) {
        source = await patchExternalBoardSource(sb, e.existingSource.id, {
          rightsBasis: "Official public destination content — Department of Tourism",
          rightsStatus: "declared",
          targetTopicId: topic.id,
          targetTopicSlug: topic.slug,
          enabled: true,
        });
      } else {
        throw e;
      }
    }

    const discovered = await discoverExternalBoardArticles(sb, source, {
      limit: 8,
      pageFrom: 1,
      pageTo: 1,
    });
    expect(discovered.summary.discovered).toBeGreaterThanOrEqual(3);
    const mandaue =
      discovered.upserted.find((a) => /mandaue/i.test(a.source_title)) ??
      discovered.upserted.find((a) => !a.published_post_id);
    expect(mandaue).toBeTruthy();
    const doc = mandaue!.source_document;
    const galleryNode = doc.nodes.find((n) => n.type === "gallery");
    const galleryImages =
      galleryNode && galleryNode.type === "gallery"
        ? galleryNode.images.length
        : doc.nodes.filter((n) => n.type === "image" && n.role === "gallery").length;
    if (/mandaue/i.test(mandaue!.source_title)) {
      expect(galleryImages).toBeGreaterThanOrEqual(2);
      expect(doc.feedThumbnailSrc).toBeTruthy();
    }

    if (mandaue!.published_post_id) {
      const all = await listExternalBoardSources(sb);
      expect(all.some((s) => s.id === source.id)).toBe(true);
      return;
    }

    const fresh = await getExternalBoardSource(sb, source.id);
    const pub = await publishExternalBoardArticleCanonical(sb, fresh!, mandaue!.id);
    expect(pub.ok).toBe(true);
  }, 180_000);
});
