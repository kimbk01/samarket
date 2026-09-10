/**
 * DIBAY shared `post-images` bucket — Domain / Entity ownership SSOT.
 *
 * Goal: Data Reset may delete only entity-owned objects. Never bucket purge,
 * prefix guess, or filename-pattern wipe.
 *
 * Path alone is often insufficient (especially Market `{userId}/{ts}-{uuid}`).
 * Canonical ownership for Reset is DB reference → normalized storage path.
 * Path classifiers are fail-closed guards for cross-domain preserve.
 */

import { POST_IMAGES_BUCKET } from "@/lib/media/canonical-image-contract";
import {
  isCanonicalDerivativePath,
  parseSupabasePublicObjectUrl,
} from "@/lib/media/canonical-image-path";
import { canonicalStoragePathsForOriginal } from "@/lib/media/canonical-image-upload.server";

export { POST_IMAGES_BUCKET };

export type PostImagesOwnerDomain =
  | "community"
  | "market"
  | "chat"
  | "profile"
  | "store_review"
  | "feed_ad"
  | "meeting_album"
  | "unknown";

export type PostImagesOwnershipClass =
  | "OWNERSHIP_EXPLICIT"
  | "OWNERSHIP_DERIVABLE"
  | "OWNERSHIP_AMBIGUOUS";

/** Reset cleanup disposition for an object under a requesting domain. */
export type PostImagesCleanupPolicy = "DELETE" | "PRESERVE" | "SKIP_AMBIGUOUS";

export type PostImagesWriterInventoryRow = {
  writer: string;
  domain: PostImagesOwnerDomain;
  entity: string;
  pathShape: string;
  dbColumn: string;
  deleteOwner: string;
  runtimeActive: true;
  ownershipFromPath: PostImagesOwnershipClass;
};

/**
 * Active writers that upload into `post-images` (source inventory — not guessed).
 */
