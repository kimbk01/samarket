"use client";

import type { ReactNode } from "react";
import { splitMessageTextLinks } from "@/lib/community-messenger/text/message-link-segments";

/**
 * 말풍선 본문의 http(s)·www 주소를 누를 수 있는 링크로 그린다.
 * - 열기는 `<a target="_blank">` — 앱(Capacitor)은 iOS `createWebViewWith`·Android `launchIntent` 가 외부 브라우저로 연다.
 * - 글자색은 말풍선 글자색 그대로(밑줄만) — 보낸/받은 말풍선 모두 대비 유지.
 * - `renderText` 로 링크 아닌 조각만 따로 꾸민다(그룹방 @멘션 강조).
 */
export function MessengerLinkifiedText({
  content,
  renderText,
}: {
  content: string;
  renderText?: (text: string, key: string) => ReactNode;
}) {
  const segments = splitMessageTextLinks(content);
  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === "link" ? (
          <a
            key={`l${i}`}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-inherit underline decoration-current underline-offset-2 [overflow-wrap:anywhere]"
          >
            {seg.text}
          </a>
        ) : renderText ? (
          renderText(seg.text, `t${i}`)
        ) : (
          seg.text
        )
      )}
    </>
  );
}
