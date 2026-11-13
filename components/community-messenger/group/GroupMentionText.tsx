"use client";

import { Fragment, type ReactNode } from "react";
import { parseMentionTokens } from "@/lib/community-messenger/group/group-room-mention-parser";
import { MessengerLinkifiedText } from "@/components/community-messenger/room/MessengerLinkifiedText";

type GroupMentionTextProps = {
  content: string;
  isMine?: boolean;
  className?: string;
};

function renderMentionNodes(text: string, isMine: boolean, keyPrefix: string): ReactNode {
  const tokens = parseMentionTokens(text);
  if (!tokens.length) return <span key={keyPrefix}>{text}</span>;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  tokens.forEach((token, index) => {
    if (token.start > cursor) {
      nodes.push(<span key={`${keyPrefix}-${index}-pre`}>{text.slice(cursor, token.start)}</span>);
    }
    nodes.push(
      <span
        key={`${keyPrefix}-${index}-m`}
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
    nodes.push(<span key={`${keyPrefix}-tail`}>{text.slice(cursor)}</span>);
  }
  return <Fragment key={keyPrefix}>{nodes}</Fragment>;
}

/**
 * Renders message body with @mention segments highlighted (brand green).
 * http(s)·www 주소는 먼저 링크로 떼어 내고(주소 안의 `@` 를 멘션으로 보지 않게), 나머지 글자에만 멘션 강조를 적용한다.
 */
export function GroupMentionText({ content, isMine = false, className = "" }: GroupMentionTextProps) {
  const text = String(content ?? "");
  return (
    <span className={className}>
      <MessengerLinkifiedText content={text} renderText={(part, key) => renderMentionNodes(part, isMine, key)} />
    </span>
  );
}
