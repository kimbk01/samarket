"use client";

import type { BoardDetailSkinProps } from "@/lib/community-board/types";

export function QnaDetailSkin({
  post,
  showComments = true,
  showLike = true,
  showReport = true,
}: BoardDetailSkinProps) {
  return (
    <article className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="p-4 border-l-4 border-blue-500 bg-blue-50/50">
        <span className="text-xs font-semibold text-blue-700 uppercase">Question</span>
        <h1 className="text-xl font-semibold text-gray-900 mt-1">{post.title}</h1>
        <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
          {post.author?.name && <span>{post.author.name}</span>}
          <span>{new Date(post.created_at).toLocaleString("ko-KR")}</span>
        </div>
      </div>
      <div className="p-4">
        <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
          {post.content}
        </div>
        {post.images && post.images.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {post.images.map((img) =>
              img.url ? (
                <img key={img.id} src={img.url} alt="" className="max-h-48 rounded object-cover" />
              ) : null
            )}
          </div>
        )}
      </div>
      <footer className="px-4 py-3 border-t flex gap-2">
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
