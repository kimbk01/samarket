"use client";

import { useMemo } from "react";
import { parseInterleavedMarkdownToSegments } from "@/lib/philife/interleaved-body-markdown";
import { PHILIFE_DETAIL_INTERLEAVED_TEXT_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { isImportedVideoLabel, splitPostTextWithVideos } from "@/lib/community/post-media-embed";
import { PostTextWithVideos } from "@/components/community/post-detail/PostTextWithVideos";
import { usePostImageViewer } from "@/components/common/media/PostImageViewer";

/** 이미지 앞뒤에 붙은 `join("\n\n")`·HTML 문단 끈 공백이 이중으로 벌어지지 않게 정리 */
function trimInterleavedTextForDisplay(
  segs: { kind: "text" | "img"; value: string }[],
  i: number,
  raw: string
): string {
  let v = raw;
  if (i > 0 && segs[i - 1]!.kind === "img") {
    v = v.replace(/^\n+/, "");
  }
  if (i < segs.length - 1 && segs[i + 1]!.kind === "img") {
    v = v.replace(/\n+$/, "");
  }
  return v;
}

function safeImgSrcForRender(raw: string): string | null {
  const t = (raw ?? "").trim();
  if (t.startsWith("data:image/") && t.length < 2_200_000) {
    return t;
  }
  if (t.startsWith("//") || t.startsWith("https://") || t.startsWith("http://")) {
    if (t.startsWith("//")) return "https:" + t;
    return t;
  }
  return null;
}

/**
 * Imported video = "thumbnail copy + ▶ label link". When the next text starts with that video line
 * it plays in place, so the thumbnail image right before it is not shown twice.
 */
function isImportedVideoThumbnail(segs: { kind: "text" | "img"; value: string }[], i: number): boolean {
  const next = segs[i + 1];
  if (!next || next.kind !== "text") return false;
  const first = splitPostTextWithVideos(next.value.replace(/^\s+/, ""))[0];
  return first?.kind === "video" && isImportedVideoLabel(first.label);
}

export function NeighborhoodInterleavedContent({
  content,
  /** imported Detail only — strip ivory/muted image wrappers; normal Community unchanged */
  plainMedia = false,
}: {
  content: string;
  plainMedia?: boolean;
}) {
  const segs = useMemo(() => {
    if (!content) return [];
    return parseInterleavedMarkdownToSegments(content);
  }, [content]);

  /** Images in body order (the viewer pages through these) + each segment's position in that list. */
  const { imageUrls, imageIndexBySeg } = useMemo(() => {
    const urls: string[] = [];
    const bySeg = new Map<number, number>();
    segs.forEach((s, i) => {
      if (s.kind !== "img" || !s.value) return;
      const u = safeImgSrcForRender(s.value);
      if (!u || isImportedVideoThumbnail(segs, i)) return;
      bySeg.set(i, urls.length);
      urls.push(u);
    });
    return { imageUrls: urls, imageIndexBySeg: bySeg };
  }, [segs]);

  const { openAt, viewer } = usePostImageViewer();

  const wrapClass = plainMedia
    ? "my-0.5 block w-full overflow-hidden"
    : "my-0.5 block w-full overflow-hidden rounded-ui-rect bg-sam-surface-muted";
  const imgClass = plainMedia
    ? "h-auto w-full max-h-[min(40vh,320px)] object-contain"
    : "h-auto w-full max-h-[min(40vh,320px)] object-contain bg-black/[0.02]";

  return (
    <div className="mt-4 min-w-0">
      {segs
        .map((s, i) => {
          if (s.kind === "text" && s.value) {
            const t = trimInterleavedTextForDisplay(segs, i, s.value);
            if (!t) return null;
            return <PostTextWithVideos key={i} text={t} className={PHILIFE_DETAIL_INTERLEAVED_TEXT_CLASS} />;
          }
          if (s.kind === "img" && s.value) {
            const at = imageIndexBySeg.get(i);
            if (at === undefined) return null;
            const u = imageUrls[at]!;
            return (
              <button
                key={i}
                type="button"
                onClick={() => openAt(imageUrls, at)}
                className={`${wrapClass} cursor-zoom-in`}
                aria-label={`이미지 ${at + 1} 크게 보기`}
                data-testid="post-body-image"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- body images keep their natural aspect */}
                <img
                  src={u}
                  alt=""
                  className={imgClass}
                  loading="lazy"
                  decoding="async"
                />
              </button>
            );
          }
          return null;
        })
        .filter(Boolean)}
      {viewer}
    </div>
  );
}
