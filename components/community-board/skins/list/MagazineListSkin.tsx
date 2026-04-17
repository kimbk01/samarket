"use client";

import Link from "next/link";
import type { BoardListSkinProps } from "@/lib/community-board/types";

export function MagazineListSkin({
  posts,
  baseHref,
}: BoardListSkinProps) {
  if (posts.length === 0) {
    return (
      <div className="py-12 text-center text-sam-muted bg-sam-surface rounded-ui-rect">아직 글이 없어요.</div>
    );
  }
  const [featured, ...rest] = posts;
  const thumb = featured?.images?.[0]?.url;

  return (
    <div className="space-y-4">
      {featured && (
        <Link
          href={`${baseHref}/${featured.id}`}
          className="block rounded-ui-rect overflow-hidden border border-sam-border bg-sam-surface hover:shadow-lg transition-shadow"
        >
          <div className="aspect-[16/9] bg-sam-surface-muted relative">
            {thumb ? (
              <img
                src={thumb}
                alt=""
                width={960}
                height={540}
                className="h-full w-full object-cover"
                loading="eager"
                decoding="async"
                fetchPriority="high"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sam-meta">
                No image
              </div>
            )}
          </div>
          <div className="p-4">
            <h3 className="text-lg font-semibold text-sam-fg">{featured.title}</h3>
            <p className="text-sm text-sam-muted mt-1 line-clamp-2">{featured.content}</p>
            <p className="text-xs text-sam-muted mt-2">
              {new Date(featured.created_at).toLocaleDateString("ko-KR")}
            </p>
          </div>
        </Link>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {rest.map((post) => (
          <Link
            key={post.id}
            href={`${baseHref}/${post.id}`}
            className="flex gap-3 p-3 rounded-ui-rect border border-sam-border bg-sam-surface hover:bg-sam-app transition-colors"
          >
            <div className="w-20 h-20 shrink-0 rounded bg-sam-surface-muted overflow-hidden">
              {post.images?.[0]?.url ? (
                <img
                  src={post.images[0].url}
                  alt=""
                  width={80}
                  height={80}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sam-meta text-xs">
                  -
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-sam-fg line-clamp-1">{post.title}</h3>
              <p className="text-xs text-sam-muted mt-0.5">
                {new Date(post.created_at).toLocaleDateString("ko-KR")}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
