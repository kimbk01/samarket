"use client";

import Link from "next/link";
import type { BoardListSkinProps } from "@/lib/community-board/types";

export function QnaListSkin({
  posts,
  baseHref,
}: BoardListSkinProps) {
  return (
    <ul className="divide-y divide-gray-200 bg-white rounded-ui-rect overflow-hidden">
      {posts.length === 0 ? (
        <li className="px-4 py-8 text-center text-gray-500">아직 질문이 없어요.</li>
      ) : (
        posts.map((post) => (
          <li key={post.id}>
            <Link
              href={`${baseHref}/${post.id}`}
              className="block px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800 mr-2">
                Q
              </span>
              <span className="font-medium text-gray-900">{post.title}</span>
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                {post.author?.name && <span>{post.author.name}</span>}
                <span>{new Date(post.created_at).toLocaleDateString("ko-KR")}</span>
                {(post.comment_count ?? 0) > 0 && (
                  <span>댓글 {post.comment_count}</span>
                )}
              </div>
            </Link>
          </li>
        ))
      )}
    </ul>
  );
}
