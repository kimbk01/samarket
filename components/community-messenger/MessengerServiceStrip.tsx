"use client";

import Link from "next/link";

type Item = {
  id: string;
  label: string;
  onClick?: () => void;
  href?: string;
  emoji: string;
};

/**
 * LINE 「서비스」 줄과 유사 — 가로 아이콘+짧은 라벨 (터치하기 쉬운 단순 메뉴).
 */
export function MessengerServiceStrip({
  onFindFriend,
  onCreateGroup,
}: {
  onFindFriend: () => void;
  onCreateGroup: () => void;
}) {
  const items: Item[] = [
    { id: "find", label: "친구 찾기", emoji: "🔍", onClick: onFindFriend },
    { id: "group", label: "그룹", emoji: "👥", onClick: onCreateGroup },
    { id: "trade", label: "거래", emoji: "💬", href: "/mypage/trade/chat" },
    { id: "order", label: "주문", emoji: "🛒", href: "/my/store-orders" },
  ];

  return (
    <section className="rounded-ui-rect border border-gray-200 bg-white px-3 py-4">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[14px] font-semibold text-gray-900">바로가기</h2>
        <span className="text-[11px] text-gray-400">거래·주문은 별도 유지</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {items.map((it) => {
          const body = (
            <>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-50 text-[22px]" aria-hidden>
                {it.emoji}
              </span>
              <span className="mt-1.5 block max-w-[72px] truncate text-center text-[11px] font-medium text-gray-800">{it.label}</span>
            </>
          );
          if (it.href) {
            return (
              <Link
                key={it.id}
                href={it.href}
                className="flex flex-col items-center rounded-ui-rect py-2 transition hover:bg-gray-50 active:bg-gray-100"
              >
                {body}
              </Link>
            );
          }
          return (
            <button
              key={it.id}
              type="button"
              onClick={it.onClick}
              className="flex flex-col items-center rounded-ui-rect py-2 transition hover:bg-gray-50 active:bg-gray-100"
            >
              {body}
            </button>
          );
        })}
      </div>
    </section>
  );
}
