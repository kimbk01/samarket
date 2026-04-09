import { MYPAGE_TYPO } from "./mypage-typography";

export function MyPageSectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1 border-b border-gray-200 pb-2.5">
      <h2 className={MYPAGE_TYPO.title}>{title}</h2>
      {description ? <p className={MYPAGE_TYPO.description}>{description}</p> : null}
    </div>
  );
}
