"use client";

import type { NeighborhoodCommentNode } from "@/lib/neighborhood/types";
import { formatTimeAgo } from "@/lib/utils/format";

export function CommentItem({
  node,
  depth = 0,
  onReply,
}: {
  node: NeighborhoodCommentNode;
  depth?: number;
  onReply?: (id: string) => void;
}) {
  const time =
    node.created_at && !Number.isNaN(Date.parse(node.created_at))
      ? formatTimeAgo(node.created_at, "ko-KR")
      : "";

  return (
    <div className={depth > 0 ? "ml-4 border-l border-sam-border-soft pl-3" : ""}>
      <p className="sam-text-helper font-medium text-sam-muted">{node.author_name}</p>
      <p className="mt-1 sam-text-body text-sam-fg">{node.content}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <p className="sam-text-xxs text-sam-meta">{time}</p>
        {onReply ? (
          <button type="button" className="sam-text-xxs font-medium text-sky-700 underline" onClick={() => onReply(node.id)}>
            답글
          </button>
        ) : null}
      </div>
      {node.children.length > 0 ? (
        <ul className="mt-2 list-none space-y-3 pl-0">
          {node.children.map((c) => (
            <li key={c.id}>
              <CommentItem node={c} depth={depth + 1} onReply={onReply} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
