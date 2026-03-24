"use client";

import type { BoardDetailSkinProps } from "@/lib/community-board/types";

export function GalleryDetailSkin({
  post,
  showComments = true,
  showLike = true,
  showReport = true,
}: BoardDetailSkinProps) {
  const images = post.images ?? [];
  const firstUrl = images[0]?.url;

  return (
    <article className="bg-white rounded-lg overflow-hidden">
      <div className="aspect-square max-h-[70vh] bg-gray-100 relative mx-auto">
        {firstUrl ? (
          <img
            src={firstUrl}
            alt=""
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            No image
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 p-2 overflow-x-auto">
          {images.map((img) =>
            img.url ? (
              <img
                key={img.id}
                src={img.url}
                alt=""
                className="w-16 h-16 rounded object-cover shrink-0"
              />
            ) : null
            )}
        </div>
      )}
      <div className="p-4">
        <h1 className="text-lg font-semibold text-gray-900">{post.title}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {post.author?.name} · {new Date(post.created_at).toLocaleDateString("ko-KR")}
        </p>
        {post.content && (
          <p className="mt-3 text-gray-700 text-sm whitespace-pre-wrap">{post.content}</p>
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
