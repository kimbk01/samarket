#!/usr/bin/env npx tsx
/**
 * Full-bucket reconciliation for canonical image derivatives.
 *
 * Usage:
 *   npx tsx scripts/reconcile-canonical-image-derivatives.ts
 *   npx tsx scripts/reconcile-canonical-image-derivatives.ts --bucket post-images
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  BACKFILL_ALLOWED_BUCKETS,
  classifyStorageObjectPath,
  planBackfillCandidate,
  surfacesForBackfillBucket,
  type BackfillBucket,
} from "../lib/media/canonical-image-backfill.lib";
import { derivativeStoragePath } from "../lib/media/canonical-image-path";

const LIST_PAGE = 200;

function parseBucketArg(): BackfillBucket | null {
  const idx = process.argv.indexOf("--bucket");
  if (idx === -1 || !process.argv[idx + 1]) return null;
  const b = process.argv[idx + 1] as BackfillBucket;
  if (!BACKFILL_ALLOWED_BUCKETS.includes(b)) throw new Error(`bucket_not_allowed:${b}`);
  return b;
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

async function reconcileBucket(sb: SupabaseClient, bucket: BackfillBucket) {
  const surfaces = surfacesForBackfillBucket(bucket);
  const allObjects = new Set<string>();
  const queue: string[] = [""];

  while (queue.length > 0) {
    const prefix = queue.shift()!;
    const { files, subdirs } = await listFolder(sb, bucket, prefix);
    queue.push(...subdirs);
    for (const f of files) allObjects.add(f);
  }

  const byFolder = new Map<string, Set<string>>();
  for (const path of allObjects) {
    const slash = path.lastIndexOf("/");
    const folder = slash >= 0 ? path.slice(0, slash) : "";
    if (!byFolder.has(folder)) byFolder.set(folder, new Set());
    byFolder.get(folder)!.add(path);
  }

  let eligibleOriginals = 0;
  let complete = 0;
  let excludedDerivative = 0;
  let invalidObjects = 0;
  let missingDerivatives = 0;
  const remaining: { path: string; missing: string[] }[] = [];

  for (const path of allObjects) {
    const kind = classifyStorageObjectPath(path);
    if (kind === "derivative") {
      excludedDerivative += 1;
      continue;
    }
    if (kind === "invalid") {
      invalidObjects += 1;
      continue;
    }

    eligibleOriginals += 1;
    const slash = path.lastIndexOf("/");
    const folder = slash >= 0 ? path.slice(0, slash) : "";
    const folderSet = byFolder.get(folder) ?? new Set<string>();
    const existing = new Set<string>();
    for (const surface of surfaces) {
      const dPath = derivativeStoragePath(path, surface);
      if (allObjects.has(dPath) || folderSet.has(dPath)) existing.add(dPath);
    }

    const candidate = planBackfillCandidate({
      originalPath: path,
      bucket,
      existingDerivativePaths: existing,
    });

    if (!candidate) {
      complete += 1;
      continue;
    }

    missingDerivatives += candidate.missingSurfaces.length;
    remaining.push({
      path: candidate.originalPath,
      missing: candidate.missingSurfaces,
    });
  }

  return {
    bucket,
    eligibleOriginals,
    complete,
    skippedComplete: complete,
    excludedDerivativeObjects: excludedDerivative,
    invalidObjects,
    missingDerivatives,
    remainingProcessable: remaining.length,
    remainingSamples: remaining.slice(0, 25),
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const only = parseBucketArg();
  const buckets = only ? [only] : [...BACKFILL_ALLOWED_BUCKETS];

  const reports = [];
  for (const bucket of buckets) {
    console.error(`[reconcile] scanning ${bucket}...`);
    reports.push(await reconcileBucket(sb, bucket));
  }

  const totals = reports.reduce(
    (acc, r) => ({
      eligibleOriginals: acc.eligibleOriginals + r.eligibleOriginals,
      complete: acc.complete + r.complete,
      missingDerivatives: acc.missingDerivatives + r.missingDerivatives,
      remainingProcessable: acc.remainingProcessable + r.remainingProcessable,
    }),
    { eligibleOriginals: 0, complete: 0, missingDerivatives: 0, remainingProcessable: 0 }
  );

  console.log(
    JSON.stringify(
      {
        totals,
        buckets: reports,
      },
      null,
      2
    )
  );
}

void main();
