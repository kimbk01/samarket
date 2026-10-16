"use client";

import { useMemo } from "react";
import { PostVideoEmbed } from "@/components/common/media/PostVideoEmbed";
import { splitPostTextWithVideos } from "@/lib/community/post-media-embed";

/**
 * Post body text whose standalone YouTube / Vimeo / video-file lines play in place.
 * Text without such a line renders exactly as before (one element, same class).
 */
export function PostTextWithVideos({ text, className, testId }: { text: string; className: string; testId?: string }) {
  const segs = useMemo(() => splitPostTextWithVideos(text), [text]);
  if (!segs.some((s) => s.kind === "video")) {
    return (
      <div className={className} data-testid={testId}>
        {text}
      </div>
    );
  }
  // The body's top margin belongs to the whole block, not to every text run.
  const topMargin = className.match(/(?:^|\s)(mt-\S+)/)?.[1] ?? "";
  const segClass = className.replace(/(?:^|\s)mt-\S+/, " ").trim();
  return (
    <div className={`min-w-0 space-y-3 ${topMargin}`.trim()} data-testid={testId}>
      {segs.map((s, i) =>
        s.kind === "video" ? (
          <PostVideoEmbed key={i} video={s.video} label={s.label} />
        ) : (
          <div key={i} className={segClass}>
            {s.text}
          </div>
        ),
      )}
    </div>
  );
}
