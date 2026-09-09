/**
 * Data Reset — resolve entity-owned `post-images` objects via DB references.
 * Planner must not invent Storage paths; execute deletes only planned owned targets.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  expandPostImagesStoragePaths,
  classifyPostImagesPath,
  normalizePostImagesObjectPath,
  postImagesCleanupForResetDomain,
  POST_IMAGES_BUCKET,
  POST_IMAGES_CHAT_RESET_STORAGE_POLICY,
  type PostImagesCleanupPolicy,
  type PostImagesOwnerDomain,
  type PostImagesOwnershipClass,
} from "@/lib/media/post-images-storage-ownership";

export type DataResetStorageTarget = {
  bucket: typeof POST_IMAGES_BUCKET;
  path: string;
  domain: PostImagesOwnerDomain;
  entityType: string;
  entityId: string;
  ownership: PostImagesOwnershipClass;
  cleanupPolicy: PostImagesCleanupPolicy;
  reference: string;
};

export type ResolveStorageObjectsForResetResult = {
  ownedObjects: DataResetStorageTarget[];
  ambiguousObjects: DataResetStorageTarget[];
  preservedObjects: DataResetStorageTarget[];
  warnings: string[];
};

const SCAN_LIMIT = 2000;

function collectRawRefs(value: unknown, into: string[]): void {
  if (value == null) return;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return;
    if (t.startsWith("[")) {
      try {
        collectRawRefs(JSON.parse(t), into);
      } catch {
        into.push(t);
      }
      return;
    }
    into.push(t);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRawRefs(item, into);
    return;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const k of ["url", "image_url", "src", "storage_path", "path", "avatar_url"]) {
      if (typeof o[k] === "string") into.push(String(o[k]));
    }
  }
}

function pushTarget(
  buckets: {
    owned: DataResetStorageTarget[];
    ambiguous: DataResetStorageTarget[];
    preserved: DataResetStorageTarget[];
  },
  seen: Set<string>,
  input: {
    raw: string;
    requestingDomain: "community" | "market" | "chat";
    entityType: string;
    entityId: string;
    reference: string;
    /** When true, DB already linked this ref to the entity — market AMBIGUOUS path may DELETE. */
    dbLinked: boolean;
  }
): void {
  const original = normalizePostImagesObjectPath(input.raw);
  if (!original) {
    return;
  }

  const classified = classifyPostImagesPath(original);
  let policy = postImagesCleanupForResetDomain(input.requestingDomain, classified);

  // DB-linked market objects: path is AMBIGUOUS but entity ownership is proven by posts row.
  if (
    input.dbLinked &&
    input.requestingDomain === "market" &&
    classified.domain === "market" &&
    classified.ownership === "OWNERSHIP_AMBIGUOUS"
  ) {
    policy = "DELETE";
  }

  // DB-linked community objects under /community/ — DELETE.
  // If community post somehow references a market/profile/chat path → preserve/skip via policy.
  if (
    input.dbLinked &&
    input.requestingDomain === "community" &&
    classified.domain === "community"
  ) {
    policy = "DELETE";
  }

  const paths =
    policy === "DELETE" ? expandPostImagesStoragePaths(original) : [original];

  for (const path of paths) {
    const key = `${POST_IMAGES_BUCKET}::${path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pathClass = classifyPostImagesPath(path);
    const target: DataResetStorageTarget = {
      bucket: POST_IMAGES_BUCKET,
      path,
      domain: pathClass.domain,
      entityType: input.entityType,
      entityId: input.entityId,
      ownership: pathClass.ownership,
      cleanupPolicy: policy,
      reference: input.reference,
    };
    if (policy === "DELETE") buckets.owned.push(target);
    else if (policy === "SKIP_AMBIGUOUS") buckets.ambiguous.push(target);
    else buckets.preserved.push(target);
  }
}

function sortTargets(list: DataResetStorageTarget[]): DataResetStorageTarget[] {
  return [...list].sort((a, b) =>
    `${a.bucket}/${a.path}`.localeCompare(`${b.bucket}/${b.path}`)
  );
}

async function resolveCommunityStorage(
  sb: SupabaseClient,
  entityIds: string[] | null
): Promise<ResolveStorageObjectsForResetResult> {
  const owned: DataResetStorageTarget[] = [];
  const ambiguous: DataResetStorageTarget[] = [];
  const preserved: DataResetStorageTarget[] = [];
  const buckets = { owned, ambiguous, preserved };
  const seen = new Set<string>();
  const warnings: string[] = [];

  let postsQuery = sb
    .from("community_posts")
    .select("id,images")
    .limit(SCAN_LIMIT);
  if (entityIds?.length) {
    postsQuery = sb
      .from("community_posts")
      .select("id,images")
      .in("id", entityIds)
      .limit(SCAN_LIMIT);
  }
  const { data: posts, error: pErr } = await postsQuery;
  if (pErr) warnings.push(`community_posts_storage:${pErr.message}`);

  const ids = (posts ?? []).map((r) => String((r as { id: string }).id));
  for (const row of posts ?? []) {
    const id = String((row as { id: string }).id);
    const refs: string[] = [];
    collectRawRefs((row as { images?: unknown }).images, refs);
    for (const ref of refs) {
      pushTarget(buckets, seen, {
        raw: ref,
        requestingDomain: "community",
        entityType: "community_post",
        entityId: id,
        reference: "community_posts.images",
        dbLinked: true,
      });
    }
  }

  if (ids.length || entityIds?.length) {
    const imgIds = entityIds?.length ? entityIds : ids;
    const { data: imgs, error: iErr } = await sb
      .from("community_post_images")
      .select("id,post_id,image_url")
      .in("post_id", imgIds)
      .limit(SCAN_LIMIT * 2);
    if (iErr) warnings.push(`community_post_images_storage:${iErr.message}`);
    for (const row of imgs ?? []) {
      const postId = String((row as { post_id: string }).post_id);
      const url = (row as { image_url?: string | null }).image_url;
      if (!url) continue;
      pushTarget(buckets, seen, {
        raw: url,
        requestingDomain: "community",
        entityType: "community_post_image",
        entityId: postId,
        reference: "community_post_images.image_url",
        dbLinked: true,
      });
    }
  }

  if (!entityIds && (posts?.length ?? 0) >= SCAN_LIMIT) {
    warnings.push("community_storage_scan_truncated");
  }

  return {
    ownedObjects: sortTargets(owned),
    ambiguousObjects: sortTargets(ambiguous),
    preservedObjects: sortTargets(preserved),
    warnings,
  };
}

async function resolveMarketStorage(
  sb: SupabaseClient,
  entityIds: string[] | null
): Promise<ResolveStorageObjectsForResetResult> {
  const owned: DataResetStorageTarget[] = [];
  const ambiguous: DataResetStorageTarget[] = [];
  const preserved: DataResetStorageTarget[] = [];
  const buckets = { owned, ambiguous, preserved };
  const seen = new Set<string>();
  const warnings: string[] = [];

  let query = sb.from("posts").select("id,images,thumbnail_url").limit(SCAN_LIMIT);
  if (entityIds?.length) {
    query = sb
      .from("posts")
      .select("id,images,thumbnail_url")
      .in("id", entityIds)
      .limit(SCAN_LIMIT);
  }
  const { data: posts, error } = await query;
  if (error) warnings.push(`posts_storage:${error.message}`);

  for (const row of posts ?? []) {
    const id = String((row as { id: string }).id);
    const refs: string[] = [];
    collectRawRefs((row as { images?: unknown }).images, refs);
    collectRawRefs((row as { thumbnail_url?: unknown }).thumbnail_url, refs);
    for (const ref of refs) {
      pushTarget(buckets, seen, {
        raw: ref,
        requestingDomain: "market",
        entityType: "market_post",
        entityId: id,
        reference: "posts.images|thumbnail_url",
        dbLinked: true,
      });
    }
  }

  if (!entityIds && (posts?.length ?? 0) >= SCAN_LIMIT) {
    warnings.push("market_storage_scan_truncated");
  }

  return {
    ownedObjects: sortTargets(owned),
    ambiguousObjects: sortTargets(ambiguous),
    preservedObjects: sortTargets(preserved),
    warnings,
  };
}

/**
 * Resolve Storage objects for a Data Reset domain plan.
 * Chat → empty owned (PRESERVE attachments). Never bucket-wide listing.
 */
export async function resolveStorageObjectsForReset(input: {
  sb: SupabaseClient;
  domain: "community" | "market" | "chat";
  /** When scope=single/user with known ids; null = domain-wide scan (capped). */
  entityIds: string[] | null;
}): Promise<ResolveStorageObjectsForResetResult> {
  if (input.domain === "chat") {
    return {
      ownedObjects: [],
      ambiguousObjects: [],
      preservedObjects: [],
      warnings: [
        `chat_storage_${POST_IMAGES_CHAT_RESET_STORAGE_POLICY.toLowerCase()}_soft_detach_policy`,
      ],
    };
  }
  if (input.domain === "community") {
    return resolveCommunityStorage(input.sb, input.entityIds);
  }
  return resolveMarketStorage(input.sb, input.entityIds);
}

/** Stable identity list for planHash binding (owned DELETE targets only). */
export function storageTargetsHashIdentity(
  targets: readonly {
    bucket: string;
    path: string;
    cleanupPolicy: string;
  }[]
): Array<{ bucket: string; path: string; cleanupPolicy: string }> {
  return [...targets]
    .filter((t) => t.cleanupPolicy === "DELETE")
    .sort((a, b) => `${a.bucket}/${a.path}`.localeCompare(`${b.bucket}/${b.path}`))
    .map((t) => ({
      bucket: t.bucket,
      path: t.path,
      cleanupPolicy: t.cleanupPolicy,
    }));
}
