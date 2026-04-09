export function MyPageSectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1 border-b border-gray-200 pb-3">
      <h2 className="text-[14px] font-semibold text-gray-900">{title}</h2>
      {description ? <p className="text-[12px] leading-5 text-gray-500">{description}</p> : null}
    </div>
  );
}
