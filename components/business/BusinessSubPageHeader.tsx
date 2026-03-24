import { AppBackButton } from "@/components/navigation/AppBackButton";

type Props = {
  title: string;
  backHref: string;
  /** 처리 필요 주문 건수 등 */
  titleBadge?: number;
};

/** `/mypage/settings`와 동일한 상단 바 패턴 */
export function BusinessSubPageHeader({ title, backHref, titleBadge }: Props) {
  const showBadge = titleBadge != null && titleBadge > 0;
  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-3">
      <AppBackButton backHref={backHref} ariaLabel="뒤로" />
      <h1 className="flex min-w-0 flex-1 items-center gap-2 text-lg font-semibold text-gray-900">
        <span className="truncate">{title}</span>
        {showBadge ? (
          <span className="inline-flex min-h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[12px] font-bold text-white">
            {titleBadge! > 99 ? "99+" : titleBadge}
          </span>
        ) : null}
      </h1>
    </header>
  );
}
