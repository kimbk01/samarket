"use client";

import Link from "next/link";

export type ChatHubSecondaryTabItem = {
  href: string;
  label: string;
  active: boolean;
  /** false면 같은 페이지 내 전환 시 스크롤을 맨 위로 올리지 않음 */
  scroll?: boolean;
};

/**
 * `/chats` trade — 구매·판매, `/chats/philife` — 1:1·오픈채팅.
 * 상단 `ChatHubTopTabs` primary와 **글자 크기·색만** 맞추고, 탭 UI는 2분할 하단 보더 형태 유지.
 */
export function ChatHubSecondaryTabs({ items }: { items: ChatHubSecondaryTabItem[] }) {
  return (
    <div className="border-b border-[#DBDBDB] bg-white">
      <div className="mx-auto flex max-w-lg px-4">
        {items.map((t) => (
          <Link
            key={`${t.href}-${t.label}`}
            href={t.href}
            prefetch={false}
            scroll={t.scroll !== false}
            aria-current={t.active ? "page" : undefined}
            className={[
              "flex-1 border-b-2 px-2 py-3 text-center text-[16px] transition-colors duration-200",
              t.active
                ? "border-[#262626] font-semibold text-[#262626]"
                : "border-transparent font-medium text-[#8E8E8E] hover:text-[#262626]",
            ].join(" ")}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
