"use client";

import Link from "next/link";
import type { BoardListSkinProps } from "@/lib/community-board/types";

export function PromoListSkin({
  posts,
  baseHref,
}: BoardListSkinProps) {
  return (
    <div className="space-y-3">
      {posts.length === 0 ? (
        <div className="py-12 text-center text-sam-muted bg-sam-surface rounded-ui-rect">아직 게시글이 없어요.</div>
      ) : (
        posts.map((post) => {
          const thumb = post.images?.[0]?.url;
          return (
            <Link
              key={post.id}
              href={`${baseHref}/${post.id}`}
              className="flex gap-3 p-3 rounded-ui-rect border-2 border-amber-100 bg-amber-50/50 hover:bg-amber-50 transition-colors"
            >
              <div className="w-24 h-24 shrink-0 rounded-ui-rect overflow-hidden bg-sam-surface">
                {thumb ? (
                  <img src={thumb} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-amber-300 text-xs">
                    PROMO
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold text-amber-700">프로모션</span>
                <h3 className="font-semibold text-sam-fg mt-0.5 line-clamp-2">{post.title}</h3>
                <p className="text-xs text-sam-muted mt-1 line-clamp-1">{post.content}</p>
                <p className="text-xs text-sam-muted mt-2">
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
