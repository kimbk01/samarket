"use client";

import { useEffect, useRef } from "react";
import type { NeighborhoodCommentNode } from "@/lib/neighborhood/types";
import { CommentItem } from "./CommentItem";

export function CommentList({
  roots,
  scrollToBottomSignal,
  onReply,
}: {
  roots: NeighborhoodCommentNode[];
  /** 댓글 등록 후 증가시키면 맨 아래로 스크롤 */
  scrollToBottomSignal?: number;
  onReply?: (id: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollToBottomSignal == null || scrollToBottomSignal <= 0) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [scrollToBottomSignal]);

  if (roots.length === 0) {
    return <p className="py-6 text-center text-[14px] text-sam-muted">첫 댓글을 남겨 보세요.</p>;
  }

  return (
    <ul className="list-none divide-y divide-sam-border-soft pl-0">
      {roots.map((n) => (
        <li key={n.id} className="py-3">
          <CommentItem node={n} onReply={onReply} />
        </li>
      ))}
      <div ref={endRef} />
    </ul>
  );
}
