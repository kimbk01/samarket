"use client";

import type { BoardDetailSkinProps } from "@/lib/community-board/types";

export function MagazineDetailSkin({
  post,
  showComments = true,
  showLike = true,
  showReport = true,
}: BoardDetailSkinProps) {
  const thumb = post.images?.[0]?.url;

  return (
    <article className="bg-white rounded-ui-rect overflow-hidden shadow-sm">
      {thumb && (
        <div className="aspect-[16/9] bg-gray-100">
          <img src={thumb} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900">{post.title}</h1>
        <p className="text-sm text-gray-500 mt-2">
          {post.author?.name} · {new Date(post.created_at).toLocaleDateString("ko-KR")}
        </p>
        <div className="mt-6 prose prose-gray max-w-none text-gray-700 whitespace-pre-wrap">
          {post.content}
        </div>
        {post.images && post.images.length > 1 && (
          <div className="mt-8 grid gap-4">
            {post.images.slice(1).map((img) =>
              img.url ? (
                <img
                  key={img.id}
                  src={img.url}
                  alt=""
                  className="rounded-ui-rect w-full object-cover"
                />
              ) : null
            )}
          </div>
        )}
      </div>
      <footer className="px-6 py-4 border-t flex gap-2 max-w-3xl mx-auto">
        {showLike && <button type="button" className="text-sm text-gray-600">좋아요</button>}
        {showComments && (
          <a href="#community-post-comments" className="text-sm text-gray-600 hover:text-gray-900">
            댓글
          </a>
        )}
        {showReport && <button type="button" className="text-sm text-gray-500 ml-auto">신고</button>}
      </footer>
    </article>
  );
}
