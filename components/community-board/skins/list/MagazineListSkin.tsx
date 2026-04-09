"use client";

import Link from "next/link";
import type { BoardListSkinProps } from "@/lib/community-board/types";

export function MagazineListSkin({
  posts,
  baseHref,
}: BoardListSkinProps) {
  if (posts.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500 bg-white rounded-ui-rect">아직 글이 없어요.</div>
    );
  }
  const [featured, ...rest] = posts;
  const thumb = featured?.images?.[0]?.url;

  return (
    <div className="space-y-4">
      {featured && (
        <Link
          href={`${baseHref}/${featured.id}`}
          className="block rounded-ui-rect overflow-hidden border border-gray-200 bg-white hover:shadow-lg transition-shadow"
        >
          <div className="aspect-[16/9] bg-gray-100 relative">
            {thumb ? (
              <img src={thumb} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                No image
              </div>
            )}
          </div>
          <div className="p-4">
            <h3 className="text-lg font-semibold text-gray-900">{featured.title}</h3>
            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{featured.content}</p>
            <p className="text-xs text-gray-500 mt-2">
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
            className="flex gap-3 p-3 rounded-ui-rect border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
          >
            <div className="w-20 h-20 shrink-0 rounded bg-gray-100 overflow-hidden">
              {post.images?.[0]?.url ? (
                <img
                  src={post.images[0].url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                  -
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-gray-900 line-clamp-1">{post.title}</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {new Date(post.created_at).toLocaleDateString("ko-KR")}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
