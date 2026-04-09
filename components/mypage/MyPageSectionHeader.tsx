import { MYPAGE_TYPO } from "./mypage-typography";

export function MyPageSectionHeader({
  title,
  description,
}: {
  /** 생략 시 상단 앱 헤더와 중복되지 않도록 본문에는 부제만 둡니다. */
  title?: string;
  description?: string;
}) {
  if (!title?.trim() && !description?.trim()) return null;
  return (
    <div className="space-y-1 border-b border-gray-200 pb-2.5">
      {title?.trim() ? <h2 className={MYPAGE_TYPO.title}>{title.trim()}</h2> : null}
      {description?.trim() ? (
        <p className={MYPAGE_TYPO.description}>{description.trim()}</p>
      ) : null}
    </div>
  );
}
