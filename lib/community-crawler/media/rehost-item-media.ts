/**
 * V2-3 — rehost crawl item media into crawler durable authority.
 * SSOT: community_crawl_item_media only.
 * Does NOT write community_posts / community_post_images.
 * Does NOT mutate dibay_title / dibay_body (media independent of textual override).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { POST_IMAGES_BUCKET } from "@/lib/media/canonical-image-contract";
import {
  removeCanonicalImageAsset,
  uploadPostImageWithDerivatives,
} from "@/lib/media/canonical-image-upload.server";
import { insertCommunityCrawlRunEvent } from "@/lib/community-crawler/core/run-events";
import type { CommunityCrawlItemRow, CommunityCrawlSourceRow } from "@/lib/community-crawler/crawl-ssot";
import { coverLadderFromItemFields } from "@/lib/community-crawler/media/cover-candidate-ladder";
import {
  demoteCurrentCrawlItemMedia,
  findCrawlItemMediaByHash,
  insertCrawlItemMediaRow,
  promoteCrawlItemMediaCurrent,
  type CommunityCrawlItemMediaRole,
  type CommunityCrawlItemMediaRow,
} from "@/lib/community-crawler/media/item-media-store";
import { isCommunityCrawlMediaRehostPermitted } from "@/lib/community-crawler/media/policy";
import {
  buildCrawlMediaStoragePath,
  crawlMediaExtForMime,
  safeFetchCrawlMediaBytes,
} from "@/lib/community-crawler/media/safe-fetch-image";

export type RehostItemMediaStats = {
  attempted: number;
  uploaded: number;
  reused: number;
  invalid: number;
  skippedPolicy: boolean;
  /** @deprecated V2-3: media is independent of textual manual_override; always false. */
  skippedManualOverride: boolean;
  coverState: "VALID" | "NO_VALID_IMAGE" | "NO_CANDIDATE" | "SKIPPED";
  bodyCurrentCount: number;
};

type Candidate = {
  url: string;
  role: CommunityCrawlItemMediaRole;
  sortOrder: number;
};

function collectBodyCandidates(item: CommunityCrawlItemRow, coverUrl: string | null): Candidate[] {
  const out: Candidate[] = [];
  const body = Array.isArray(item.source_body_images) ? item.source_body_images : [];
  let sort = 0;
  for (const raw of body) {
    const u = typeof raw === "string" ? raw.trim() : "";
    if (!u) continue;
    if (coverUrl && u === coverUrl) continue;
    out.push({ url: u, role: "BODY", sortOrder: sort++ });
  }
  return out;
}

async function removeUploadedPaths(sb: SupabaseClient, originalPath: string): Promise<void> {
  await removeCanonicalImageAsset({
    sb,
    bucket: POST_IMAGES_BUCKET,
    originalPath,
  });
}

