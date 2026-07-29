"use client";

interface WritePageShellProps {
  children: React.ReactNode;
}

/**
 * 글쓰기 공통 레이아웃 (헤더는 각 페이지/폼에서 사용)
 */
export function WritePageShell({ children }: WritePageShellProps) {
  return (
    <div className="min-h-screen bg-sam-app pb-24">
      {children}
    </div>
  );
}
