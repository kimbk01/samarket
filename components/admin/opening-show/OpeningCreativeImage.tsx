import type { OpeningImageFit } from "@/lib/opening-show/document";

/** Creative-surface image. Not a feed thumbnail: must honor contain/cover on the full frame. */
export function OpeningCreativeImage({
  src,
  alt,
  fit,
  className = "",
}: {
  src: string;
  alt: string;
  fit: OpeningImageFit;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Opening creative fit is contain|cover; SamarketThumbnail is cover-only.
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={`pointer-events-none h-full w-full select-none ${className}`}
      style={{
        objectFit: fit,
        objectPosition: "center center",
      }}
    />
  );
}
