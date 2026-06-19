"use client";

import type { ReactNode } from "react";
import { parseMentionTokens } from "@/lib/community-messenger/group/group-room-mention-parser";

type GroupMentionTextProps = {
  content: string;
  isMine?: boolean;
  className?: string;
};

/** Renders message body with @mention segments highlighted (Starbucks green). */
export function GroupMentionText({ content, isMine = false, className = "" }: GroupMentionTextProps) {
  const text = String(content ?? "");
  const tokens = parseMentionTokens(text);
  if (!tokens.length) {
    return <span className={className}>{text}</span>;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  tokens.forEach((token, index) => {
    if (token.start > cursor) {
      nodes.push(<span key={`t-${index}-pre`}>{text.slice(cursor, token.start)}</span>);
    }
    nodes.push(
      <span
        key={`t-${index}-m`}
        className={
          isMine
            ? "font-semibold text-white underline decoration-white/50 underline-offset-2"
            : "font-semibold text-[#006241]"
        }
      >
        {token.raw}
      </span>
    );
    cursor = token.end;
  });
  if (cursor < text.length) {
    nodes.push(<span key="tail">{text.slice(cursor)}</span>);
  }

  return <span className={className}>{nodes}</span>;
}
