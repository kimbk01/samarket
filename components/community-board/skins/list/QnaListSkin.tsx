"use client";

import Link from "next/link";
import type { BoardListSkinProps } from "@/lib/community-board/types";

export function QnaListSkin({
  posts,
  baseHref,
}: BoardListSkinProps) {
  return (
    <ul className="divide-y divide-sam-border bg-sam-surface rounded-ui-rect overflow-hidden">
      {posts.length === 0 ? (
        <li className="px-4 py-8 text-center text-sam-muted">아직 질문이 없어요.</li>
      ) : (
        posts.map((post) => (
          <li key={post.id}>
            <Link
              href={`${baseHref}/${post.id}`}
              className="block px-4 py-3 hover:bg-sam-app transition-colors"
            >
              <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800 mr-2">
                Q
              </span>
              <span className="font-medium text-sam-fg">{post.title}</span>
              <div className="flex items-center gap-2 mt-2 text-xs text-sam-meta">
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