async function persistOne(input: {
  sb: SupabaseClient;
  item: CommunityCrawlItemRow;
  source: CommunityCrawlSourceRow;
  runId: string | null;
  candidate: Candidate;
  stats: RehostItemMediaStats;
}): Promise<CommunityCrawlItemMediaRow | null> {
  const { sb, item, source, runId, candidate, stats } = input;
  stats.attempted += 1;

  const fetched = await safeFetchCrawlMediaBytes(candidate.url);
  if (!fetched.ok) {
    stats.invalid += 1;
    await insertCommunityCrawlRunEvent(sb, {
      runId,
      sourceId: source.id,
      boardId: item.board_id,
      sourcePostId: item.source_post_id,
      canonicalUrl: item.canonical_url,
      phase: "MEDIA_RESOLVE",
      classification: "MEDIA_INVALID",
      errorCode: fetched.reason,
      errorMessage: candidate.url,
      httpStatus: fetched.status ?? null,
    });
    return null;
  }

  const existing = await findCrawlItemMediaByHash(sb, {
    crawlItemId: item.id,
    role: candidate.role,
    contentHash: fetched.contentHash,
  });

  if (existing) {
    if (!existing.is_current) {
      if (candidate.role === "COVER") {
        await demoteCurrentCrawlItemMedia(sb, {
          crawlItemId: item.id,
          role: "COVER",
          exceptId: existing.id,
        });
      }
      await promoteCrawlItemMediaCurrent(sb, existing.id);
    }
    if (candidate.role === "BODY" && existing.sort_order !== candidate.sortOrder) {
      await sb
        .from("community_crawl_item_media")
        .update({
          sort_order: candidate.sortOrder,
          is_current: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    }
    stats.reused += 1;
    return existing;
  }

  const ext = crawlMediaExtForMime(fetched.mime);
  const originalPath = buildCrawlMediaStoragePath({
    sourceId: source.id,
    crawlItemId: item.id,
    contentHash: fetched.contentHash,
    ext,
  });

  let uploadedPath: string | null = null;
  try {
    const uploaded = await uploadPostImageWithDerivatives({
      sb,
      originalPath,
      rawBuf: fetched.buf,
      mimeType: fetched.mime,
    });
    uploadedPath = uploaded.originalPath;
    stats.uploaded += 1;

    if (candidate.role === "COVER") {
      await demoteCurrentCrawlItemMedia(sb, {
        crawlItemId: item.id,
        role: "COVER",
      });
    }

    try {
      return await insertCrawlItemMediaRow(sb, {
        crawlItemId: item.id,
        sourceId: source.id,
        boardId: item.board_id,
        sourceUrl: fetched.sourceUrl,
        storageBucket: POST_IMAGES_BUCKET,
        storagePath: uploaded.originalPath,
        publicUrl: uploaded.publicUrl,
        mimeType: fetched.mime,
        byteSize: fetched.byteSize,
        width: fetched.width,
        height: fetched.height,
        role: candidate.role,
        contentHash: fetched.contentHash,
        sortOrder: candidate.sortOrder,
        isCurrent: true,
      });
    } catch (dbErr) {
      await removeUploadedPaths(sb, uploaded.originalPath);
      throw dbErr;
    }
  } catch (e) {
    if (uploadedPath) {
      try {
        await removeUploadedPaths(sb, uploadedPath);
      } catch {
        /* best-effort orphan cleanup */
      }
    }
    stats.invalid += 1;
    await insertCommunityCrawlRunEvent(sb, {
      runId,
      sourceId: source.id,
      boardId: item.board_id,
      sourcePostId: item.source_post_id,
      canonicalUrl: item.canonical_url,
      phase: "MEDIA_RESOLVE",
      classification: "MEDIA_INVALID",
      errorCode: "REHOST_FAILED",
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * IMAGE_OPTIONAL: failures are logged; item stays reviewable.
 * Policy short-circuit without network fetch.
 * Manual textual override does NOT block media (V2-3).
 */
export async function rehostCommunityCrawlItemMedia(input: {
  sb: SupabaseClient;
  item: CommunityCrawlItemRow;
  source: CommunityCrawlSourceRow;
  runId?: string | null;
}): Promise<RehostItemMediaStats> {
  const stats: RehostItemMediaStats = {
    attempted: 0,
    uploaded: 0,
    reused: 0,
    invalid: 0,
    skippedPolicy: false,
    skippedManualOverride: false,
    coverState: "SKIPPED",
    bodyCurrentCount: 0,
  };

  if (!isCommunityCrawlMediaRehostPermitted(input.source.media_policy)) {
    stats.skippedPolicy = true;
    return stats;
  }

  const coverLadder = coverLadderFromItemFields({
    sourceCoverCandidateUrl: input.item.source_cover_candidate_url,
    sourceCoverUrl: input.item.source_cover_url,
    sourceBodyImages: input.item.source_body_images,
  });

  let coverUrl: string | null = null;
  if (!coverLadder.length) {
    stats.coverState = "NO_CANDIDATE";
  } else {
    let coverOk = false;
    for (const url of coverLadder) {
      const row = await persistOne({
        sb: input.sb,
        item: input.item,
        source: input.source,
        runId: input.runId ?? null,
        candidate: { url, role: "COVER", sortOrder: 0 },
        stats,
      });
      if (row) {
        coverOk = true;
        coverUrl = url;
        break;
      }
    }
    stats.coverState = coverOk ? "VALID" : "NO_VALID_IMAGE";
  }

  // BODY set replacement: clear previous current BODY, then materialize in article order.
  await demoteCurrentCrawlItemMedia(input.sb, {
    crawlItemId: input.item.id,
    role: "BODY",
  });

  const bodyCandidates = collectBodyCandidates(input.item, coverUrl);
  const keptBodyHashes = new Set<string>();
  for (const candidate of bodyCandidates) {
    const row = await persistOne({
      sb: input.sb,
      item: input.item,
      source: input.source,
      runId: input.runId ?? null,
      candidate,
      stats,
    });
    if (row) keptBodyHashes.add(row.content_hash);
  }
  stats.bodyCurrentCount = keptBodyHashes.size;

  return stats;
}
