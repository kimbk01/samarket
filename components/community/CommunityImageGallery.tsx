"use client";

/** 상세/카드용 이미지 갤러리 — lazy 로드 기본 */
export function CommunityImageGallery({
  urls,
  altBase = "image",
}: {
  urls: string[];
  altBase?: string;
}) {
  if (!urls.length) return null;
  return (
    <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
      {urls.map((u, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${u}-${i}`}
          src={u}
          alt={`${altBase}-${i}`}
          className="h-28 w-full rounded-lg object-cover"
          loading="lazy"
        />
      ))}
    </div>
  );
}
