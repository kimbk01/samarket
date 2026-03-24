"use client";

import Link from "next/link";
import type { BoardListSkinProps } from "@/lib/community-board/types";

export function BasicListSkin({
  posts,
  board,
  baseHref,
}: BoardListSkinProps) {
  return (
    <ul className="divide-y divide-gray-200 bg-white rounded-lg overflow-hidden">
      {posts.length === 0 ? (
        <li className="px-4 py-8 text-center text-gray-500">아직 글이 없어요.</li>
      ) : (
        posts.map((post) => (
          <li key={post.id}>
            <Link
              href={`${baseHref}/${post.id}`}
              className="block px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex flex-wrap items-center gap-2">
                {post.community_topic?.name ? (
                  <span className="shrink-0 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">
                    {post.community_topic.name}
                  </span>
                ) : null}
                <h3 className="min-w-0 flex-1 truncate font-medium text-gray-900">{post.title}</h3>
              </div>
              <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{post.content}</p>
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                {post.author?.name && <span>{post.author.name}</span>}
                <span>{new Date(post.created_at).toLocaleDateString("ko-KR")}</span>
                {post.view_count > 0 && <span>조회 {post.view_count}</span>}
              </div>
            </Link>
          </li>
        ))
      )}
    </ul>
  );
}
