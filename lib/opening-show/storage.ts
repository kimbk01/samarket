/**
 * NEW Opening storage namespace. Shared Storage infra is allowed.
 * Legacy intro CMS object prefixes are forbidden (see FORBIDDEN_INTRO_STORAGE_PREFIXES).
 */
export const OPENING_SHOW_BUCKET = "opening-show-media";
export const OPENING_STORAGE_NAMESPACE = "_opening";

export const FORBIDDEN_INTRO_STORAGE_PREFIXES = [
  ["_admin/", "intro-v2"].join(""),
  ["_admin/", "intro-v3"].join(""),
  ["_admin/", "startup/product"].join(""),
] as const;

export function openingSourcePath(showId: string, mediaId: string, ext: string): string {
  return `${OPENING_STORAGE_NAMESPACE}/${showId}/${mediaId}/source.${ext}`;
}

export type OpeningDerivativeKind = "display" | "thumb" | "runtimeDisplay";

export function openingDerivativePath(
  showId: string,
  mediaId: string,
  kind: OpeningDerivativeKind
): string {
  return `${OPENING_STORAGE_NAMESPACE}/${showId}/${mediaId}/${kind}.webp`;
}

export function assertOpeningStoragePath(path: string): boolean {
  if (!path.startsWith(`${OPENING_STORAGE_NAMESPACE}/`)) return false;
  return !FORBIDDEN_INTRO_STORAGE_PREFIXES.some((prefix) => path.includes(prefix));
}
