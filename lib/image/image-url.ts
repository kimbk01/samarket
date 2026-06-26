/**
 * DIBAY Image V2 — URL resolution (Phase 1 adapter).
 * Delegates to legacy resolvers; no bucket or path changes.
 */
import {
  resolveDeliveryMediaFetchSrc,
  resolveDeliveryMediaSurfacePreset,
  type DeliveryMediaSurfacePreset,
} from "@/lib/dibay/delivery-image-surface-presets";
import { sanitizeViewerMediaUrl } from "@/lib/media/sanitize-viewer-media-url";
import { resolveStoreProductMediaUrl } from "@/lib/media/resolve-store-product-media-url";
import { resolvePostImagePublicUrl } from "@/lib/posts/resolve-post-image-public-url";
import {
  hasCustomUserAvatar,
  isLikelyUserUploadedAvatarUrl,
  normalizeProfileAvatarUrlForDb,
  resolveUserAvatarImageSrc,
} from "@/lib/profile/user-avatar-display";

export type { DeliveryMediaSurfacePreset };

/** @see sanitizeViewerMediaUrl */
export function imageSanitizeViewerMediaUrl(url: string | null | undefined): string | null {
  return sanitizeViewerMediaUrl(url);
}

/** @see resolvePostImagePublicUrl */
export function imageResolvePostPublicUrl(raw: string | null | undefined): string {
  return resolvePostImagePublicUrl(raw);
}

/** @see resolveStoreProductMediaUrl */
export function imageResolveStoreProductMediaUrl(raw: string | null | undefined): string | null {
  return resolveStoreProductMediaUrl(raw);
}

/** @see resolveUserAvatarImageSrc */
export function imageResolveUserAvatarSrc(avatarUrl: string | null | undefined): string | null {
  return resolveUserAvatarImageSrc(avatarUrl);
}

/** @see hasCustomUserAvatar */
export function imageHasCustomUserAvatar(avatarUrl: string | null | undefined): boolean {
  return hasCustomUserAvatar(avatarUrl);
}

/** @see normalizeProfileAvatarUrlForDb */
export function imageNormalizeProfileAvatarForDb(avatarUrl: string | null | undefined): string {
  return normalizeProfileAvatarUrlForDb(avatarUrl);
}

/** @see isLikelyUserUploadedAvatarUrl */
export function imageIsLikelyUserUploadedAvatarUrl(avatarUrl: string): boolean {
  return isLikelyUserUploadedAvatarUrl(avatarUrl);
}

/** @see resolveDeliveryMediaFetchSrc */
export function imageResolveDeliveryMediaFetchSrc(src: string | null, surface: string): string | null {
  return resolveDeliveryMediaFetchSrc(src, surface);
}

/** @see resolveDeliveryMediaSurfacePreset */
export function imageResolveDeliveryMediaSurfacePreset(surface: string): DeliveryMediaSurfacePreset {
  return resolveDeliveryMediaSurfacePreset(surface);
}
