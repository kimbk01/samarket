"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { openDestination, openExternalUrl } from "@/lib/destination/open-destination";
import {
  resolveMessageLinkTarget,
  splitMessageTextLinks,
} from "@/lib/community-messenger/text/message-link-segments";

/**
 * 말풍선 본문의 https·www 주소를 누를 수 있는 링크로 그린다 (Owner 「D3 가~바 구현」 2026-11-09).
 *
 * - 여는 방식은 앱 링크 열기 단일 계약(`lib/destination/open-destination.ts`):
 *   같은 주소(origin) → 앱 라우터 이동(다시 불러오기 없음) · 외부 https → 앱 안 브라우저(웹은 새 탭).
 * - `<a href>` 를 쓰지 않는다 — Android WebView 가 링크를 길게 누르면 링크 끌기를 시작해 말풍선 길게 누르기(메시지 메뉴)를
 *   끊을 수 있고(2026-11-08 태블릿 실측: 끌기 그림자·메뉴 미표시 1회), iOS 는 링크 미리보기 등 WebView 자체 처리가 끼어든다.
 *   탭은 이 요소의 click 으로만 처리하고, 길게 누른 뒤 손을 떼며 생기는 click 은 말풍선이 막는다(`MessengerTimelineVirtualRow`).
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
  const router = useRouter();
  const segments = splitMessageTextLinks(content);

  const open = (href: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const target = resolveMessageLinkTarget(href, origin);
    if (target.kind === "internal") {
      openDestination(target.path, router);
      return;
    }
    void openExternalUrl(target.url);
  };

  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === "link" ? (
          <span
            key={`l${i}`}
            role="link"
            tabIndex={0}
            data-message-link=""
            className="cursor-pointer text-inherit underline decoration-current underline-offset-2 [overflow-wrap:anywhere]"
            onClick={(e: MouseEvent<HTMLSpanElement>) => {
              e.stopPropagation();
              open(seg.href);
            }}
            onKeyDown={(e: KeyboardEvent<HTMLSpanElement>) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              e.stopPropagation();
              open(seg.href);
            }}
          >
            {seg.text}
          </span>
        ) : renderText ? (
          renderText(seg.text, `t${i}`)
        ) : (
          seg.text
        )
      )}
    </>
  );
}
