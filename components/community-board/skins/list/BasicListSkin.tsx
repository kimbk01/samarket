"use client";

import Link from "next/link";
import type { BoardListSkinProps } from "@/lib/community-board/types";

export function BasicListSkin({
  posts,
  board,
  baseHref,
}: BoardListSkinProps) {
  return (
    <ul className="divide-y divide-sam-border bg-sam-surface rounded-ui-rect overflow-hidden">
      {posts.length === 0 ? (
        <li className="px-4 py-8 text-center text-sam-muted">아직 글이 없어요.</li>
      ) : (
        posts.map((post) => (
          <li key={post.id}>
            <Link
              href={`${baseHref}/${post.id}`}
              className="block px-4 py-3 hover:bg-sam-app transition-colors"
            >
              <div className="flex flex-wrap items-center gap-2">
                {post.community_topic?.name ? (
                  <span className="shrink-0 rounded bg-sky-50 px-1.5 py-0.5 sam-text-xxs font-medium text-sky-800">
                    {post.community_topic.name}
                  </span>
                ) : null}
                <h3 className="min-w-0 flex-1 truncate font-medium text-sam-fg">{post.title}</h3>
              </div>
              <p className="text-sm text-sam-muted mt-0.5 line-clamp-1">{post.content}</p>
              <div className="flex items-center gap-2 mt-2 text-xs text-sam-meta">
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
