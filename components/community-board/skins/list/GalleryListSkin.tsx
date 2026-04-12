"use client";

import Link from "next/link";
import type { BoardListSkinProps } from "@/lib/community-board/types";

export function GalleryListSkin({
  posts,
  baseHref,
}: BoardListSkinProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {posts.length === 0 ? (
        <div className="col-span-full py-12 text-center text-sam-muted">아직 글이 없어요.</div>
      ) : (
        posts.map((post) => {
          const thumb = post.images?.[0]?.url ?? null;
          return (
            <Link
              key={post.id}
              href={`${baseHref}/${post.id}`}
              className="block rounded-ui-rect overflow-hidden border border-sam-border bg-sam-surface hover:shadow-md transition-shadow"
            >
              <div className="aspect-square bg-sam-surface-muted relative">
                {thumb ? (
                  <img
                    src={thumb}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sam-meta text-sm">
                    No image
                  </div>
                )}
              </div>
              <div className="p-2">
                <h3 className="text-sm font-medium text-sam-fg line-clamp-2">{post.title}</h3>
                <p className="text-xs text-sam-muted mt-0.5">
                  {new Date(post.created_at).toLocaleDateString("ko-KR")}
                </p>
              </div>
            </Link>
          );
        })
      )}
    </div>
  );
}
