"use client";

type Props = { label: string; isQuestion?: boolean };

export function CommunityPostCategoryRow({ label, isQuestion }: Props) {
  return (
    <div className="px-4 pt-1">
      <div className="inline-flex max-w-full items-center gap-1.5 rounded-[4px] border border-[#E5E7EB] bg-[#F7F8FA] px-2 py-1 text-[11px] font-medium text-[#6B7280]">
        <span className="truncate">{label}</span>
        {isQuestion ? <span className="shrink-0 text-amber-800">· 질문</span> : null}
      </div>
    </div>
  );
}
