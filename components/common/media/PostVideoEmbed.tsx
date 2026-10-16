"use client";

import { useState } from "react";
import type { PostVideo } from "@/lib/community/post-media-embed";

/**
 * In-post video — thumbnail first, the provider player loads only when tapped (no third-party
 * script on page load). Players are rebuilt from a validated id (see post-media-embed.ts) and
 * sandboxed: the embed cannot navigate the DIBAY page. A "원본에서 보기" link is always offered
 * for videos whose owner disabled embedding (the provider player then shows its own notice).
 */
export function PostVideoEmbed({ video, label }: { video: PostVideo; label?: string }) {
  const [playing, setPlaying] = useState(false);
  const vertical = video.provider === "youtube" && video.short;
  const providerName = video.provider === "youtube" ? "YouTube" : video.provider === "vimeo" ? "Vimeo" : null;
  const caption = label && !label.startsWith("▶") ? label : null;

  return (
    <figure className="my-1 min-w-0" data-testid="post-video" data-provider={video.provider}>
      <div
        className={`relative mx-auto w-full overflow-hidden rounded-ui-rect bg-black ${
          vertical ? "aspect-[9/16] max-w-[min(100%,360px)]" : "aspect-video"
        }`}
      >
        {video.provider === "file" ? (
          <video
            src={video.src}
            controls
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full bg-black object-contain"
            data-testid="post-video-file"
          />
        ) : playing ? (
          <iframe
            src={video.embedSrc}
            title={caption ?? `${providerName} video`}
            className="absolute inset-0 h-full w-full border-0"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
            data-testid="post-video-iframe"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 flex items-center justify-center"
            aria-label={`${providerName} 영상 재생`}
            data-testid="post-video-play"
          >
            {video.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- provider thumbnail, not a DIBAY asset
              <img src={video.thumbnailUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <span className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-950" />
            )}
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white ring-2 ring-white/80 group-active:scale-95">
              <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden fill="currentColor">
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            </span>
            <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[12px] font-medium text-white">{providerName}</span>
          </button>
        )}
      </div>
      <figcaption className="mt-1 flex items-center justify-between gap-2 text-[13px] text-sam-muted">
        <span className="min-w-0 truncate">{caption}</span>
        <a href={video.watchUrl} target="_blank" rel="noreferrer noopener" className="shrink-0 underline underline-offset-2" data-testid="post-video-external">
          {providerName ? `${providerName}에서 보기` : "원본 보기"}
        </a>
      </figcaption>
    </figure>
  );
}
