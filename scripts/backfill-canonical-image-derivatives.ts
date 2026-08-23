#!/usr/bin/env npx tsx
/**
 * Backfill upload-time canonical derivatives for existing Storage objects.
 *
 * Usage:
 *   npx tsx scripts/backfill-canonical-image-derivatives.ts --dry-run --bucket post-images --limit 25
 *   npx tsx scripts/backfill-canonical-image-derivatives.ts --bucket post-images --limit 25 --cursor ""
 *   npx tsx scripts/backfill-canonical-image-derivatives.ts --bucket store-product-images --limit 50 --concurrency 2
 *
 * Idempotent: skips objects that already have all required derivatives (no overwrite).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  assertBackfillBucket,
  classifyStorageObjectPath,
  planBackfillCandidate,
  surfacesForBackfillBucket,
  type BackfillBucket,
  type BackfillCandidate,
} from "../lib/media/canonical-image-backfill.lib";
import { derivativeStoragePath } from "../lib/media/canonical-image-path";
import { buildCanonicalDerivativeBuffers, optimizePostImageOriginalBuffer } from "../lib/media/canonical-image-pipeline.server";
import type { CanonicalImageSurface } from "../lib/media/canonical-image-contract";

const LIST_PAGE = 200;
const DEFAULT_LIMIT = 25;

type CliArgs = {
  bucket: BackfillBucket;
  limit: number;
  dryRun: boolean;
  cursor: string;
};

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let bucket = "post-images";
  let limit = DEFAULT_LIMIT;
  let dryRun = false;
  let cursor = "";

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--bucket" && args[i + 1]) bucket = args[++i] as BackfillBucket;
    else if (a === "--limit" && args[i + 1]) limit = Math.max(1, Number(args[++i]) || DEFAULT_LIMIT);
    else if (a === "--cursor" && args[i + 1] !== undefined) cursor = String(args[++i] ?? "");
    else if (a === "--dry-run") dryRun = true;
  }

  return {
    bucket: assertBackfillBucket(bucket),
    limit,
    dryRun,
    cursor,
  };
}

async function listFolder(
  sb: SupabaseClient,
  bucket: BackfillBucket,
  prefix: string
): Promise<{ files: string[]; subdirs: string[] }> {
  const files: string[] = [];
  const subdirs: string[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, {
      limit: LIST_PAGE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    if (!data?.length) break;

    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) subdirs.push(path);
      else files.push(path);
    }

    if (data.length < LIST_PAGE) break;
    offset += data.length;
  }

  return { files, subdirs };
}

function existingDerivativesInFolder(
  folderFiles: Set<string>,
  originalPath: string,
  surfaces: CanonicalImageSurface[]
): Set<string> {
  const existing = new Set<string>();
  for (const surface of surfaces) {
    const dPath = derivativeStoragePath(originalPath, surface);
    if (folderFiles.has(dPath)) existing.add(dPath);
  }
  return existing;
}

async function processOne(
  sb: SupabaseClient,
  bucket: BackfillBucket,
  candidate: BackfillCandidate,
  dryRun: boolean
): Promise<{ ok: true } | { ok: false; path: string; reason: string }> {
  if (dryRun) return { ok: true };

  const { data: blob, error: dlErr } = await sb.storage.from(bucket).download(candidate.originalPath);
  if (dlErr || !blob) {
    return { ok: false, path: candidate.originalPath, reason: dlErr?.message ?? "download_failed" };
  }

  const buf = Buffer.from(await blob.arrayBuffer());
  const lower = candidate.originalPath.toLowerCase();
  const mime = lower.endsWith(".png")
    ? "image/png"
    : lower.endsWith(".gif")
      ? "image/gif"
      : lower.endsWith(".webp")
        ? "image/webp"
        : lower.endsWith(".heic")
          ? "image/heic"
          : "image/jpeg";

  let sourceBuf = buf;
  let sourceMime = mime;
  if (mime === "image/heic" || mime === "image/jpeg" || mime === "image/png") {
    try {
      const optimized = await optimizePostImageOriginalBuffer({ buf, mimeType: mime });
      sourceBuf = Buffer.from(optimized.buf);
      sourceMime = optimized.contentType;
    } catch (e) {
      return {
        ok: false,
        path: candidate.originalPath,
        reason: `optimize_failed:${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  const derivatives = await buildCanonicalDerivativeBuffers({
    buf: sourceBuf,
    mimeType: sourceMime,
    surfaces: candidate.missingSurfaces,
  });

  if (derivatives.length !== candidate.missingSurfaces.length) {
    return {
      ok: false,
      path: candidate.originalPath,
      reason: "derivative_generation_incomplete",
    };
  }

  for (const d of derivatives) {
    const dPath = derivativeStoragePath(candidate.originalPath, d.surface);
    const { error: upErr } = await sb.storage.from(bucket).upload(dPath, d.buf, {
      contentType: d.contentType,
      upsert: false,
    });
    if (upErr) {
      return { ok: false, path: candidate.originalPath, reason: `${d.surface}:${upErr.message}` };
    }
  }

  return { ok: true };
}

async function main() {
  const { bucket, limit, dryRun, cursor } = parseArgs();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const surfaces = surfacesForBackfillBucket(bucket);

  const queue: string[] = [cursor];
  const failures: { path: string; reason: string }[] = [];
  let processed = 0;
  let created = 0;
  let skippedComplete = 0;
  let excludedDerivative = 0;
  let invalidObjects = 0;
  let nextCursor = cursor;
  const samples: BackfillCandidate[] = [];

  while (queue.length > 0 && processed < limit) {
    const prefix = queue.shift()!;
    const { files, subdirs } = await listFolder(sb, bucket, prefix);
    queue.push(...subdirs);

    const folderSet = new Set(files);
    for (const path of files) {
      if (processed >= limit) break;
      const kind = classifyStorageObjectPath(path);
      if (kind === "derivative") {
        excludedDerivative += 1;
        continue;
      }
      if (kind === "invalid") {
        invalidObjects += 1;
        continue;
      }

      const existing = existingDerivativesInFolder(folderSet, path, surfaces);
      const candidate = planBackfillCandidate({
        originalPath: path,
        bucket,
        existingDerivativePaths: existing,
      });
      if (!candidate) {
        skippedComplete += 1;
        continue;
      }

      if (samples.length < 10) samples.push(candidate);

      if (dryRun) {
        processed += 1;
        created += 1;
        continue;
      }

      const result = await processOne(sb, bucket, candidate, false);
      processed += 1;
      if (result.ok) {
        created += 1;
        console.log("created", candidate.originalPath, candidate.missingSurfaces.join(","));
      } else {
        failures.push({ path: result.path, reason: result.reason });
        console.error("failed", result.path, result.reason);
      }
    }

    nextCursor = prefix;
  }

  const report = {
    bucket,
    dryRun,
    cursorStart: cursor,
    cursorEnd: nextCursor,
    processed,
    created,
    skippedComplete,
    excludedDerivativeObjects: excludedDerivative,
    invalidObjects,
    failures: failures.length,
    failurePaths: failures.slice(0, 20),
    samples: samples.map((s) => ({
      original: s.originalPath,
      missing: s.missingSurfaces,
    })),
  };

  console.log(JSON.stringify(report, null, 2));
  if (!dryRun && failures.length > 0) {
    console.error("[backfill] failures recorded:", failures.length);
  }
}

void main();