export const POST_IMAGES_ACTIVE_WRITERS: readonly PostImagesWriterInventoryRow[] = [
  {
    writer: "community-crawler media rehost (PHASE C)",
    domain: "community",
    entity: "community_crawl_item_media (pre-publish)",
    pathShape: "community-crawler/{sourceId}/{crawlItemId}/{hash}.{ext}",
    dbColumn: "community_crawl_item_media.storage_path · public_url",
    deleteOwner: "crawl item CASCADE + Data Reset community (path-derived)",
    runtimeActive: true,
    ownershipFromPath: "OWNERSHIP_EXPLICIT",
  },
  {
    writer: "POST /api/community/upload-image",
    domain: "community",
    entity: "community_post (pre-bind upload)",
    pathShape: "{userId}/community/{uuid}.{ext}",
    dbColumn: "community_posts.images · community_post_images.image_url",
    deleteOwner: "Data Reset community + hard post delete lifecycle",
    runtimeActive: true,
    ownershipFromPath: "OWNERSHIP_DERIVABLE",
  },
  {
    writer: "POST /api/community/upload-image-from-url",
    domain: "community",
    entity: "community_post import",
    pathShape: "{userId}/community/import/{uuid}.{ext}",
    dbColumn: "community_posts.images · community_post_images.image_url",
    deleteOwner: "Data Reset community",
    runtimeActive: true,
    ownershipFromPath: "OWNERSHIP_DERIVABLE",
  },
  {
    writer: "POST /api/posts/upload-image",
    domain: "market",
    entity: "trade listing (posts)",
    pathShape: "{userId}/{timestamp}-{uuid}.{ext}",
    dbColumn: "posts.images · posts.thumbnail_url",
    deleteOwner: "Data Reset market + listing hard delete lifecycle",
    runtimeActive: true,
    ownershipFromPath: "OWNERSHIP_AMBIGUOUS",
  },
  {
    writer: "POST /api/community-messenger/rooms/[roomId]/images",
    domain: "chat",
    entity: "messenger image message",
    pathShape: "{userId}/community/messenger-image/{roomId}/{id}.{ext}",
    dbColumn: "community_messenger_messages payload / storagePath",
    deleteOwner: "Chat message lifecycle only (Data Reset PRESERVE — soft/detach)",
    runtimeActive: true,
    ownershipFromPath: "OWNERSHIP_EXPLICIT",
  },
  {
    writer: "POST /api/community-messenger/rooms/[roomId]/files",
    domain: "chat",
    entity: "messenger file message",
    pathShape: "{userId}/community/messenger-file/{roomId}/{uuid}.{ext}",
    dbColumn: "community_messenger_messages storagePath",
    deleteOwner: "Chat message lifecycle only (Data Reset PRESERVE)",
    runtimeActive: true,
    ownershipFromPath: "OWNERSHIP_EXPLICIT",
  },
  {
    writer: "POST /api/community-messenger/rooms/[roomId]/voice",
    domain: "chat",
    entity: "messenger voice message",
    pathShape: "{userId}/community/messenger-voice/{roomId}/{uuid}.{ext}",
    dbColumn: "community_messenger_messages storagePath",
    deleteOwner: "Chat message lifecycle only (Data Reset PRESERVE)",
    runtimeActive: true,
    ownershipFromPath: "OWNERSHIP_EXPLICIT",
  },
  {
    writer: "POST /api/me/profile/avatar",
    domain: "profile",
    entity: "profiles avatar",
    pathShape: "{userId}/profile/{uuid}.{ext}",
    dbColumn: "profiles.avatar_url",
    deleteOwner: "Member/profile policy only (Community/Market Reset PRESERVE)",
    runtimeActive: true,
    ownershipFromPath: "OWNERSHIP_EXPLICIT",
  },
  {
    writer: "POST /api/me/store-reviews/upload-image",
    domain: "store_review",
    entity: "store review image",
    pathShape: "{buyerId}/store-reviews/{orderId}/{uuid}.{ext}",
    dbColumn: "store review image fields",
    deleteOwner: "Delivery/review domain (not Community/Market Reset)",
    runtimeActive: true,
    ownershipFromPath: "OWNERSHIP_EXPLICIT",
  },
  {
    writer: "POST /api/me/feed-ad-requests/upload",
    domain: "feed_ad",
    entity: "feed ad request creative",
    pathShape: "feed-ad-requests/{userId}/{uuid}.{ext}",
    dbColumn: "feed ad request image fields",
    deleteOwner: "Ads domain (not Community/Market Reset)",
    runtimeActive: true,
    ownershipFromPath: "OWNERSHIP_EXPLICIT",
  },
  {
    writer: "POST /api/philife/meetings/[meetingId]/album",
    domain: "meeting_album",
    entity: "meeting_album_items",
    pathShape: "{userId}/meeting-album/{meetingId}/{uuid}.{ext}",
    dbColumn: "meeting_album_items.image_url",
    deleteOwner: "Philife meeting album (not Community/Market Reset)",
    runtimeActive: true,
    ownershipFromPath: "OWNERSHIP_EXPLICIT",
  },
] as const;

/** Chat attachment storage is never hard-deleted by Data Reset (B4 soft/detach). */
export const POST_IMAGES_CHAT_RESET_STORAGE_POLICY = "PRESERVE" as const;

/** Profile avatars are never deleted by Community/Market Data Reset. */
export const POST_IMAGES_PROFILE_RESET_STORAGE_POLICY = "PRESERVE" as const;

/** Ambiguous legacy objects: fail-closed — never guess-delete. */
export const POST_IMAGES_AMBIGUOUS_POLICY = "SKIP_AMBIGUOUS" as const;

export type ClassifiedPostImagesPath = {
  bucket: typeof POST_IMAGES_BUCKET;
  path: string;
  domain: PostImagesOwnerDomain;
  ownership: PostImagesOwnershipClass;
};

/**
 * Classify a bucket-relative path. Used as a cross-domain guard, not as sole
 * ownership proof for Market/Community listings.
 */
