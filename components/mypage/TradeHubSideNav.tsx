/**
 * `/mypage/trade` 전용 — 플로팅 FAB 대신 왼쪽 고정형 사이드 메뉴(목록 내비).
 */
const MENU_ITEMS: { sectionId: string; label: string }[] = [
  { sectionId: "trade-purchases", label: "구매 내역" },
  { sectionId: "trade-sales", label: "판매 내역" },
  { sectionId: "trade-favorites", label: "찜 목록" },
  { sectionId: "trade-reviews", label: "거래후기" },
  { sectionId: "trade-chat", label: "거래채팅" },
];

export function TradeHubSideNav() {
  return (
    <aside
      className="sticky z-[1] w-[4.75rem] shrink-0 self-start pt-1 sm:w-32"
      style={{
        top: "calc(6.25rem + env(safe-area-inset-top, 0px))",
      }}
      aria-label="거래 관리 사이드 메뉴"
    >
      <nav className="max-h-[calc(100dvh-7.5rem)] overflow-y-auto rounded-ui-rect border border-ig-border bg-sam-surface py-1 shadow-sm">
        <ul className="flex flex-col">
          {MENU_ITEMS.map((item) => (
            <li key={item.sectionId} className="border-b border-[#F0F0F0] last:border-b-0">
              <a
                href={`#${item.sectionId}`}
                className="block px-2 py-2.5 text-center text-[11px] font-medium leading-snug text-foreground transition-colors hover:bg-ig-highlight active:bg-ig-highlight sm:px-3 sm:text-left sm:text-[13px] sm:leading-tight"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
