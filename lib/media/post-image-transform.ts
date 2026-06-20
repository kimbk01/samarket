const POST_IMAGES_BUCKET = "post-images";
const OBJECT_PUBLIC = `/storage/v1/object/public/${POST_IMAGES_BUCKET}/`;
const RENDER_PUBLIC = `/storage/v1/render/image/public/${POST_IMAGES_BUCKET}/`;

function isTransformablePostImageUrl(url: string): boolean {
  if (!url.includes(POST_IMAGES_BUCKET)) return false;
  if (url.includes("/storage/v1/render/image/")) return false;
  return url.includes(OBJECT_PUBLIC) || url.includes(`/object/public/${POST_IMAGES_BUCKET}/`);
}

/** CSS display px × 2 (retina), clamped for feed list thumbs. */
export function postImageThumbFetchPx(displayPx: number): number {
  const d = Math.max(1, Math.round(displayPx));
  return Math.min(384, Math.max(96, d * 2));
}

/**
 * Supabase Storage Image Transform — post-images (Philife·Trade feed).
 * External URLs pass through unchanged.
 */
export function buildPostImageTransformUrl(
  raw: string | null | undefined,
  opts: { width: number; height?: number; quality?: number }
): string | null {
  const resolved = typeof raw === "string" ? raw.trim() : "";
  if (!resolved || !/^https?:\/\//i.test(resolved)) return resolved || null;
  if (!isTransformablePostImageUrl(resolved)) return resolved;

  const w = Math.max(32, Math.round(opts.width));
  const h = Math.max(32, Math.round(opts.height ?? w));
  const quality = Math.min(100, Math.max(40, Math.round(opts.quality ?? 78)));

  const renderBase = resolved.includes(OBJECT_PUBLIC)
    ? resolved.replace(OBJECT_PUBLIC, RENDER_PUBLIC)
    : resolved.replace(
        new RegExp(`/object/public/${POST_IMAGES_BUCKET}/`, "i"),
        `/render/image/public/${POST_IMAGES_BUCKET}/`
      );

  const url = new URL(renderBase);
  url.searchParams.set("width", String(w));
  url.searchParams.set("height", String(h));
  url.searchParams.set("resize", "cover");
  url.searchParams.set("quality", String(quality));
  return url.toString();
}

export function buildPostImageThumbnailFetchUrl(
  raw: string | null | undefined,
  displayPx: number
): string | null {
  const fetchPx = postImageThumbFetchPx(displayPx);
  return buildPostImageTransformUrl(raw, { width: fetchPx, height: fetchPx });
}