export function classifyPostImagesPath(storagePath: string): ClassifiedPostImagesPath {
  const path = storagePath.replace(/^\//, "").trim();
  const base: ClassifiedPostImagesPath = {
    bucket: POST_IMAGES_BUCKET,
    path,
    domain: "unknown",
    ownership: "OWNERSHIP_AMBIGUOUS",
  };
  if (!path || path.includes("..")) return base;

  if (/^community-crawler\//.test(path)) {
    return { ...base, domain: "community", ownership: "OWNERSHIP_EXPLICIT" };
  }
  if (/(^|\/)profile\//.test(path)) {
    return { ...base, domain: "profile", ownership: "OWNERSHIP_EXPLICIT" };
  }
  if (/\/community\/messenger-(image|file|voice)\//.test(path)) {
    return { ...base, domain: "chat", ownership: "OWNERSHIP_EXPLICIT" };
  }
  if (/\/store-reviews\//.test(path)) {
    return { ...base, domain: "store_review", ownership: "OWNERSHIP_EXPLICIT" };
  }
  if (/^feed-ad-requests\//.test(path)) {
    return { ...base, domain: "feed_ad", ownership: "OWNERSHIP_EXPLICIT" };
  }
  if (/\/meeting-album\//.test(path)) {
    return { ...base, domain: "meeting_album", ownership: "OWNERSHIP_EXPLICIT" };
  }
  if (/\/community\//.test(path)) {
    return { ...base, domain: "community", ownership: "OWNERSHIP_DERIVABLE" };
  }
  // Market + legacy bare `{userId}/{file}` — domain not in path.
  return { ...base, domain: "market", ownership: "OWNERSHIP_AMBIGUOUS" };
}

/**
 * Normalize public URL, signed URL (query stripped via object/public parse),
 * or bucket-relative path → original storage path under post-images.
 * Never pass a raw URL to storage.remove().
 */
export function normalizePostImagesObjectPath(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim();
  if (!v || v.includes("..")) return null;

  const parsed = parseSupabasePublicObjectUrl(v);
  if (parsed) {
    if (parsed.bucket !== POST_IMAGES_BUCKET) return null;
    return parsed.path;
  }

  // Signed URL or render URL may not parse as original — try object marker manually.
  const publicMarker = `/object/public/${POST_IMAGES_BUCKET}/`;
  const signMarker = `/object/sign/${POST_IMAGES_BUCKET}/`;
  for (const marker of [publicMarker, signMarker]) {
    const idx = v.indexOf(marker);
    if (idx < 0) continue;
    let path = v.slice(idx + marker.length).split("?")[0] ?? "";
    path = path.replace(/\/$/, "");
    if (!path || path.includes("..")) return null;
    return path;
  }

  if (/^https?:\/\//i.test(v)) return null;

  const rel = v.replace(/^\//, "");
  if (!rel || rel.includes("..")) return null;
  return rel;
}

/** Expand original path to original + canonical derivatives (post-images). */
export function expandPostImagesStoragePaths(originalOrAnyPath: string): string[] {
  const path = originalOrAnyPath.replace(/^\//, "").trim();
  if (!path) return [];
  if (isCanonicalDerivativePath(path)) return [path];
  return canonicalStoragePathsForOriginal(path, POST_IMAGES_BUCKET);
}

/**
 * Whether a classified path may be deleted when resetting `requestingDomain`.
 * Cross-domain and chat/profile always preserve.
 */
export function postImagesCleanupForResetDomain(
  requestingDomain: "community" | "market" | "chat" | "member" | "full",
  classified: ClassifiedPostImagesPath
): PostImagesCleanupPolicy {
  if (requestingDomain === "chat") return "PRESERVE";
  if (classified.domain === "profile") return "PRESERVE";
  if (classified.domain === "chat") return "PRESERVE";
  if (classified.domain === "store_review") return "PRESERVE";
  if (classified.domain === "feed_ad") return "PRESERVE";
  if (classified.domain === "meeting_album") return "PRESERVE";

  if (requestingDomain === "community") {
    if (classified.domain === "community") return "DELETE";
    // DB-linked market path without community segment — still ambiguous → skip
    if (classified.ownership === "OWNERSHIP_AMBIGUOUS") return "SKIP_AMBIGUOUS";
    return "PRESERVE";
  }

  if (requestingDomain === "market") {
    if (classified.domain === "community") return "PRESERVE";
    if (classified.domain === "market") {
      // Path class market is AMBIGUOUS; DELETE only when DB-linked by resolver.
      return "DELETE";
    }
    if (classified.ownership === "OWNERSHIP_AMBIGUOUS") return "SKIP_AMBIGUOUS";
    return "PRESERVE";
  }

  // member/full: this CUT does not open avatar/auth storage wipe.
  return "PRESERVE";
}

export const POST_IMAGES_BUCKET_WIDE_DELETE = "FORBIDDEN" as const;
