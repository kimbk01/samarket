"use client";

interface CategoryEmptyStateProps {
  /** 빈 상태 메시지 */
  message?: string;
  /** 부가 설명 */
  subMessage?: string;
}

const DEFAULT_MESSAGE = "아직 글이 없어요.";
const DEFAULT_SUB = "첫 글을 올려보세요.";

export function CategoryEmptyState({
  message = DEFAULT_MESSAGE,
  subMessage = DEFAULT_SUB,
}: CategoryEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <p className="text-[15px] font-medium text-gray-700">{message}</p>
      <p className="mt-1 text-[13px] text-gray-500">{subMessage}</p>
    </div>
  );
}
